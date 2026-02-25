import { Type } from "@sinclair/typebox";
import { jsonResult, readNumberParam, readStringParam, stringEnum } from "openclaw/plugin-sdk";
import type { AnyAgentTool } from "openclaw/plugin-sdk";
import {
  CacheEntry,
  DEFAULT_CACHE_TTL_MINUTES,
  ToolInputError,
  normalizeCacheKey,
  readCache,
  readStringArrayParam,
  resolveCacheTtlMs,
  wrapExternalContent,
  writeCache,
} from "../util.js";
import {
  getApifyDatasetItems,
  getApifyRunStatus,
  isToolEnabled,
  parsePluginConfig,
  pushField,
  rawDataBlock,
  resolveApiKey,
  resolveBaseUrl,
  resolveEnabled,
  resolveMaxResults,
  startApifyActorRun,
  str,
  truncateResults,
  TERMINAL_STATUSES,
} from "../apify-client.js";

// ---------------------------------------------------------------------------
// Cache & constants
// ---------------------------------------------------------------------------

const CACHE = new Map<string, CacheEntry<Record<string, unknown>>>();

const SOURCES = ["google_maps", "booking", "tripadvisor"] as const;
type Source = (typeof SOURCES)[number];

const ACTOR_IDS: Record<Source, string> = {
  google_maps: "compass/crawler-google-places",
  booking: "voyager/booking-scraper",
  tripadvisor: "maxcopell/tripadvisor-reviews",
};

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const RequestSchema = Type.Object({
  source: stringEnum(SOURCES, {
    description:
      "google_maps: local businesses, restaurants, services with reviews (Google Maps). " +
      "booking: hotel/accommodation listings from Booking.com. " +
      "tripadvisor: hotels, restaurants, attractions from TripAdvisor.",
  }),
  queries: Type.Optional(
    Type.Array(Type.String(), {
      description: "Search terms (e.g. 'coffee shops in Austin TX'). One actor run per query.",
    }),
  ),
  urls: Type.Optional(
    Type.Array(Type.String(), {
      description: "Direct place/listing URLs to scrape.",
    }),
  ),
  location: Type.Optional(
    Type.String({
      description: "Geographic filter (e.g. 'New York', 'London'). For google_maps queries.",
    }),
  ),
  maxResults: Type.Optional(
    Type.Number({ minimum: 1, maximum: 200, description: "Max results per run (default: 20)." }),
  ),
  includeReviews: Type.Optional(
    Type.Boolean({
      description: "Include customer reviews in results (default: false). Increases run time.",
    }),
  ),
  maxReviews: Type.Optional(
    Type.Number({ minimum: 1, maximum: 100, description: "Max reviews per place (default: 10). Only used when includeReviews=true." }),
  ),
  actorInput: Type.Optional(
    Type.Record(Type.String(), Type.Unknown(), {
      description: "Advanced actor-specific input parameters merged into the run.",
    }),
  ),
});

const RunRefSchema = Type.Object({
  runId: Type.String(),
  source: stringEnum(SOURCES),
  datasetId: Type.String(),
});

const MarketResearchSchema = Type.Object({
  action: stringEnum(["start", "collect"] as const, {
    description: "'start': fire scraping runs. 'collect': fetch results from started runs.",
  }),
  requests: Type.Optional(Type.Array(RequestSchema, { description: "Requests for 'start' action." })),
  runs: Type.Optional(Type.Array(RunRefSchema, { description: "Run references from 'start' response." })),
});

// ---------------------------------------------------------------------------
// Input builders
// ---------------------------------------------------------------------------

interface PreparedRun {
  source: Source;
  actorId: string;
  input: Record<string, unknown>;
}

