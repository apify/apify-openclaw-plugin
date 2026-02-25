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

const SOURCES = ["instagram", "youtube", "tiktok"] as const;
type Source = (typeof SOURCES)[number];

// Use profile scrapers and hashtag scrapers for discovery
const ACTOR_IDS: Record<Source, string> = {
  instagram: "apify~instagram-profile-scraper",
  youtube: "streamers~youtube-channel-scraper",
  tiktok: "clockworks~tiktok-scraper",
};

const RequestSchema = Type.Object({
  source: stringEnum(SOURCES, {
    description:
      "instagram: discover Instagram influencers by profile URL or hashtag. " +
      "youtube: discover YouTube influencers by channel URL or search. " +
      "tiktok: discover TikTok creators by profile URL or hashtag.",
  }),
  queries: Type.Optional(Type.Array(Type.String(), { description: "Hashtags or search terms to find influencers (without # prefix for hashtags)." })),
  urls: Type.Optional(Type.Array(Type.String(), { description: "Known influencer profile/channel URLs to analyze." })),
  minFollowers: Type.Optional(Type.Number({ minimum: 0, description: "Minimum follower count filter (applied after scraping)." })),
  maxResults: Type.Optional(Type.Number({ minimum: 1, maximum: 200, description: "Max profiles to return (default: 20)." })),
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
  const queries = readStringArrayParam(req, "queries");
  const actorInput = req.actorInput && typeof req.actorInput === "object" && !Array.isArray(req.actorInput) ? (req.actorInput as Record<string, unknown>) : {};
  switch (source) {
    case "instagram":
      return {
        usernames: urls?.map((u) => u.replace(/.*instagram\.com\//, "").replace(/\/$/, "")) ?? [],
        ...(queries?.length ? { hashtags: queries } : {}),
        resultsLimit: maxResults, ...actorInput,
      };
    case "youtube":
      return { ...(urls?.length ? { startUrls: urls.map((u) => ({ url: u })) } : {}), maxResults, ...actorInput };
    case "tiktok":
      return {
        profiles: urls?.map((u) => u.replace(/.*tiktok\.com\/@?/, "").replace(/\/$/, "")) ?? [],
        ...(queries?.length ? { hashtags: queries } : {}),
        resultsPerPage: maxResults, ...actorInput,
      };
  }
}

function formatItem(source: Source, item: Record<string, unknown>): string {
  const lines: string[] = [];
  switch (source) {
    case "instagram": {
      lines.push(`## @${str(item.username)} — Instagram Influencer`);
      pushField(lines, "Name", item.fullName); pushField(lines, "Followers", item.followersCount);
      pushField(lines, "Posts", item.postsCount); pushField(lines, "Avg Likes", item.avgLikes);
      pushField(lines, "Verified", item.verified); pushField(lines, "Bio", item.biography);
      pushField(lines, "URL", item.url || `https://instagram.com/${str(item.username)}`);
      break;
    }
    case "youtube": {
      lines.push(`## ${str(item.channelName || item.title)} — YouTube`);
      pushField(lines, "Subscribers", item.subscriberCount || item.numberOfSubscribers);
      pushField(lines, "Total Views", item.viewCount); pushField(lines, "Videos", item.videoCount);
      pushField(lines, "Description", (item.description as string)?.slice(0, 200));
      pushField(lines, "URL", item.channelUrl || item.url);
      break;
    }
    case "tiktok": {
      const am = item.authorMeta as Record<string, unknown> | undefined;
      lines.push(`## @${str(item.uniqueId || am?.name)} — TikTok`);
      pushField(lines, "Followers", am?.fans || item.followerCount);
      pushField(lines, "Likes", am?.heart || item.heartCount);
      pushField(lines, "Videos", am?.video); pushField(lines, "Verified", am?.verified);
      pushField(lines, "URL", item.webVideoUrl || `https://tiktok.com/@${str(item.uniqueId)}`);
      break;
    }
  }
  lines.push(rawDataBlock(item));
  return lines.join("\n");
}

const TOOL_DESCRIPTION = `Find and evaluate social media influencers for brand partnerships on Instagram, YouTube, and TikTok via Apify.

Use influencer_discovery for:
- Finding influencers in a niche by hashtag or keyword
- Evaluating specific accounts for partnership potential
- Comparing influencer reach and engagement across platforms
- Building shortlists of micro/macro influencers by follower count
- Verifying influencer authenticity (follower/engagement ratio)

Sources: instagram, youtube, tiktok

The minFollowers parameter filters results after scraping — useful for targeting specific tiers (nano: 1k-10k, micro: 10k-100k, macro: 100k+).

TWO-PHASE PATTERN: action="start" → action="collect"

EXAMPLE:
  { action: "start", requests: [
    { source: "instagram", queries: ["fitness"], minFollowers: 10000, maxResults: 50 },
    { source: "tiktok", queries: ["veganfood"], maxResults: 30 }
  ]}`;

export function createInfluencerDiscoveryTool(options?: { pluginConfig?: Record<string, unknown> }): AnyAgentTool | null {
  const config = parsePluginConfig(options?.pluginConfig);
  const apiKey = resolveApiKey(config);
  if (!resolveEnabled({ config, apiKey })) return null;
  if (!isToolEnabled(config, "influencer_discovery")) return null;
  const baseUrl = resolveBaseUrl(config);
  const defaultMaxResults = resolveMaxResults(config, 200);
  const cacheTtlMs = resolveCacheTtlMs(config.cacheTtlMinutes, DEFAULT_CACHE_TTL_MINUTES);

  return {
    label: "Influencer Discovery",
    name: "influencer_discovery",
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
          cacheNamespace: "influencer-discovery", cache: CACHE, toolName: "influencer_discovery",
          formatItems: (source, items) => items.map((item) => { try { return formatItem(source as Source, item as Record<string, unknown>); } catch { return `\`\`\`json\n${JSON.stringify(item).slice(0, 200)}\n\`\`\``; } }).join("\n\n---\n\n"),
        }));
      }
      throw new ToolInputError(`Unknown action: "${action}".`);
    },
  };
}
