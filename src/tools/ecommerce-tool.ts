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

// Single actor, source maps to "action" in the actor sense
const ACTOR_ID = "apify~e-commerce-scraping-tool";
const SOURCES = ["products", "reviews", "sellers"] as const;
type Source = (typeof SOURCES)[number];

const RequestSchema = Type.Object({
  source: stringEnum(SOURCES, {
    description:
      "products: product details, pricing, availability from 50+ marketplaces (Amazon, Walmart, IKEA, eBay…). " +
      "reviews: customer reviews and ratings for specific products. " +
      "sellers: discover sellers across marketplaces via Google Shopping.",
  }),
  urls: Type.Optional(Type.Array(Type.String(), { description: "Product/category/listing page URLs (for products and reviews)." })),
  queries: Type.Optional(Type.Array(Type.String(), { description: "Search terms for seller discovery via Google Shopping (for sellers source)." })),
  country: Type.Optional(Type.String({ description: "Country code for regional site selection (e.g. 'US', 'DE', 'GB'). Default: 'US'." })),
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
  const urls = readStringArrayParam(req, "urls");
  const queries = readStringArrayParam(req, "queries");
  const actorInput = req.actorInput && typeof req.actorInput === "object" && !Array.isArray(req.actorInput) ? (req.actorInput as Record<string, unknown>) : {};
  const country = typeof req.country === "string" ? req.country : "US";

  switch (source) {
    case "products":
      return { ...(urls?.length ? { detailsUrls: urls.map((u) => ({ url: u })) } : {}), maxItems: maxResults, country, ...actorInput };
    case "reviews":
      return { ...(urls?.length ? { reviewListingUrls: urls.map((u) => ({ url: u })) } : {}), maxItems: maxResults, country, ...actorInput };
    case "sellers":
      return { ...(queries?.length ? { keywords: queries } : {}), maxItems: maxResults, country, ...actorInput };
  }
}

function formatItem(source: Source, item: Record<string, unknown>): string {
  const lines: string[] = [];
  switch (source) {
    case "products": {
      lines.push(`## ${str(item.title || item.name)}`);
      pushField(lines, "Price", item.price || item.currentPrice); pushField(lines, "Original Price", item.originalPrice);
      pushField(lines, "Rating", item.rating); pushField(lines, "Reviews", item.reviewsCount);
      pushField(lines, "Brand", item.brand); pushField(lines, "In Stock", item.inStock);
      pushField(lines, "Store", item.seller || item.store); pushField(lines, "URL", item.url);
      break;
    }
    case "reviews": {
      lines.push(`## Review: ${str(item.title || item.reviewTitle)}`);
      pushField(lines, "Rating", item.rating || item.stars); pushField(lines, "Date", item.date || item.publishedAt);
      pushField(lines, "Verified", item.verifiedPurchase); pushField(lines, "Product", item.productTitle);
      if (item.body || item.text) lines.push(`\n${str(item.body || item.text).slice(0, 500)}`);
      break;
    }
    case "sellers": {
      lines.push(`## ${str(item.sellerName || item.seller || item.title)}`);
      pushField(lines, "Product", item.productTitle || item.name); pushField(lines, "Price", item.price);
      pushField(lines, "Platform", item.domain || item.store); pushField(lines, "URL", item.url);
      break;
    }
  }
  lines.push(rawDataBlock(item));
  return lines.join("\n");
}

const TOOL_DESCRIPTION = `Scrape e-commerce data from Amazon, Walmart, IKEA, eBay, and 50+ marketplaces via Apify.

Use ecommerce for:
- Price monitoring and comparison across marketplaces
- Competitor product analysis (titles, descriptions, images)
- Review sentiment analysis (customer opinions on products)
- Seller/reseller discovery via Google Shopping
- MAP (minimum advertised price) violation detection

Sources:
- products: Product details, pricing, availability (use detailsUrls for product pages)
- reviews: Customer reviews for products (use reviewListingUrls)
- sellers: Find who sells a product and at what price (use keyword search)

Supported sites: Amazon (20+ regional), Walmart, Costco, Home Depot, IKEA (40+ variants), eBay, Allegro, and more.

TWO-PHASE PATTERN: action="start" → action="collect"

EXAMPLES:
  { action: "start", requests: [
    { source: "products", urls: ["https://www.amazon.com/dp/B08N5WRWNW"], maxResults: 1 },
    { source: "sellers", queries: ["Nike Air Max 90"], country: "US", maxResults: 20 }
  ]}`;

export function createEcommerceTool(options?: { pluginConfig?: Record<string, unknown> }): AnyAgentTool | null {
  const config = parsePluginConfig(options?.pluginConfig);
  const apiKey = resolveApiKey(config);
  if (!resolveEnabled({ config, apiKey })) return null;
  if (!isToolEnabled(config, "ecommerce")) return null;
  const baseUrl = resolveBaseUrl(config);
  const defaultMaxResults = resolveMaxResults(config, 200);
  const cacheTtlMs = resolveCacheTtlMs(config.cacheTtlMinutes, DEFAULT_CACHE_TTL_MINUTES);

  return {
    label: "Ecommerce",
    name: "ecommerce",
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
          return { source, actorId: ACTOR_ID, input: buildInput(req, source, maxResults) };
        });
        return jsonResult(await runTwoPhaseStart({ prepared, apiKey, baseUrl }));
      }
      if (action === "collect") {
        return jsonResult(await runTwoPhaseCollect({
          runs: typedArgs.runs as Record<string, unknown>[],
          apiKey, baseUrl, cacheTtlMs,
          cacheNamespace: "ecommerce", cache: CACHE, toolName: "ecommerce",
          formatItems: (source, items) => items.map((item) => { try { return formatItem(source as Source, item as Record<string, unknown>); } catch { return `\`\`\`json\n${JSON.stringify(item).slice(0, 200)}\n\`\`\``; } }).join("\n\n---\n\n"),
        }));
      }
      throw new ToolInputError(`Unknown action: "${action}".`);
    },
  };
}
