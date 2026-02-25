import { Type } from "@sinclair/typebox";
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
  ApifyPluginConfig,
  apifyFetch,
  getApifyDatasetItems,
  getApifyRunStatus,
  isToolEnabled,
  parsePluginConfig,
  resolveApiKey,
  resolveBaseUrl,
  resolveEnabled,
  resolveMaxResults,
  startApifyActorRun,
  str,
  truncateResults,
  TERMINAL_STATUSES,
  MAX_RESULT_CHARS,
} from "../apify-client.js";

// ---------------------------------------------------------------------------
// Cache
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
      "'discover': search Apify Store by keyword OR fetch an actor's input schema. " +
      "'start': run any Apify actor by ID. 'collect': get results from previously started runs.",
  }),

  // discover — search Apify Store
  query: Type.Optional(
    Type.String({
      description:
        "Keywords to search the Apify Store (e.g. 'amazon price scraper'). Used when action='discover' to find relevant actors.",
    }),
  ),

  // discover — fetch actor schema, also used by start
  actorId: Type.Optional(
    Type.String({
      description:
        "Actor ID or slug (e.g. 'apify/google-search-scraper' or 'compass/crawler-google-places'). " +
        "When action='discover': fetches the actor's input schema. " +
        "When action='start': the actor to run.",
    }),
  ),

  // start
  input: Type.Optional(
    Type.Record(Type.String(), Type.Unknown(), {
      description:
        "JSON input for the actor. Use action='discover' with actorId first to know what parameters the actor accepts.",
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
// Discover action — synchronous (metadata calls, no actor runs)
// ---------------------------------------------------------------------------

interface ApifyStoreActor {
  id: string;
  name: string;
  username: string;
  title: string;
  description?: string;
  stats?: { totalRuns?: number };
  currentPricingInfo?: { pricingModel?: string };
}

async function handleDiscover(params: {
  query?: string;
  actorId?: string;
  apiKey: string;
  baseUrl: string;
}): Promise<Record<string, unknown>> {
  const { query, actorId, apiKey, baseUrl } = params;

  if (!query && !actorId) {
    throw new ToolInputError(
      "action='discover' requires either 'query' (to search the Apify Store) or 'actorId' (to fetch an actor's input schema).",
    );
  }

  // Fetch actor schema when actorId provided
  if (actorId) {
    const result = await apifyFetch<{ data: Record<string, unknown> }>({
      path: `/v2/acts/${encodeURIComponent(actorId)}`,
      apiKey,
      baseUrl,
      errorPrefix: `Failed to fetch actor '${actorId}'`,
    });
    const data = result.data;
    const inputSchema = data.defaultRunInput ?? data.inputSchema ?? null;
    return {
      action: "discover",
      actorId,
      name: str(data.name),
      title: str(data.title),
      username: str(data.username),
      description: str(data.description),
      inputSchema,
      tip: `Use action='start' with actorId='${str(data.username)}/${str(data.name)}' and the input parameters from inputSchema.`,
    };
  }

  // Search Apify Store
  const encoded = encodeURIComponent(query!);
  const result = await apifyFetch<{ data: { items: ApifyStoreActor[] } }>({
    path: `/v2/store?search=${encoded}&limit=10&sortBy=relevance`,
    apiKey,
    baseUrl,
    errorPrefix: "Failed to search Apify Store",
  });

  const actors = result.data?.items ?? [];
  const lines: string[] = [`## Apify Store results for: "${query}"`, ""];

  for (const actor of actors) {
    const slug = `${actor.username}/${actor.name}`;
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
    `Tip: Use action='discover' with actorId='<ID>' to fetch the actor's input schema, then action='start' to run it.`,
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
  apiKey: string;
  baseUrl: string;
}): Promise<Record<string, unknown>> {
  const run = await startApifyActorRun({
    actorId: params.actorId,
    input: params.input,
    apiKey: params.apiKey,
    baseUrl: params.baseUrl,
  });

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
  apiKey: string;
  baseUrl: string;
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

      const runStatus = await getApifyRunStatus({
        runId,
        apiKey: params.apiKey,
        baseUrl: params.baseUrl,
      });

      if (!TERMINAL_STATUSES.has(runStatus.status)) {
        return { actorId, runId, status: runStatus.status, pending: true, ...(label ? { label } : {}) } as Record<string, unknown>;
      }

      if (runStatus.status !== "SUCCEEDED") {
        return { actorId, runId, status: runStatus.status, error: `Run ended with status: ${runStatus.status}`, ...(label ? { label } : {}) } as Record<string, unknown>;
      }

      const items = await getApifyDatasetItems({
        datasetId,
        apiKey: params.apiKey,
        baseUrl: params.baseUrl,
      });

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

const TOOL_DESCRIPTION = `Universal Apify actor runner with built-in actor discovery.

Use apify_scraper when:
- No specialized tool (market_research, competitor_intelligence, etc.) covers your use case
- You need to run a specific Apify actor you already know
- The user asks about capabilities not covered by other tools

THREE-ACTION WORKFLOW:
1. action="discover" + query="<keywords>" → searches Apify Store, returns actor list with IDs
2. action="discover" + actorId="<id>" → fetches actor's input schema (know what params to pass)
3. action="start" + actorId="<id>" + input={...} → fires the actor run, returns runId
4. action="collect" + runs=[...] → polls status, returns results when done

SHORTCUT (if you already know the actor and its params):
- Skip discover, go straight to start + collect.

Actor ID format: "username/actor-name" (e.g. "apify/google-search-scraper") — browse at https://apify.com/store

EXAMPLES:
  Discover: { action: "discover", query: "linkedin company scraper" }
  Schema:   { action: "discover", actorId: "apify/linkedin-profile-scraper" }
  Start:    { action: "start", actorId: "apify/google-search-scraper", input: { queries: ["OpenAI"], maxPagesPerQuery: 1 }, label: "google-search" }
  Collect:  { action: "collect", runs: [{ runId: "...", actorId: "...", datasetId: "..." }] }`;

export function createApifyScraperTool(options?: {
  pluginConfig?: Record<string, unknown>;
}): AnyAgentTool | null {
  const config = parsePluginConfig(options?.pluginConfig);
  const apiKey = resolveApiKey(config);
  if (!resolveEnabled({ config, apiKey })) return null;
  if (!isToolEnabled(config, "apify_scraper")) return null;

  const baseUrl = resolveBaseUrl(config);
  const cacheTtlMs = resolveCacheTtlMs(config.cacheTtlMinutes, DEFAULT_CACHE_TTL_MINUTES);

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
              apiKey,
              baseUrl,
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
              apiKey,
              baseUrl,
            }),
          );
        }
        case "collect":
          return jsonResult(
            await handleCollect({
              runs: typedArgs.runs as Record<string, unknown>[],
              apiKey,
              baseUrl,
              cacheTtlMs,
            }),
          );
        default:
          throw new ToolInputError(`Unknown action: "${action}". Use "discover", "start", or "collect".`);
      }
    },
  };
}
