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

const SOURCES = ["instagram_profile", "facebook_followers", "youtube_channel", "tiktok_profile"] as const;
type Source = (typeof SOURCES)[number];

const ACTOR_IDS: Record<Source, string> = {
  instagram_profile: "apify/instagram-profile-scraper",
  facebook_followers: "apify/facebook-followers-following-scraper",
  youtube_channel: "streamers/youtube-channel-scraper",
  tiktok_profile: "clockworks/tiktok-profile-scraper",
};

const RequestSchema = Type.Object({
  source: stringEnum(SOURCES, {
    description:
      "instagram_profile: profile details, follower count, bio, post stats. " +
      "facebook_followers: follower list and demographics for Facebook pages. " +
      "youtube_channel: channel stats, subscriber count, video metrics. " +
      "tiktok_profile: TikTok profile info, followers, following, video list.",
  }),
  urls: Type.Optional(Type.Array(Type.String(), { description: "Profile/channel URLs." })),
  maxResults: Type.Optional(Type.Number({ minimum: 1, maximum: 200, description: "Max profiles/followers per run (default: 20)." })),
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
  const actorInput = req.actorInput && typeof req.actorInput === "object" && !Array.isArray(req.actorInput) ? (req.actorInput as Record<string, unknown>) : {};
  switch (source) {
    case "instagram_profile":
      return { usernames: urls?.map((u) => u.replace(/.*instagram\.com\//, "").replace(/\/$/, "")) ?? [], ...actorInput };
    case "facebook_followers":
      return { ...(urls?.length ? { startUrls: urls.map((u) => ({ url: u })) } : {}), maxItems: maxResults, ...actorInput };
    case "youtube_channel":
      return { ...(urls?.length ? { startUrls: urls.map((u) => ({ url: u })) } : {}), maxResults, ...actorInput };
    case "tiktok_profile":
      return { profiles: urls?.map((u) => u.replace(/.*tiktok\.com\/@?/, "").replace(/\/$/, "")) ?? [], resultsPerPage: maxResults, ...actorInput };
  }
}

function formatItem(source: Source, item: Record<string, unknown>): string {
  const lines: string[] = [];
  switch (source) {
    case "instagram_profile": {
      lines.push(`## @${str(item.username)} — Instagram`);
      pushField(lines, "Name", item.fullName); pushField(lines, "Followers", item.followersCount);
      pushField(lines, "Following", item.followsCount); pushField(lines, "Posts", item.postsCount);
      pushField(lines, "Verified", item.verified); pushField(lines, "Bio", item.biography);
      pushField(lines, "External URL", item.externalUrl);
      break;
    }
    case "facebook_followers": {
      lines.push(`## Facebook Follower: ${str(item.name || item.username)}`);
      pushField(lines, "ID", item.id); pushField(lines, "URL", item.url);
      break;
    }
    case "youtube_channel": {
      lines.push(`## ${str(item.channelName || item.title)} — YouTube`);
      pushField(lines, "Subscribers", item.subscriberCount || item.numberOfSubscribers);
      pushField(lines, "Total Views", item.viewCount || item.numberOfViews);
      pushField(lines, "Videos", item.videoCount || item.numberOfVideos);
      pushField(lines, "Description", (item.description as string)?.slice(0, 200));
      pushField(lines, "URL", item.channelUrl || item.url);
      break;
    }
    case "tiktok_profile": {
      lines.push(`## @${str(item.uniqueId || item.username)} — TikTok`);
      pushField(lines, "Name", item.nickname); pushField(lines, "Followers", item.followerCount);
      pushField(lines, "Following", item.followingCount); pushField(lines, "Likes", item.heartCount);
      pushField(lines, "Videos", item.videoCount); pushField(lines, "Bio", item.signature);
      break;
    }
  }
  lines.push(rawDataBlock(item));
  return lines.join("\n");
}

const TOOL_DESCRIPTION = `Analyze audience demographics, follower profiles, and channel statistics across Instagram, Facebook, YouTube, and TikTok via Apify.

Use audience_analysis for:
- Understanding follower demographics and audience composition
- Comparing audience size across platforms for brands/creators
- Subscriber and engagement benchmarking for YouTube channels
- TikTok creator profile deep-dives
- Validating influencer reach and authenticity

Sources: instagram_profile, facebook_followers, youtube_channel, tiktok_profile

TWO-PHASE PATTERN: action="start" → action="collect"

EXAMPLE:
  { action: "start", requests: [
    { source: "instagram_profile", urls: ["https://www.instagram.com/nike/"] },
    { source: "youtube_channel", urls: ["https://www.youtube.com/@nike"] }
  ]}`;

export function createAudienceAnalysisTool(options?: { pluginConfig?: Record<string, unknown> }): AnyAgentTool | null {
  const config = parsePluginConfig(options?.pluginConfig);
  const apiKey = resolveApiKey(config);
  if (!resolveEnabled({ config, apiKey })) return null;
  if (!isToolEnabled(config, "audience_analysis")) return null;
  const baseUrl = resolveBaseUrl(config);
  const defaultMaxResults = resolveMaxResults(config, 200);
  const cacheTtlMs = resolveCacheTtlMs(config.cacheTtlMinutes, DEFAULT_CACHE_TTL_MINUTES);

  return {
    label: "Audience Analysis",
    name: "audience_analysis",
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
          cacheNamespace: "audience-analysis", cache: CACHE, toolName: "audience_analysis",
          formatItems: (source, items) => items.map((item) => { try { return formatItem(source as Source, item as Record<string, unknown>); } catch { return `\`\`\`json\n${JSON.stringify(item).slice(0, 200)}\n\`\`\``; } }).join("\n\n---\n\n"),
        }));
      }
      throw new ToolInputError(`Unknown action: "${action}".`);
    },
  };
}
