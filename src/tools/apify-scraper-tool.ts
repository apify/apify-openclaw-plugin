import { Type } from "@sinclair/typebox";
import { ApifyClient } from "apify-client";
import { jsonResult, readStringParam, stringEnum } from "openclaw/plugin-sdk";
import type { AnyAgentTool } from "openclaw/plugin-sdk";
import {
  CacheEntry,
  DEFAULT_CACHE_TTL_MINUTES,
  ToolInputError,
  normalizeCacheKey,
  readCache,
  resolveCacheTtlMs,
  wrapExternalContent,
  writeCache,
} from "../util.js";
import {
  createApifyClient,
  isToolEnabled,
  parsePluginConfig,
  resolveApiKey,
  resolveBaseUrl,
  resolveEnabled,
  truncateResults,
  TERMINAL_STATUSES,
} from "../apify-client.js";

// ---------------------------------------------------------------------------
// Cache — stores completed run results (keyed by runId) to avoid re-fetching
// dataset items for runs that already succeeded. TTL is configurable via
// plugin config `cacheTtlMinutes`.
// ---------------------------------------------------------------------------

const SCRAPER_CACHE = new Map<string, CacheEntry<Record<string, unknown>>>();

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const RunRefSchema = Type.Object({
  runId: Type.String(),
  actorId: Type.String(),
  datasetId: Type.String(),
  label: Type.Optional(Type.String()),
});

const ApifyScraperSchema = Type.Object({
  action: stringEnum(["discover", "start", "collect"] as const, {
    description:
      "'discover': search Apify Store by keyword OR fetch an Actor's input schema. " +
      "'start': run any Apify Actor by ID. 'collect': get results from previously started runs.",
  }),

  // discover — search Apify Store
  query: Type.Optional(
    Type.String({
      description:
        "Keywords to search the Apify Store (e.g. 'amazon price scraper'). Used when action='discover' to find relevant Actors.",
    }),
  ),

  // discover — fetch Actor schema, also used by start
  actorId: Type.Optional(
    Type.String({
      description:
        "Actor ID or slug (e.g. 'apify~google-search-scraper' or 'compass~crawler-google-places'). " +
        "When action='discover': fetches the Actor's input schema. " +
        "When action='start': the Actor to run.",
    }),
  ),

  // start
  input: Type.Optional(
    Type.Record(Type.String(), Type.Unknown(), {
      description:
        "JSON input for the Actor. Use action='discover' with actorId first to know what parameters the Actor accepts.",
    }),
  ),
  label: Type.Optional(
    Type.String({
      description: "Optional label to identify this run in the collect results.",
    }),
  ),

  // collect
  runs: Type.Optional(
    Type.Array(RunRefSchema, {
      description: "Run references returned by the 'start' action.",
    }),
  ),
});

// ---------------------------------------------------------------------------
// Discover action — synchronous (metadata calls, no Actor runs)
// ---------------------------------------------------------------------------

