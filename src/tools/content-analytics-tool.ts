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

const SOURCES = ["instagram_posts", "instagram_reels", "facebook_posts", "youtube", "tiktok"] as const;
type Source = (typeof SOURCES)[number];

const ACTOR_IDS: Record<Source, string> = {
  instagram_posts: "apify~instagram-post-scraper",
  instagram_reels: "apify~instagram-reel-scraper",
  facebook_posts: "apify~facebook-posts-scraper",
  youtube: "streamers~youtube-scraper",
  tiktok: "clockworks~tiktok-scraper",
};

const RequestSchema = Type.Object({
  source: stringEnum(SOURCES, {
    description:
      "instagram_posts: engagement metrics for Instagram posts. " +
      "instagram_reels: Instagram reel performance (views, likes, plays). " +
      "facebook_posts: Facebook post reach, reactions, shares. " +
      "youtube: YouTube video metrics (views, likes, comments). " +
      "tiktok: TikTok video stats (plays, likes, shares, comments).",
  }),
  urls: Type.Optional(Type.Array(Type.String(), { description: "Post/video/profile/channel URLs to analyze." })),
  hashtags: Type.Optional(Type.Array(Type.String(), { description: "Hashtags to search (without # prefix). Instagram and TikTok only." })),
  maxResults: Type.Optional(Type.Number({ minimum: 1, maximum: 200, description: "Max posts/videos per run (default: 20)." })),
  actorInput: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});

const RunRefSchema = Type.Object({ runId: Type.String(), source: stringEnum(SOURCES), datasetId: Type.String() });
const Schema = Type.Object({
  action: stringEnum(["start", "collect"] as const, { description: "'start' or 'collect'." }),
  requests: Type.Optional(Type.Array(RequestSchema)),
  runs: Type.Optional(Type.Array(RunRefSchema)),
});

function buildInput(req: Record<string, unknown>, source: Source, maxResults: number): Record<string, unknown> {
  const urls = readStringArrayParam(req, "urls");
  const hashtags = readStringArrayParam(req, "hashtags");
  const actorInput = req.actorInput && typeof req.actorInput === "object" && !Array.isArray(req.actorInput) ? (req.actorInput as Record<string, unknown>) : {};
  switch (source) {
    case "instagram_posts":
    case "instagram_reels":
      return {
        ...(urls?.length ? { directUrls: urls } : {}),
        ...(hashtags?.length ? { hashtags } : {}),
        resultsLimit: maxResults, ...actorInput,
      };
    case "facebook_posts":
      return { ...(urls?.length ? { startUrls: urls.map((u) => ({ url: u })) } : {}), maxPosts: maxResults, ...actorInput };
    case "youtube":
      return { ...(urls?.length ? { startUrls: urls.map((u) => ({ url: u })) } : {}), maxResults, ...actorInput };
    case "tiktok":
      return {
        ...(urls?.length ? { postURLs: urls } : {}),
        ...(hashtags?.length ? { hashtags } : {}),
        resultsPerPage: maxResults, ...actorInput,
      };
  }
}

function formatItem(source: Source, item: Record<string, unknown>): string {
  const lines: string[] = [];
  switch (source) {
    case "instagram_posts":
    case "instagram_reels": {
      lines.push(`## ${str(item.type || source)} — @${str(item.ownerUsername || (item.owner as Record<string, unknown>)?.username)}`);
      pushField(lines, "Likes", item.likesCount); pushField(lines, "Comments", item.commentsCount);
      pushField(lines, "Views", item.videoViewCount || item.playCount); pushField(lines, "Date", item.timestamp);
      if (item.caption) lines.push(`**Caption**: ${str(item.caption).slice(0, 200)}`);
      pushField(lines, "URL", item.url);
      break;
    }
    case "facebook_posts": {
      lines.push(`## Facebook Post — ${str(item.pageName || item.authorName)}`);
      pushField(lines, "Likes", item.likesCount || item.reactionsCount); pushField(lines, "Comments", item.commentsCount);
      pushField(lines, "Shares", item.sharesCount); pushField(lines, "Date", item.time || item.date);
      if (item.text) lines.push(`**Text**: ${str(item.text).slice(0, 300)}`);
      pushField(lines, "URL", item.url);
      break;
    }
    case "youtube": {
      lines.push(`## ${str(item.title)} — ${str(item.channelName)}`);
      pushField(lines, "Views", item.viewCount); pushField(lines, "Likes", item.likeCount);
      pushField(lines, "Comments", item.commentCount); pushField(lines, "Duration", item.duration);
      pushField(lines, "Published", item.date || item.publishedAt); pushField(lines, "URL", item.url);
      break;
    }
    case "tiktok": {
      lines.push(`## TikTok — @${str((item.authorMeta as Record<string, unknown>)?.name || item.author)}`);
      pushField(lines, "Views", item.playCount); pushField(lines, "Likes", item.diggCount);
      pushField(lines, "Shares", item.shareCount); pushField(lines, "Comments", item.commentCount);
      if (item.text) lines.push(`**Text**: ${str(item.text).slice(0, 200)}`);
      pushField(lines, "URL", item.webVideoUrl);
      break;
    }
  }
  lines.push(rawDataBlock(item));
  return lines.join("\n");
}

const TOOL_DESCRIPTION = `Measure social media content performance and engagement metrics across Instagram, Facebook, YouTube, and TikTok via Apify.

Use content_analytics for:
- Tracking post engagement (likes, comments, shares, views)
- Measuring campaign ROI across social platforms
- Analyzing reel/short-form video performance
- Comparing content performance across accounts
- Follower growth monitoring
- Ad effectiveness (for facebook_posts with ad data)

Sources: instagram_posts, instagram_reels, facebook_posts, youtube, tiktok

TWO-PHASE PATTERN: action="start" → action="collect"

EXAMPLE:
  { action: "start", requests: [
    { source: "instagram_posts", urls: ["https://www.instagram.com/p/ABC123/"], maxResults: 10 },
    { source: "tiktok", hashtags: ["productreview"], maxResults: 30 }
  ]}`;

export function createContentAnalyticsTool(options?: { pluginConfig?: Record<string, unknown> }): AnyAgentTool | null {
  const config = parsePluginConfig(options?.pluginConfig);
  const apiKey = resolveApiKey(config);
  if (!resolveEnabled({ config, apiKey })) return null;
  if (!isToolEnabled(config, "content_analytics")) return null;
  const baseUrl = resolveBaseUrl(config);
  const defaultMaxResults = resolveMaxResults(config, 200);
  const cacheTtlMs = resolveCacheTtlMs(config.cacheTtlMinutes, DEFAULT_CACHE_TTL_MINUTES);

  return {
    label: "Content Analytics",
    name: "content_analytics",
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
          cacheNamespace: "content-analytics", cache: CACHE, toolName: "content_analytics",
          formatItems: (source, items) => items.map((item) => { try { return formatItem(source as Source, item as Record<string, unknown>); } catch { return `\`\`\`json\n${JSON.stringify(item).slice(0, 200)}\n\`\`\``; } }).join("\n\n---\n\n"),
        }));
      }
      throw new ToolInputError(`Unknown action: "${action}".`);
    },
  };
}
