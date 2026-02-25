import { Type } from "@sinclair/typebox";
import { jsonResult, readNumberParam, readStringParam, stringEnum } from "openclaw/plugin-sdk";
import type { AnyAgentTool } from "openclaw/plugin-sdk";
import {
  CacheEntry,
  DEFAULT_CACHE_TTL_MINUTES,
  ToolInputError,
  readStringArrayParam,
  resolveCacheTtlMs,
} from "../util.js";
import {
  isToolEnabled, parsePluginConfig, pushField, rawDataBlock,
  resolveApiKey, resolveBaseUrl, resolveEnabled, resolveMaxResults,
  str,
} from "../apify-client.js";
import { PreparedRun, runTwoPhaseCollect, runTwoPhaseStart } from "../tool-helpers.js";

const CACHE = new Map<string, CacheEntry<Record<string, unknown>>>();

const SOURCES = ["google_maps", "google_maps_reviews", "google_search"] as const;
type Source = (typeof SOURCES)[number];

const ACTOR_IDS: Record<Source, string> = {
  google_maps: "compass/crawler-google-places",
  google_maps_reviews: "compass/Google-Maps-Reviews-Scraper",
  google_search: "apify/google-search-scraper",
};

const RequestSchema = Type.Object({
  source: stringEnum(SOURCES, {
    description:
      "google_maps: competitor business details, ratings, contact info. " +
      "google_maps_reviews: competitor review analysis. " +
      "google_search: competitor search visibility, rankings, web presence.",
  }),
  queries: Type.Optional(Type.Array(Type.String(), { description: "Search terms (e.g. 'Starbucks New York'). One run per query." })),
  urls: Type.Optional(Type.Array(Type.String(), { description: "Direct competitor place or website URLs." })),
  location: Type.Optional(Type.String({ description: "Geographic filter for local competitor searches." })),
  maxResults: Type.Optional(Type.Number({ minimum: 1, maximum: 200, description: "Max results per run (default: 20)." })),
  actorInput: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "Advanced actor parameters." })),
});

const RunRefSchema = Type.Object({ runId: Type.String(), source: stringEnum(SOURCES), datasetId: Type.String() });
const Schema = Type.Object({
  action: stringEnum(["start", "collect"] as const, { description: "'start' or 'collect'." }),
  requests: Type.Optional(Type.Array(RequestSchema)),
  runs: Type.Optional(Type.Array(RunRefSchema)),
});

function buildInput(req: Record<string, unknown>, source: Source, maxResults: number): Record<string, unknown> {
  const queries = readStringArrayParam(req, "queries");
  const urls = readStringArrayParam(req, "urls");
  const actorInput = req.actorInput && typeof req.actorInput === "object" && !Array.isArray(req.actorInput) ? (req.actorInput as Record<string, unknown>) : {};
  switch (source) {
    case "google_maps":
      return { ...(queries?.length ? { searchStringsArray: queries } : {}), ...(urls?.length ? { startUrls: urls.map((u) => ({ url: u })) } : {}), maxCrawledPlacesPerSearch: maxResults, includeHistogram: false, includeOpeningHours: true, includeReviews: true, maxReviews: 5, ...actorInput };
    case "google_maps_reviews":
      return { ...(urls?.length ? { startUrls: urls.map((u) => ({ url: u })) } : {}), ...(queries?.length ? { searchStringsArray: queries } : {}), maxReviews: maxResults, ...actorInput };
    case "google_search":
      return { queries: queries ?? [], maxPagesPerQuery: 1, resultsPerPage: Math.min(maxResults, 10), ...actorInput };
  }
}

function formatItem(source: Source, item: Record<string, unknown>): string {
  const lines: string[] = [];
  switch (source) {
    case "google_maps": {
      lines.push(`## ${str(item.title || item.name)}${item.totalScore ? ` (${item.totalScore}/5)` : ""}`);
      pushField(lines, "Address", item.address); pushField(lines, "Phone", item.phone); pushField(lines, "Website", item.website);
      pushField(lines, "Category", item.categoryName); pushField(lines, "Reviews", item.reviewsCount); pushField(lines, "Price", item.price);
      break;
    }
    case "google_maps_reviews": {
      lines.push(`## Review: ${str(item.name || item.reviewerName)}`);
      pushField(lines, "Rating", item.stars || item.rating); pushField(lines, "Date", item.publishedAtDate); pushField(lines, "Text", item.text);
      break;
    }
    case "google_search": {
      lines.push(`## [${str(item.title)}](${str(item.url)})`);
      pushField(lines, "Position", item.position || item.rank); pushField(lines, "Snippet", item.description || item.snippet);
      break;
    }
  }
  lines.push(rawDataBlock(item));
  return lines.join("\n");
}

const TOOL_DESCRIPTION = `Analyze competitors using Google Maps business data, reviews, and search rankings via Apify.

Use competitor_intelligence for:
- Benchmarking competitors' ratings, reviews, and pricing
- Analyzing competitor review sentiment
- Finding competitor search presence and rankings
- Locating competitor businesses in a geographic area

Sources: google_maps, google_maps_reviews, google_search

TWO-PHASE PATTERN: action="start" → action="collect"`;

export function createCompetitorIntelligenceTool(options?: { pluginConfig?: Record<string, unknown> }): AnyAgentTool | null {
  const config = parsePluginConfig(options?.pluginConfig);
  const apiKey = resolveApiKey(config);
  if (!resolveEnabled({ config, apiKey })) return null;
  if (!isToolEnabled(config, "competitor_intelligence")) return null;
  const baseUrl = resolveBaseUrl(config);
  const defaultMaxResults = resolveMaxResults(config, 200);
  const cacheTtlMs = resolveCacheTtlMs(config.cacheTtlMinutes, DEFAULT_CACHE_TTL_MINUTES);

  return {
    label: "Competitor Intelligence",
    name: "competitor_intelligence",
    description: TOOL_DESCRIPTION,
    parameters: Schema,
    execute: async (_id, args) => {
      const typedArgs = args as Record<string, unknown>;
      const action = readStringParam(typedArgs, "action", { required: true });
      if (!apiKey) return jsonResult({ error: "missing_api_key", message: "Set APIFY_API_KEY env var or configure apiKey in plugin config." });
      if (action === "start") {
        const requests = typedArgs.requests as Record<string, unknown>[] ?? [];
        if (!requests.length) throw new ToolInputError("'start' requires 'requests' array.");
        const prepared: PreparedRun[] = requests.map((req) => {
          const source = readStringParam(req, "source", { required: true }) as Source;
          const maxResults = readNumberParam(req, "maxResults") ?? defaultMaxResults;
          return { source, actorId: ACTOR_IDS[source], input: buildInput(req, source, maxResults) };
        });
        return jsonResult(await runTwoPhaseStart({ prepared, apiKey, baseUrl }));
      }
      if (action === "collect") {
        return jsonResult(await runTwoPhaseCollect({
          runs: typedArgs.runs as Record<string, unknown>[],
          apiKey, baseUrl, cacheTtlMs,
          cacheNamespace: "competitor-intelligence", cache: CACHE, toolName: "competitor_intelligence",
          formatItems: (source, items) => items.map((item) => { try { return formatItem(source as Source, item as Record<string, unknown>); } catch { return `\`\`\`json\n${JSON.stringify(item).slice(0, 200)}\n\`\`\``; } }).join("\n\n---\n\n"),
        }));
      }
      throw new ToolInputError(`Unknown action: "${action}".`);
    },
  };
}
