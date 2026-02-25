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

const SOURCES = ["google_trends", "instagram_hashtags", "tiktok_hashtags", "tiktok_trends"] as const;
type Source = (typeof SOURCES)[number];

const ACTOR_IDS: Record<Source, string> = {
  google_trends: "apify~google-trends-scraper",
  instagram_hashtags: "apify~instagram-hashtag-scraper",
  tiktok_hashtags: "clockworks~tiktok-hashtag-scraper",
  tiktok_trends: "clockworks~tiktok-trends-scraper",
};

const RequestSchema = Type.Object({
  source: stringEnum(SOURCES, {
    description:
      "google_trends: search volume and interest over time. " +
      "instagram_hashtags: posts, engagement under Instagram hashtags. " +
      "tiktok_hashtags: videos and stats for TikTok hashtags. " +
      "tiktok_trends: currently trending TikTok content.",
  }),
  queries: Type.Optional(Type.Array(Type.String(), { description: "Keywords or hashtag names (without # prefix). One run per query." })),
  timeRange: Type.Optional(Type.String({ description: "For google_trends: 'now 7-d', 'today 1-m', 'today 3-m', 'today 12-m', 'today 5-y'. Default: 'today 3-m'." })),
  maxResults: Type.Optional(Type.Number({ minimum: 1, maximum: 200, description: "Max results per run (default: 20)." })),
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
  const actorInput = req.actorInput && typeof req.actorInput === "object" && !Array.isArray(req.actorInput) ? (req.actorInput as Record<string, unknown>) : {};
  switch (source) {
    case "google_trends":
      return { searchTerms: queries ?? [], timeRange: req.timeRange ?? "today 3-m", geo: "", ...actorInput };
    case "instagram_hashtags":
      return { hashtags: queries ?? [], resultsLimit: maxResults, ...actorInput };
    case "tiktok_hashtags":
      return { hashtags: queries ?? [], resultsPerPage: maxResults, ...actorInput };
    case "tiktok_trends":
      return { maxItems: maxResults, ...actorInput };
  }
}

function formatItem(source: Source, item: Record<string, unknown>): string {
  const lines: string[] = [];
  switch (source) {
    case "google_trends": {
      lines.push(`## Trend: ${str(item.keyword || item.searchTerm)}`);
      pushField(lines, "Interest", item.value || item.interest); pushField(lines, "Date", item.date || item.time);
      break;
    }
    case "instagram_hashtags": {
      lines.push(`## #${str(item.hashtag || item.name || item.id)}`);
      pushField(lines, "Posts", item.postsCount); pushField(lines, "Likes", item.likesCount); pushField(lines, "Comments", item.commentsCount);
      pushField(lines, "Caption", (item.caption as string)?.slice(0, 200)); pushField(lines, "URL", item.url);
      break;
    }
    case "tiktok_hashtags":
    case "tiktok_trends": {
      lines.push(`## ${str(item.text || item.title || item.desc)}`);
      pushField(lines, "Views", item.playCount || item.viewCount); pushField(lines, "Likes", item.diggCount || item.likeCount);
      pushField(lines, "Shares", item.shareCount); pushField(lines, "Author", (item.authorMeta as Record<string, unknown>)?.nickname ?? item.author);
      pushField(lines, "URL", item.webVideoUrl || item.url);
      break;
    }
  }
  lines.push(rawDataBlock(item));
  return lines.join("\n");
}

const TOOL_DESCRIPTION = `Discover trending content and search patterns across Google Trends, Instagram, and TikTok via Apify.

Use trend_analysis for:
- Finding trending keywords and search interest over time (google_trends)
- Analyzing content and engagement under Instagram hashtags (instagram_hashtags)
- Discovering top-performing TikTok content for specific hashtags (tiktok_hashtags)
- Finding currently trending TikTok videos globally (tiktok_trends)
- Informing content strategy and campaign timing

Sources: google_trends, instagram_hashtags, tiktok_hashtags, tiktok_trends

TWO-PHASE PATTERN: action="start" → action="collect"

EXAMPLE:
  { action: "start", requests: [
    { source: "google_trends", queries: ["AI tools", "ChatGPT"], timeRange: "today 3-m" },
    { source: "tiktok_hashtags", queries: ["fitness", "gymtok"], maxResults: 30 }
  ]}`;

export function createTrendAnalysisTool(options?: { pluginConfig?: Record<string, unknown> }): AnyAgentTool | null {
  const config = parsePluginConfig(options?.pluginConfig);
  const apiKey = resolveApiKey(config);
  if (!resolveEnabled({ config, apiKey })) return null;
  if (!isToolEnabled(config, "trend_analysis")) return null;
  const baseUrl = resolveBaseUrl(config);
  const defaultMaxResults = resolveMaxResults(config, 200);
  const cacheTtlMs = resolveCacheTtlMs(config.cacheTtlMinutes, DEFAULT_CACHE_TTL_MINUTES);

  return {
    label: "Trend Analysis",
    name: "trend_analysis",
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
          cacheNamespace: "trend-analysis", cache: CACHE, toolName: "trend_analysis",
          formatItems: (source, items) => items.map((item) => { try { return formatItem(source as Source, item as Record<string, unknown>); } catch { return `\`\`\`json\n${JSON.stringify(item).slice(0, 200)}\n\`\`\``; } }).join("\n\n---\n\n"),
        }));
      }
      throw new ToolInputError(`Unknown action: "${action}".`);
    },
  };
}