async function handleDiscover(params: {
  query?: string;
  actorId?: string;
  client: ApifyClient;
}): Promise<Record<string, unknown>> {
  const { query, actorId, client } = params;

  if (!query && !actorId) {
    throw new ToolInputError(
      "action='discover' requires either 'query' (to search the Apify Store) or 'actorId' (to fetch an Actor's input schema).",
    );
  }

  // Fetch Actor schema when actorId provided
  if (actorId) {
    const buildClient = await client.actor(actorId).defaultBuild();
    const build = await buildClient.get();
    if (!build) {
      throw new ToolInputError(`No build found for Actor '${actorId}'. Check the Actor ID.`);
    }
    const actorDef = build.actorDefinition;
    // inputSchema: prefer actorDefinition.input (object), fall back to build.inputSchema (deprecated JSON string)
    const inputSchema = actorDef?.input
      ? JSON.stringify(actorDef.input)
      : (build.inputSchema ?? null);
    const readme = actorDef?.readme ?? build.readme ?? null;
    const actorInfo = await client.actor(actorId).get();
    return {
      action: "discover",
      actorId,
      name: actorInfo?.name ?? "",
      title: actorInfo?.title ?? "",
      username: actorInfo?.username ?? "",
      description: actorInfo?.description ?? "",
      inputSchema,
      readme: readme ? String(readme).slice(0, 3000) : null,
      tip: `Use action='start' with actorId='${actorInfo?.username ?? ""}~${actorInfo?.name ?? ""}' and the input parameters from inputSchema.`,
    };
  }

  // Search Apify Store
  const storeResult = await client.store().list({ search: query!, limit: 10, sortBy: "relevance" });
  const actors = storeResult.items ?? [];
  const lines: string[] = [`## Apify Store results for: "${query}"`, ""];

  for (const actor of actors) {
    const slug = `${actor.username}~${actor.name}`;
    const runs = actor.stats?.totalRuns ? ` · ${actor.stats.totalRuns.toLocaleString()} runs` : "";
    const pricing = actor.currentPricingInfo?.pricingModel
      ? ` · ${actor.currentPricingInfo.pricingModel}`
      : "";
    lines.push(`### ${actor.title || actor.name}`);
    lines.push(`**ID**: \`${slug}\`${runs}${pricing}`);
    if (actor.description) lines.push(actor.description.slice(0, 200));
    lines.push("");
  }

  lines.push(
    `Tip: Use action='discover' with actorId='<ID>' to fetch the Actor's input schema, then action='start' to run it.`,
  );

  return {
    action: "discover",
    query,
    count: actors.length,
    text: lines.join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Start action
// ---------------------------------------------------------------------------

async function handleStart(params: {
  actorId: string;
  input: Record<string, unknown>;
  label?: string;
  client: ApifyClient;
}): Promise<Record<string, unknown>> {
  const run = await params.client.actor(params.actorId).start(params.input);

  return {
    action: "start",
    message: "Actor run started. Use action='collect' with the runs array to fetch results.",
    runs: [
      {
        runId: run.id,
        actorId: params.actorId,
        datasetId: run.defaultDatasetId,
        status: run.status,
        ...(params.label ? { label: params.label } : {}),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Collect action
// ---------------------------------------------------------------------------

async function handleCollect(params: {
  runs: Record<string, unknown>[];
  client: ApifyClient;
  cacheTtlMs: number;
}): Promise<Record<string, unknown>> {
  if (!params.runs?.length) {
    throw new ToolInputError("'collect' action requires 'runs' array.");
  }

  const results = await Promise.allSettled(
    params.runs.map(async (runRef) => {
      const runId = readStringParam(runRef, "runId", { required: true });
      const actorId = readStringParam(runRef, "actorId", { required: true });
      const datasetId = readStringParam(runRef, "datasetId", { required: true });
      const label = readStringParam(runRef, "label");

      const cacheKey = normalizeCacheKey(`apify-scraper:run:${runId}`);
      const cached = readCache(SCRAPER_CACHE, cacheKey);
      if (cached) {
        return { ...cached.value, cached: true };
      }

      const runInfo = await params.client.run(runId).get();
      if (!runInfo) {
        return { actorId, runId, status: "UNKNOWN", error: "Run not found", ...(label ? { label } : {}) } as Record<string, unknown>;
      }

      if (!TERMINAL_STATUSES.has(runInfo.status)) {
        return { actorId, runId, status: runInfo.status, pending: true, ...(label ? { label } : {}) } as Record<string, unknown>;
      }

      if (runInfo.status !== "SUCCEEDED") {
        return { actorId, runId, status: runInfo.status, error: `Run ended with status: ${runInfo.status}`, ...(label ? { label } : {}) } as Record<string, unknown>;
      }

      const dataset = await params.client.dataset(datasetId).listItems();
      const items = dataset.items;

      const rawText = truncateResults(JSON.stringify(items, null, 2));
      const wrapped = wrapExternalContent(rawText, {
        source: `apify_scraper:${actorId}`,
        includeWarning: false,
      });

      const payload: Record<string, unknown> = {
        actorId,
        runId,
        status: "SUCCEEDED",
        resultCount: items.length,
        text: wrapped,
        externalContent: { untrusted: true, source: "apify_scraper", wrapped: true },
        fetchedAt: new Date().toISOString(),
        ...(label ? { label } : {}),
      };

      writeCache(SCRAPER_CACHE, cacheKey, payload, params.cacheTtlMs);
      return payload;
    }),
  );

  const completed: Record<string, unknown>[] = [];
  const pending: Record<string, unknown>[] = [];
  const errors: Record<string, unknown>[] = [];

  for (const result of results) {
    if (result.status === "rejected") {
      errors.push({ error: result.reason instanceof Error ? result.reason.message : String(result.reason) });
      continue;
    }
    const value = result.value;
    if (value.pending) pending.push(value);
    else if (value.error) errors.push(value);
    else completed.push(value);
  }

  return {
    action: "collect",
    allDone: pending.length === 0,
    message:
      pending.length === 0
        ? `All ${completed.length} run(s) completed.`
        : `${completed.length} completed, ${pending.length} still running. Call collect again for pending runs.`,
    completed,
    ...(pending.length ? { pending } : {}),
    ...(errors.length ? { errors } : {}),
  };
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

const TOOL_DESCRIPTION = `Universal Apify Actor runner for web scraping and data extraction.

WORKFLOW:
1. action="start" + actorId + input → fires the Actor run, returns runId/datasetId
2. action="collect" + runs=[...] → polls status, returns results when done
3. action="discover" + actorId → fetch input schema + README (use when you need to know what params an Actor accepts)
4. action="discover" + query → search Apify Store for Actors by keyword

Actor ID format: "username~actor-name" (tilde, NOT slash). E.g. "apify~google-search-scraper", "compass~crawler-google-places".
Use action="discover" with actorId to get the full input schema and README from Apify before running an unfamiliar Actor.

Domain skills (apify-market-research, apify-lead-generation, etc.) provide Actor selection tables for common use cases — consult them if active, but they are optional.

## Known Actors

### Instagram (12)
| Actor ID | Best For |
|----------|----------|
| apify~instagram-profile-scraper | Profile data, follower counts, bio |
| apify~instagram-post-scraper | Post details, engagement metrics |
| apify~instagram-comment-scraper | Comment extraction, sentiment |
| apify~instagram-hashtag-scraper | Hashtag content, trending topics |
| apify~instagram-hashtag-stats | Hashtag performance metrics |
| apify~instagram-reel-scraper | Reels content and metrics |
| apify~instagram-search-scraper | Search users, places, hashtags |
| apify~instagram-tagged-scraper | Posts tagged with specific accounts |
| apify~instagram-followers-count-scraper | Follower count tracking |
| apify~instagram-scraper | Comprehensive Instagram data |
| apify~instagram-api-scraper | API-based Instagram access |
| apify~export-instagram-comments-posts | Bulk comment/post export |

### Facebook (14)
| Actor ID | Best For |
|----------|----------|
| apify~facebook-pages-scraper | Page data, metrics, contact info |
| apify~facebook-page-contact-information | Emails, phones from pages |
| apify~facebook-posts-scraper | Post content and engagement |
| apify~facebook-comments-scraper | Comment extraction |
| apify~facebook-likes-scraper | Reaction analysis |
| apify~facebook-reviews-scraper | Page reviews |
| apify~facebook-groups-scraper | Group content and members |
| apify~facebook-events-scraper | Event data |
| apify~facebook-ads-scraper | Ad creative and targeting |
| apify~facebook-search-scraper | Search results |
| apify~facebook-reels-scraper | Reels content |
| apify~facebook-photos-scraper | Photo extraction |
| apify~facebook-marketplace-scraper | Marketplace listings |
| apify~facebook-followers-following-scraper | Follower/following lists |

### TikTok (14)
| Actor ID | Best For |
|----------|----------|
| clockworks~tiktok-scraper | Comprehensive TikTok data |
| clockworks~free-tiktok-scraper | Free TikTok extraction |
| clockworks~tiktok-profile-scraper | Profile data |
| clockworks~tiktok-video-scraper | Video details and metrics |
| clockworks~tiktok-comments-scraper | Comment extraction |
| clockworks~tiktok-followers-scraper | Follower lists |
| clockworks~tiktok-user-search-scraper | Find users by keywords |
| clockworks~tiktok-hashtag-scraper | Hashtag content |
| clockworks~tiktok-sound-scraper | Trending sounds |
| clockworks~tiktok-ads-scraper | Ad content |
| clockworks~tiktok-discover-scraper | Discover page content |
| clockworks~tiktok-explore-scraper | Explore content |
| clockworks~tiktok-trends-scraper | Trending content |
| clockworks~tiktok-live-scraper | Live stream data |

### YouTube (5)
| Actor ID | Best For |
|----------|----------|
| streamers~youtube-scraper | Video data and metrics |
| streamers~youtube-channel-scraper | Channel information |
| streamers~youtube-comments-scraper | Comment extraction |
| streamers~youtube-shorts-scraper | Shorts content |
| streamers~youtube-video-scraper-by-hashtag | Videos by hashtag |

### Google Maps (4)
| Actor ID | Best For |
|----------|----------|
| compass~crawler-google-places | Business listings, ratings, contact info |
| compass~google-maps-extractor | Detailed business data |
| compass~Google-Maps-Reviews-Scraper | Review extraction |
| poidata~google-maps-email-extractor | Email discovery from listings |

### Other (7)
| Actor ID | Best For |
|----------|----------|
| apify~google-search-scraper | Google search results |
| apify~google-trends-scraper | Google Trends data |
| voyager~booking-scraper | Booking.com hotel data |
| voyager~booking-reviews-scraper | Booking.com reviews |
| maxcopell~tripadvisor-reviews | TripAdvisor reviews |
| vdrmota~contact-info-scraper | Contact enrichment from URLs |
| apify~e-commerce-scraping-tool | Products, reviews, sellers (Amazon, Walmart, 50+ stores) |

## Use Case Quick Reference
| Goal | Actors |
|------|--------|
| Lead generation | compass~crawler-google-places, poidata~google-maps-email-extractor, vdrmota~contact-info-scraper |
| Market research | compass~crawler-google-places, apify~google-trends-scraper, voyager~booking-scraper |
| Competitor analysis | apify~facebook-pages-scraper, apify~facebook-ads-scraper, apify~instagram-profile-scraper |
| Trend tracking | apify~google-trends-scraper, clockworks~tiktok-trends-scraper, apify~instagram-hashtag-stats |
| Brand monitoring | compass~Google-Maps-Reviews-Scraper, apify~instagram-tagged-scraper, apify~facebook-reviews-scraper |
| Influencer discovery | apify~instagram-profile-scraper, clockworks~tiktok-profile-scraper, streamers~youtube-channel-scraper |
| Content analytics | apify~instagram-post-scraper, clockworks~tiktok-scraper, streamers~youtube-scraper |
| Audience analysis | apify~instagram-followers-count-scraper, clockworks~tiktok-followers-scraper |
| E-commerce | apify~e-commerce-scraping-tool |

EXAMPLES:
  Schema:  { action: "discover", actorId: "compass~crawler-google-places" }
  Search:  { action: "discover", query: "linkedin company scraper" }
  Start:   { action: "start", actorId: "apify~google-search-scraper", input: { queries: ["OpenAI"], maxPagesPerQuery: 1 }, label: "search" }
  Collect: { action: "collect", runs: [{ runId: "...", actorId: "...", datasetId: "..." }] }`;

export function createApifyScraperTool(options?: {
  pluginConfig?: Record<string, unknown>;
  /** Inject a client for testing. When omitted, a real ApifyClient is created. */
  client?: ApifyClient;
}): AnyAgentTool | null {
  const config = parsePluginConfig(options?.pluginConfig);
  const apiKey = resolveApiKey(config);
  if (!resolveEnabled({ config, apiKey })) return null;
  if (!isToolEnabled(config, "apify_scraper")) return null;

  const baseUrl = resolveBaseUrl(config);
  const cacheTtlMs = resolveCacheTtlMs(config.cacheTtlMinutes, DEFAULT_CACHE_TTL_MINUTES);
  const client = options?.client ?? createApifyClient(apiKey!, baseUrl);

  return {
    label: "Apify Scraper",
    name: "apify_scraper",
    description: TOOL_DESCRIPTION,
    parameters: ApifyScraperSchema,
    execute: async (_toolCallId, args) => {
      const typedArgs = args as Record<string, unknown>;
      const action = readStringParam(typedArgs, "action", { required: true });

      if (!apiKey) {
        return jsonResult({
          error: "missing_api_key",
          message: "Set APIFY_API_KEY env var or configure apiKey in the apify-openclaw-integration plugin config.",
        });
      }

      switch (action) {
        case "discover":
          return jsonResult(
            await handleDiscover({
              query: readStringParam(typedArgs, "query"),
              actorId: readStringParam(typedArgs, "actorId"),
              client,
            }),
          );
        case "start": {
          const actorId = readStringParam(typedArgs, "actorId", { required: true });
          const rawInput = typedArgs.input;
          const input =
            rawInput && typeof rawInput === "object" && !Array.isArray(rawInput)
              ? (rawInput as Record<string, unknown>)
              : {};
          return jsonResult(
            await handleStart({
              actorId,
              input,
              label: readStringParam(typedArgs, "label"),
              client,
            }),
          );
        }
        case "collect":
          return jsonResult(
            await handleCollect({
              runs: typedArgs.runs as Record<string, unknown>[],
              client,
              cacheTtlMs,
            }),
          );
        default:
          throw new ToolInputError(`Unknown action: "${action}". Use "discover", "start", or "collect".`);
      }
    },
  };
}