function buildInput(req: Record<string, unknown>, source: Source, maxResults: number): Record<string, unknown> {
  const queries = readStringArrayParam(req, "queries");
  const urls = readStringArrayParam(req, "urls");
  const actorInput =
    req.actorInput && typeof req.actorInput === "object" && !Array.isArray(req.actorInput)
      ? (req.actorInput as Record<string, unknown>)
      : {};

  switch (source) {
    case "google_maps":
      return {
        ...(queries?.length ? { searchStringsArray: queries } : {}),
        ...(urls?.length ? { startUrls: urls.map((u) => ({ url: u })) } : {}),
        maxCrawledPlacesPerSearch: maxResults,
        includeHistogram: false,
        includeOpeningHours: true,
        includeReviews: req.includeReviews ?? false,
        maxReviews: req.includeReviews ? ((req.maxReviews as number) ?? 10) : 0,
        language: req.location ? undefined : "en",
        ...actorInput,
      };
    case "booking":
      return {
        ...(urls?.length ? { startUrls: urls.map((u) => ({ url: u })) } : {}),
        ...(queries?.length ? { search: queries[0] } : {}),
        maxItems: maxResults,
        ...actorInput,
      };
    case "tripadvisor":
      return {
        ...(urls?.length ? { startUrls: urls.map((u) => ({ url: u })) } : {}),
        ...(queries?.length ? { query: queries[0] } : {}),
        maxItems: maxResults,
        ...actorInput,
      };
  }
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatGoogleMapsItem(item: Record<string, unknown>): string {
  const lines: string[] = [];
  const name = str(item.title || item.name);
  const rating = item.totalScore ?? item.rating;
  const reviewCount = item.reviewsCount ?? item.userRatingsTotal;
  lines.push(`## ${name}${rating ? ` (${rating}/5)` : ""}`);
  pushField(lines, "Address", item.address || item.formattedAddress);
  pushField(lines, "Phone", item.phone || item.phoneUnformatted);
  pushField(lines, "Website", item.website);
  pushField(lines, "Category", item.categoryName || item.types);
  if (reviewCount) lines.push(`**Reviews**: ${String(reviewCount).toLocaleString()}`);
  pushField(lines, "Price", item.price);
  if (Array.isArray(item.openingHours) && item.openingHours.length) {
    lines.push(`**Hours**: ${(item.openingHours as { day: string; hours: string }[]).map((h) => `${h.day}: ${h.hours}`).join(", ")}`);
  }
  if (Array.isArray(item.reviews) && item.reviews.length) {
    const topReview = (item.reviews as { text?: string; stars?: number; publishedAtDate?: string }[])[0];
    if (topReview?.text) {
      lines.push(`\n> "${topReview.text.slice(0, 200)}…" — ${topReview.stars ?? "?"} stars`);
    }
  }
  lines.push(rawDataBlock(item));
  return lines.join("\n");
}

function formatBookingItem(item: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push(`## ${str(item.name || item.hotelName)}`);
  pushField(lines, "Location", item.address || item.city);
  pushField(lines, "Rating", item.rating || item.score);
  pushField(lines, "Reviews", item.reviewsCount);
  pushField(lines, "Price", item.price || item.pricePerNight);
  pushField(lines, "URL", item.url);
  lines.push(rawDataBlock(item));
  return lines.join("\n");
}

function formatTripAdvisorItem(item: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push(`## ${str(item.title || item.name)}`);
  pushField(lines, "Rating", item.rating);
  pushField(lines, "Reviews", item.reviewsCount || item.numberOfReviews);
  pushField(lines, "Location", item.address || item.location);
  pushField(lines, "URL", item.url);
  lines.push(rawDataBlock(item));
  return lines.join("\n");
}

function formatItem(source: Source, item: Record<string, unknown>): string {
  switch (source) {
    case "google_maps": return formatGoogleMapsItem(item);
    case "booking": return formatBookingItem(item);
    case "tripadvisor": return formatTripAdvisorItem(item);
  }
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

async function handleStart(params: {
  requests: Record<string, unknown>[];
  apiKey: string;
  baseUrl: string;
  defaultMaxResults: number;
}): Promise<Record<string, unknown>> {
  if (!params.requests?.length) {
    throw new ToolInputError("'start' action requires 'requests' array.");
  }

  const prepared: PreparedRun[] = [];
  for (const req of params.requests) {
    const source = readStringParam(req, "source", { required: true }) as Source;
    const maxResults = readNumberParam(req, "maxResults") ?? params.defaultMaxResults;
    prepared.push({ source, actorId: ACTOR_IDS[source], input: buildInput(req, source, maxResults) });
  }

  const results = await Promise.allSettled(
    prepared.map(async ({ source, actorId, input }) => {
      const run = await startApifyActorRun({ actorId, input, apiKey: params.apiKey, baseUrl: params.baseUrl });
      return { source, runId: run.id, datasetId: run.defaultDatasetId, status: run.status };
    }),
  );

  const runs: Record<string, unknown>[] = [];
  const errors: { index: number; source: string; error: string }[] = [];
  results.forEach((result, i) => {
    if (result.status === "fulfilled") runs.push(result.value);
    else errors.push({ index: i, source: prepared[i].source, error: result.reason instanceof Error ? result.reason.message : String(result.reason) });
  });

  return {
    action: "start",
    message: `Started ${runs.length} run(s)${errors.length ? `, ${errors.length} failed` : ""}. Use action='collect' to fetch results.`,
    runs,
    ...(errors.length ? { errors } : {}),
  };
}

async function handleCollect(params: {
  runs: Record<string, unknown>[];
  apiKey: string;
  baseUrl: string;
  cacheTtlMs: number;
}): Promise<Record<string, unknown>> {
  if (!params.runs?.length) throw new ToolInputError("'collect' action requires 'runs' array.");

  const results = await Promise.allSettled(
    params.runs.map(async (runRef) => {
      const runId = readStringParam(runRef, "runId", { required: true });
      const source = readStringParam(runRef, "source", { required: true }) as Source;
      const datasetId = readStringParam(runRef, "datasetId", { required: true });

      const cacheKey = normalizeCacheKey(`market-research:run:${runId}`);
      const cached = readCache(CACHE, cacheKey);
      if (cached) return { ...cached.value, cached: true };

      const runStatus = await getApifyRunStatus({ runId, apiKey: params.apiKey, baseUrl: params.baseUrl });
      if (!TERMINAL_STATUSES.has(runStatus.status)) return { source, runId, status: runStatus.status, pending: true } as Record<string, unknown>;
      if (runStatus.status !== "SUCCEEDED") return { source, runId, status: runStatus.status, error: `Run ended with status: ${runStatus.status}` } as Record<string, unknown>;

      const items = await getApifyDatasetItems({ datasetId, apiKey: params.apiKey, baseUrl: params.baseUrl });
      const text = truncateResults(items.map((item) => {
        try { return formatItem(source, item as Record<string, unknown>); } catch { return `\`\`\`json\n${JSON.stringify(item).slice(0, 200)}\n\`\`\``; }
      }).join("\n\n---\n\n"));
      const wrapped = wrapExternalContent(text, { source: "market_research", includeWarning: false });

      const payload: Record<string, unknown> = {
        source, runId, status: "SUCCEEDED", resultCount: items.length,
        text: wrapped, externalContent: { untrusted: true, source: "market_research", wrapped: true },
        fetchedAt: new Date().toISOString(),
      };
      writeCache(CACHE, cacheKey, payload, params.cacheTtlMs);
      return payload;
    }),
  );

  const completed: Record<string, unknown>[] = [];
  const pending: Record<string, unknown>[] = [];
  const errors: Record<string, unknown>[] = [];
  for (const result of results) {
    if (result.status === "rejected") { errors.push({ error: result.reason instanceof Error ? result.reason.message : String(result.reason) }); continue; }
    const value = result.value;
    if (value.pending) pending.push(value);
    else if (value.error) errors.push(value);
    else completed.push(value);
  }

  return {
    action: "collect",
    allDone: pending.length === 0,
    message: pending.length === 0 ? `All ${completed.length} run(s) completed.` : `${completed.length} completed, ${pending.length} still running. Call collect again.`,
    completed,
    ...(pending.length ? { pending } : {}),
    ...(errors.length ? { errors } : {}),
  };
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

const TOOL_DESCRIPTION = `Analyze local markets, geographic business data, hotels, and travel destinations via Apify.

Use market_research for:
- Local business discovery and analysis (coffee shops, restaurants, dentists by area)
- Hotel and accommodation data from Booking.com
- Restaurant and attraction data from TripAdvisor
- Market sizing by business density in a location
- Pricing analysis across a geographic area

Sources:
- google_maps: Full business details, reviews, hours, contact info via Google Maps (compass/crawler-google-places)
- booking: Hotel listings, ratings, prices from Booking.com (voyager/booking-scraper)
- tripadvisor: Hotels, restaurants, attractions from TripAdvisor (maxcopell/tripadvisor-reviews)

TWO-PHASE PATTERN:
1. action="start" with requests array → returns runs with runIds
2. action="collect" with runs array → fetches results (call again if pending)

EXAMPLES:
  { action: "start", requests: [
    { source: "google_maps", queries: ["pizza restaurants in Chicago"], maxResults: 20 },
    { source: "tripadvisor", queries: ["hotels in Barcelona"], maxResults: 10 }
  ]}`;

export function createMarketResearchTool(options?: {
  pluginConfig?: Record<string, unknown>;
}): AnyAgentTool | null {
  const config = parsePluginConfig(options?.pluginConfig);
  const apiKey = resolveApiKey(config);
  if (!resolveEnabled({ config, apiKey })) return null;
  if (!isToolEnabled(config, "market_research")) return null;

  const baseUrl = resolveBaseUrl(config);
  const defaultMaxResults = resolveMaxResults(config, 200);
  const cacheTtlMs = resolveCacheTtlMs(config.cacheTtlMinutes, DEFAULT_CACHE_TTL_MINUTES);

  return {
    label: "Market Research",
    name: "market_research",
    description: TOOL_DESCRIPTION,
    parameters: MarketResearchSchema,
    execute: async (_toolCallId, args) => {
      const typedArgs = args as Record<string, unknown>;
      const action = readStringParam(typedArgs, "action", { required: true });
      if (!apiKey) return jsonResult({ error: "missing_api_key", message: "Set APIFY_API_KEY env var or configure apiKey in plugin config." });
      switch (action) {
        case "start":
          return jsonResult(await handleStart({ requests: typedArgs.requests as Record<string, unknown>[], apiKey, baseUrl, defaultMaxResults }));
        case "collect":
          return jsonResult(await handleCollect({ runs: typedArgs.runs as Record<string, unknown>[], apiKey, baseUrl, cacheTtlMs }));
        default:
          throw new ToolInputError(`Unknown action: "${action}". Use "start" or "collect".`);
      }
    },
  };
}
