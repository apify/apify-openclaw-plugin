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
  resolveApiKey, resolveBaseUrl, resolveEnabled, resolveMaxResults, str,
} from "../apify-client.js";
import { PreparedRun, runTwoPhaseCollect, runTwoPhaseStart } from "../tool-helpers.js";

const CACHE = new Map<string, CacheEntry<Record<string, unknown>>>();

const SOURCES = ["google_maps", "google_maps_email", "google_search"] as const;
type Source = (typeof SOURCES)[number];

const ACTOR_IDS: Record<Source, string> = {
  google_maps: "compass~crawler-google-places",
  google_maps_email: "poidata~google-maps-email-extractor",
  google_search: "apify~google-search-scraper",
};

const RequestSchema = Type.Object({
  source: stringEnum(SOURCES, {
    description:
      "google_maps: local business leads with name, address, phone, website. " +
      "google_maps_email: same as google_maps but extracts email addresses from business websites. " +
      "google_search: find leads via Google Search results.",
  }),
  queries: Type.Optional(Type.Array(Type.String(), { description: "Search terms (e.g. 'marketing agencies in London'). One run per query." })),
  urls: Type.Optional(Type.Array(Type.String(), { description: "Direct URLs to scrape." })),
  location: Type.Optional(Type.String({ description: "Geographic filter (e.g. 'Austin, Texas')." })),
  maxResults: Type.Optional(Type.Number({ minimum: 1, maximum: 200, description: "Max leads per run (default: 20)." })),
  actorInput: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
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
    case "google_maps_email":
      return {
        ...(queries?.length ? { searchStringsArray: queries } : {}),
        ...(urls?.length ? { startUrls: urls.map((u) => ({ url: u })) } : {}),
        maxCrawledPlacesPerSearch: maxResults,
        includeHistogram: false, includeOpeningHours: false, includeReviews: false,
        ...actorInput,
      };
    case "google_search":
      return { queries: queries ?? [], maxPagesPerQuery: 1, resultsPerPage: Math.min(maxResults, 10), ...actorInput };
  }
}

function formatItem(source: Source, item: Record<string, unknown>): string {
  const lines: string[] = [];
  switch (source) {
    case "google_maps":
    case "google_maps_email": {
      lines.push(`## ${str(item.title || item.name)}`);
      pushField(lines, "Address", item.address); pushField(lines, "Phone", item.phone || item.phoneUnformatted);
      pushField(lines, "Website", item.website); pushField(lines, "Email", item.email);
      pushField(lines, "Category", item.categoryName); pushField(lines, "Rating", item.totalScore);
      break;
    }
    case "google_search": {
      lines.push(`## [${str(item.title)}](${str(item.url)})`);
      pushField(lines, "Snippet", item.description || item.snippet);
      break;
    }
  }
  lines.push(rawDataBlock(item));
  return lines.join("\n");
}

const TOOL_DESCRIPTION = `Generate B2B and B2C leads from local business directories and web search via Apify.

Use lead_generation for:
- Finding local business leads with contact info (phone, website)
- Extracting email addresses from business websites (google_maps_email)
- Building prospect lists by industry/location
- Finding leads via web search results

Sources:
- google_maps: Business name, address, phone, website, category from Google Maps
- google_maps_email: Same as google_maps but also visits websites to extract emails (slower)
- google_search: Company/person leads via Google Search results

TWO-PHASE PATTERN: action="start" → action="collect"

EXAMPLE:
  { action: "start", requests: [
    { source: "google_maps_email", queries: ["web design agencies Chicago"], maxResults: 50 }
  ]}`;

export function createLeadGenerationTool(options?: { pluginConfig?: Record<string, unknown> }): AnyAgentTool | null {
  const config = parsePluginConfig(options?.pluginConfig);
  const apiKey = resolveApiKey(config);
  if (!resolveEnabled({ config, apiKey })) return null;
  if (!isToolEnabled(config, "lead_generation")) return null;
  const baseUrl = resolveBaseUrl(config);
  const defaultMaxResults = resolveMaxResults(config, 200);
  const cacheTtlMs = resolveCacheTtlMs(config.cacheTtlMinutes, DEFAULT_CACHE_TTL_MINUTES);

  return {
    label: "Lead Generation",
    name: "lead_generation",
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
          cacheNamespace: "lead-generation", cache: CACHE, toolName: "lead_generation",
          formatItems: (source, items) => items.map((item) => { try { return formatItem(source as Source, item as Record<string, unknown>); } catch { return `\`\`\`json\n${JSON.stringify(item).slice(0, 200)}\n\`\`\``; } }).join("\n\n---\n\n"),
        }));
      }
      throw new ToolInputError(`Unknown action: "${action}".`);
    },
  };
}
