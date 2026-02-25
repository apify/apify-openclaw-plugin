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

const SOURCES = ["google_maps", "booking", "tripadvisor", "facebook_reviews", "youtube_comments", "tiktok_comments"] as const;
type Source = (typeof SOURCES)[number];

const ACTOR_IDS: Record<Source, string> = {
  google_maps: "compass~crawler-google-places",
  booking: "voyager~booking-scraper",
  tripadvisor: "maxcopell~tripadvisor-reviews",
  facebook_reviews: "apify~facebook-reviews-scraper",
  youtube_comments: "streamers~youtube-comments-scraper",
  tiktok_comments: "clockworks~tiktok-comments-scraper",
};

const RequestSchema = Type.Object({
  source: stringEnum(SOURCES, {
    description:
      "google_maps: business ratings and reviews from Google Maps. " +
      "booking: guest reviews from Booking.com. " +
      "tripadvisor: reviews from TripAdvisor. " +
      "facebook_reviews: page reviews from Facebook. " +
      "youtube_comments: video comments from YouTube. " +
      "tiktok_comments: video comments from TikTok.",
  }),
  queries: Type.Optional(Type.Array(Type.String(), { description: "Business/brand name or search terms. One run per query." })),
  urls: Type.Optional(Type.Array(Type.String(), { description: "Direct business/page/video URLs." })),
  maxResults: Type.Optional(Type.Number({ minimum: 1, maximum: 200, description: "Max reviews/comments per run (default: 20)." })),
  dateFrom: Type.Optional(Type.String({ description: "Filter reviews/comments from this date (ISO format: YYYY-MM-DD)." })),
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
      return {
        ...(queries?.length ? { searchStringsArray: queries } : {}),
        ...(urls?.length ? { startUrls: urls.map((u) => ({ url: u })) } : {}),
        maxCrawledPlacesPerSearch: maxResults,
        includeReviews: true, maxReviews: Math.min(maxResults, 50), includeHistogram: false,
        ...actorInput,
      };
    case "booking":
    case "tripadvisor":
      return {
        ...(urls?.length ? { startUrls: urls.map((u) => ({ url: u })) } : {}),
        ...(queries?.length ? { search: queries[0] } : {}),
        maxItems: maxResults,
        ...(req.dateFrom ? { dateFrom: req.dateFrom } : {}),
        ...actorInput,
      };
    case "facebook_reviews":
      return {
        ...(urls?.length ? { startUrls: urls.map((u) => ({ url: u })) } : {}),
        maxItems: maxResults, ...actorInput,
      };
    case "youtube_comments":
    case "tiktok_comments":
      return {
        ...(urls?.length ? { startUrls: urls.map((u) => ({ url: u })) } : {}),
        maxItems: maxResults, ...actorInput,
      };
  }
}

function formatItem(source: Source, item: Record<string, unknown>): string {
  const lines: string[] = [];
  switch (source) {
    case "google_maps": {
      lines.push(`## ${str(item.title || item.name)}${item.totalScore ? ` — ${item.totalScore}/5` : ""}`);
      pushField(lines, "Address", item.address); pushField(lines, "Reviews", item.reviewsCount);
      if (Array.isArray(item.reviews) && item.reviews.length) {
        lines.push("\n**Recent Reviews:**");
        (item.reviews as { text?: string; stars?: number; publishedAtDate?: string }[]).slice(0, 3).forEach((r) => {
          if (r.text) lines.push(`> "${r.text.slice(0, 200)}" — ${r.stars ?? "?"} stars (${r.publishedAtDate ?? ""})`);
        });
      }
      break;
    }
    case "booking":
    case "tripadvisor": {
      lines.push(`## Review: ${str(item.name || item.title || item.hotel)}`);
      pushField(lines, "Rating", item.rating || item.score); pushField(lines, "Date", item.date || item.createdAt);
      pushField(lines, "Author", item.reviewer || item.author);
      if (item.text || item.review) lines.push(`\n${str(item.text || item.review).slice(0, 300)}`);
      break;
    }
    case "facebook_reviews": {
      lines.push(`## Facebook Review — ${str(item.reviewerName || item.author)}`);
      pushField(lines, "Rating", item.rating || item.recommendation); pushField(lines, "Date", item.date);
      if (item.reviewText || item.text) lines.push(`\n${str(item.reviewText || item.text).slice(0, 300)}`);
      break;
    }
    case "youtube_comments": {
      lines.push(`## YouTube Comment — ${str(item.authorText || item.author)}`);
      pushField(lines, "Likes", item.likeCount); pushField(lines, "Date", item.publishedTime || item.date);
      if (item.text) lines.push(`\n${str(item.text).slice(0, 300)}`);
      break;
    }
    case "tiktok_comments": {
      lines.push(`## TikTok Comment — @${str(item.uniqueId || item.author)}`);
      pushField(lines, "Likes", item.diggCount || item.likeCount); pushField(lines, "Date", item.createTime || item.date);
      if (item.text) lines.push(`\n${str(item.text).slice(0, 300)}`);
      break;
    }
  }
  lines.push(rawDataBlock(item));
  return lines.join("\n");
}

const TOOL_DESCRIPTION = `Monitor brand reputation, reviews, and mentions across Google Maps, Booking.com, TripAdvisor, Facebook, YouTube, and TikTok via Apify.

Use brand_reputation for:
- Aggregating reviews across multiple platforms (Google, TripAdvisor, Booking.com)
- Sentiment analysis from customer reviews and comments
- Tracking review volume and rating trends over time
- Monitoring brand mentions in video comments
- Competitive reputation benchmarking
- Responding to reputation crises (see what's being said)

Sources: google_maps, booking, tripadvisor, facebook_reviews, youtube_comments, tiktok_comments

TWO-PHASE PATTERN: action="start" → action="collect"

EXAMPLE:
  { action: "start", requests: [
    { source: "google_maps", queries: ["Marriott New York"], maxResults: 50 },
    { source: "tripadvisor", urls: ["https://www.tripadvisor.com/Hotel_Review-..."] }
  ]}`;

export function createBrandReputationTool(options?: { pluginConfig?: Record<string, unknown> }): AnyAgentTool | null {
  const config = parsePluginConfig(options?.pluginConfig);
  const apiKey = resolveApiKey(config);
  if (!resolveEnabled({ config, apiKey })) return null;
  if (!isToolEnabled(config, "brand_reputation")) return null;
  const baseUrl = resolveBaseUrl(config);
  const defaultMaxResults = resolveMaxResults(config, 200);
  const cacheTtlMs = resolveCacheTtlMs(config.cacheTtlMinutes, DEFAULT_CACHE_TTL_MINUTES);

  return {
    label: "Brand Reputation",
    name: "brand_reputation",
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
          cacheNamespace: "brand-reputation", cache: CACHE, toolName: "brand_reputation",
          formatItems: (source, items) => items.map((item) => { try { return formatItem(source as Source, item as Record<string, unknown>); } catch { return `\`\`\`json\n${JSON.stringify(item).slice(0, 200)}\n\`\`\``; } }).join("\n\n---\n\n"),
        }));
      }
      throw new ToolInputError(`Unknown action: "${action}".`);
    },
  };
}
