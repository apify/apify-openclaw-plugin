import { describe, it, expect, vi, beforeEach } from "vitest";
import { createApifyScraperTool } from "../src/tools/apify-scraper-tool.js";
import { makeMockFetch, standardRunResponses, TEST_CONFIG } from "./helpers.js";

describe("apify_scraper tool", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", makeMockFetch([]));
  });

  it("returns null when no API key", () => {
    expect(createApifyScraperTool({ pluginConfig: {} })).toBeNull();
  });

  it("registers with correct name", () => {
    const tool = createApifyScraperTool(TEST_CONFIG);
    expect(tool!.name).toBe("apify_scraper");
    expect(tool!.label).toBe("Apify Scraper");
  });

  it("discover action — store search", async () => {
    vi.stubGlobal("fetch", makeMockFetch([
      {
        ok: true,
        body: {
          data: {
            items: [
              { id: "abc", name: "google-search-scraper", username: "apify", title: "Google Search Scraper", description: "Scrape Google Search results", stats: { totalRuns: 1000000 } },
            ],
          },
        },
      },
    ]));
    const tool = createApifyScraperTool(TEST_CONFIG)!;
    const result = await tool.execute("t1", { action: "discover", query: "google search" });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.action).toBe("discover");
    expect(data.count).toBe(1);
    expect(data.text).toContain("Google Search Scraper");
  });

  it("discover action — actor schema fetch via builds/default", async () => {
    vi.stubGlobal("fetch", makeMockFetch([
      {
        ok: true,
        body: {
          data: {
            name: "google-search-scraper",
            title: "Google Search Scraper",
            username: "apify",
            description: "Scrape Google Search results",
            inputSchema: JSON.stringify({
              title: "Google Search Scraper",
              type: "object",
              properties: { queries: { type: "array", description: "Search queries" } },
            }),
            readme: "# Google Search Scraper\nScrape Google search results.",
          },
        },
      },
    ]));
    const tool = createApifyScraperTool(TEST_CONFIG)!;
    const result = await tool.execute("t1", { action: "discover", actorId: "apify~google-search-scraper" });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.action).toBe("discover");
    expect(data.actorId).toBe("apify~google-search-scraper");
    expect(data.inputSchema).toBeDefined();
    expect(data.readme).toBeDefined();
    expect(data.tip).toContain("action='start'");
  });

  it("discover action — requires query or actorId", async () => {
    const tool = createApifyScraperTool(TEST_CONFIG)!;
    await expect(tool.execute("t1", { action: "discover" })).rejects.toThrow();
  });

  it("start action fires actor run", async () => {
    vi.stubGlobal("fetch", makeMockFetch([
      { ok: true, body: { data: { id: "run-1", defaultDatasetId: "ds-1", status: "RUNNING" } } },
    ]));
    const tool = createApifyScraperTool(TEST_CONFIG)!;
    const result = await tool.execute("t1", {
      action: "start",
      actorId: "apify/google-search-scraper",
      input: { queries: ["OpenAI"], maxPagesPerQuery: 1 },
      label: "google-search",
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.action).toBe("start");
    expect(data.runs).toHaveLength(1);
    expect(data.runs[0].runId).toBe("run-1");
    expect(data.runs[0].actorId).toBe("apify/google-search-scraper");
    expect(data.runs[0].label).toBe("google-search");
  });

  it("collect action returns results when SUCCEEDED", async () => {
    const items = [{ title: "OpenAI - Wikipedia", url: "https://en.wikipedia.org/wiki/OpenAI" }];
    vi.stubGlobal("fetch", makeMockFetch([
      // status check
      { ok: true, body: { data: { status: "SUCCEEDED", defaultDatasetId: "ds-456" } } },
      // dataset items
      { ok: true, body: items },
    ]));
    const tool = createApifyScraperTool(TEST_CONFIG)!;
    const result = await tool.execute("t1", {
      action: "collect",
      runs: [{ runId: "run-123", actorId: "apify/google-search-scraper", datasetId: "ds-456" }],
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.action).toBe("collect");
    expect(data.allDone).toBe(true);
    expect(data.completed).toHaveLength(1);
    expect(data.completed[0].resultCount).toBe(1);
  });

  it("collect action marks pending when RUNNING", async () => {
    vi.stubGlobal("fetch", makeMockFetch([
      { ok: true, body: { data: { status: "RUNNING", defaultDatasetId: "ds-1" } } },
    ]));
    const tool = createApifyScraperTool(TEST_CONFIG)!;
    const result = await tool.execute("t1", {
      action: "collect",
      runs: [{ runId: "run-1", actorId: "apify/some-actor", datasetId: "ds-1" }],
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.allDone).toBe(false);
    expect(data.pending).toHaveLength(1);
  });

  it("throws on unknown action", async () => {
    const tool = createApifyScraperTool(TEST_CONFIG)!;
    await expect(tool.execute("t1", { action: "unknown" })).rejects.toThrow();
  });

  it("returns null when apify_scraper is excluded from enabledTools", () => {
    // Non-empty enabledTools that doesn't include "apify_scraper" disables the tool
    const tool = createApifyScraperTool({
      pluginConfig: { apiKey: "test-key", enabledTools: ["other_tool"] as string[] },
    });
    expect(tool).toBeNull();
  });
});
