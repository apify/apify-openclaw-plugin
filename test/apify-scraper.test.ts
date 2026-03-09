import { describe, it, expect } from "vitest";
import { createApifyScraperTool } from "../src/tools/apify-scraper-tool.js";
import { makeMockClient, TEST_CONFIG, TEST_CONFIG_WITH_CACHE } from "./helpers.js";

describe("apify_scraper tool", () => {
  it("returns null when no API key", () => {
    expect(createApifyScraperTool({ pluginConfig: {} })).toBeNull();
  });

  it("registers with correct name", () => {
    const tool = createApifyScraperTool({ ...TEST_CONFIG, client: makeMockClient() });
    expect(tool!.name).toBe("apify_scraper");
    expect(tool!.label).toBe("Apify Scraper");
  });

  it("discover action — store search", async () => {
    const client = makeMockClient({
      storeList: async () => ({
        items: [
          { id: "abc", name: "google-search-scraper", username: "apify", title: "Google Search Scraper", description: "Scrape Google Search results", stats: { totalRuns: 1000000 }, currentPricingInfo: {} },
        ],
        total: 1, count: 1, offset: 0, limit: 10, desc: false,
      }),
    });
    const tool = createApifyScraperTool({ ...TEST_CONFIG, client })!;
    const result = await tool.execute("t1", { action: "discover", query: "google search" });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.action).toBe("discover");
    expect(data.count).toBe(1);
    expect(data.text).toContain("Google Search Scraper");
  });

  it("discover action — Actor schema fetch via lastBuild", async () => {
    const client = makeMockClient({
      lastBuildGet: async () => ({
        inputSchema: JSON.stringify({
          title: "Google Search Scraper",
          type: "object",
          properties: { queries: { type: "array", description: "Search queries" } },
        }),
        readme: "# Google Search Scraper\nScrape Google search results.",
        actorDefinition: null,
      }),
      actorGet: async () => ({
        name: "google-search-scraper",
        title: "Google Search Scraper",
        username: "apify",
        description: "Scrape Google Search results",
      }),
    });
    const tool = createApifyScraperTool({ ...TEST_CONFIG, client })!;
    const result = await tool.execute("t1", { action: "discover", actorId: "apify~google-search-scraper" });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.action).toBe("discover");
    expect(data.actorId).toBe("apify~google-search-scraper");
    expect(data.inputSchema).toBeDefined();
    expect(data.readme).toBeDefined();
    expect(data.tip).toContain("action='start'");
  });

  it("discover action — requires query or actorId", async () => {
    const client = makeMockClient();
    const tool = createApifyScraperTool({ ...TEST_CONFIG, client })!;
    await expect(tool.execute("t1", { action: "discover" })).rejects.toThrow();
  });

  it("start action fires Actor run", async () => {
    const client = makeMockClient({
      actorStart: async () => ({ id: "run-1", defaultDatasetId: "ds-1", status: "RUNNING" }),
    });
    const tool = createApifyScraperTool({ ...TEST_CONFIG, client })!;
    const result = await tool.execute("t1", {
      action: "start",
      actorId: "apify~google-search-scraper",
      input: { queries: ["OpenAI"], maxPagesPerQuery: 1 },
      label: "google-search",
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.action).toBe("start");
    expect(data.runs).toHaveLength(1);
    expect(data.runs[0].runId).toBe("run-1");
    expect(data.runs[0].actorId).toBe("apify~google-search-scraper");
    expect(data.runs[0].label).toBe("google-search");
  });

  it("collect action returns results when SUCCEEDED", async () => {
    const items = [{ title: "OpenAI - Wikipedia", url: "https://en.wikipedia.org/wiki/OpenAI" }];
    const client = makeMockClient({
      runGet: async () => ({ id: "run-123", status: "SUCCEEDED", defaultDatasetId: "ds-456" }),
      datasetListItems: async () => ({ items, total: 1, count: 1, offset: 0, limit: 100, desc: false }),
    });
    const tool = createApifyScraperTool({ ...TEST_CONFIG, client })!;
    const result = await tool.execute("t1", {
      action: "collect",
      runs: [{ runId: "run-123", actorId: "apify~google-search-scraper", datasetId: "ds-456" }],
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.action).toBe("collect");
    expect(data.allDone).toBe(true);
    expect(data.completed).toHaveLength(1);
    expect(data.completed[0].resultCount).toBe(1);
  });

  it("collect action marks pending when RUNNING", async () => {
    const client = makeMockClient({
      runGet: async () => ({ id: "run-1", status: "RUNNING", defaultDatasetId: "ds-1" }),
    });
    const tool = createApifyScraperTool({ ...TEST_CONFIG, client })!;
    const result = await tool.execute("t1", {
      action: "collect",
      runs: [{ runId: "run-1", actorId: "apify~some-actor", datasetId: "ds-1" }],
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.allDone).toBe(false);
    expect(data.pending).toHaveLength(1);
  });

  it("throws on unknown action", async () => {
    const client = makeMockClient();
    const tool = createApifyScraperTool({ ...TEST_CONFIG, client })!;
    await expect(tool.execute("t1", { action: "unknown" })).rejects.toThrow();
  });

  it("returns null when apify_scraper is excluded from enabledTools", () => {
    const tool = createApifyScraperTool({
      pluginConfig: { apiKey: "test-key", enabledTools: ["other_tool"] as string[] },
    });
    expect(tool).toBeNull();
  });

  it("no previousRuns when cache is empty", async () => {
    const client = makeMockClient({
      storeList: async () => ({
        items: [], total: 0, count: 0, offset: 0, limit: 10, desc: false,
      }),
    });
    const tool = createApifyScraperTool({ ...TEST_CONFIG, client })!;
    const result = await tool.execute("t1", { action: "discover", query: "test" });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.previousRuns).toBeUndefined();
  });

  it("previousRuns injected after collect populates cache", async () => {
    const items = [{ title: "Result 1" }, { title: "Result 2" }];
    const client = makeMockClient({
      runGet: async () => ({ id: "run-cache-1", status: "SUCCEEDED", defaultDatasetId: "ds-cache-1", defaultKeyValueStoreId: "kv-1" }),
      datasetListItems: async () => ({ items, total: 2, count: 2, offset: 0, limit: 100, desc: false }),
      kvStoreGetRecord: async () => ({ value: { queries: ["test query"], maxResults: 5 } }),
      storeList: async () => ({
        items: [], total: 0, count: 0, offset: 0, limit: 10, desc: false,
      }),
    });
    const tool = createApifyScraperTool({ ...TEST_CONFIG_WITH_CACHE, client })!;

    // First: collect to populate cache
    await tool.execute("t1", {
      action: "collect",
      runs: [{ runId: "run-cache-1", actorId: "apify~test-scraper", datasetId: "ds-cache-1" }],
    });

    // Second: any action should include previousRuns
    const result = await tool.execute("t2", { action: "discover", query: "something" });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.previousRuns).toBeDefined();
    expect(data.previousRuns).toContain("apify~test-scraper");
    expect(data.previousRuns).toContain("2 results");
    expect(data.previousRuns).toContain("run:run-cache-1");
    expect(data.previousRuns).toContain("ds:ds-cache-1");
    expect(data.previousRuns).toContain("queries: [\"test query\"]");
  });
});
