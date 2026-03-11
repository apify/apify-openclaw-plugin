import { describe, it, expect } from "vitest";
import { createApifyScraperTool } from "../src/tools/apify-scraper-tool.js";
import { makeMockClient, TEST_CONFIG } from "./helpers.js";

describe("apify tool", () => {
  it("returns null when no API key", () => {
    expect(createApifyScraperTool({ pluginConfig: {} })).toBeNull();
  });

  it("registers with correct name", () => {
    const tool = createApifyScraperTool({ ...TEST_CONFIG, client: makeMockClient() });
    expect(tool!.name).toBe("apify");
    expect(tool!.label).toBe("Apify");
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

  it("returns null when apify is excluded from enabledTools", () => {
    const tool = createApifyScraperTool({
      pluginConfig: { apiKey: "test-key", enabledTools: ["other_tool"] as string[] },
    });
    expect(tool).toBeNull();
  });

});
