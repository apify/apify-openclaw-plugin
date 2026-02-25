import { describe, it, expect, vi, beforeEach } from "vitest";
import { createBrandReputationTool } from "../src/tools/brand-reputation-tool.js";
import { makeMockFetch, standardRunResponses, TEST_CONFIG } from "./helpers.js";

describe("brand_reputation tool", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", makeMockFetch([]));
  });

  it("returns null when no API key", () => {
    expect(createBrandReputationTool({ pluginConfig: {} })).toBeNull();
  });

  it("registers with correct name", () => {
    const tool = createBrandReputationTool(TEST_CONFIG);
    expect(tool!.name).toBe("brand_reputation");
    expect(tool!.label).toBe("Brand Reputation");
  });

  it("start with google_maps source", async () => {
    vi.stubGlobal("fetch", makeMockFetch([
      { ok: true, body: { data: { id: "run-1", defaultDatasetId: "ds-1", status: "RUNNING" } } },
    ]));
    const tool = createBrandReputationTool(TEST_CONFIG)!;
    const result = await tool.execute("t1", {
      action: "start",
      requests: [{ source: "google_maps", queries: ["Nike Store New York"], maxResults: 30 }],
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.action).toBe("start");
    expect(data.runs[0].source).toBe("google_maps");
  });

  it("start with youtube_comments source", async () => {
    vi.stubGlobal("fetch", makeMockFetch([
      { ok: true, body: { data: { id: "run-2", defaultDatasetId: "ds-2", status: "RUNNING" } } },
    ]));
    const tool = createBrandReputationTool(TEST_CONFIG)!;
    const result = await tool.execute("t1", {
      action: "start",
      requests: [{ source: "youtube_comments", urls: ["https://www.youtube.com/watch?v=VIDEO_ID"] }],
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.runs[0].source).toBe("youtube_comments");
  });

  it("start with facebook_reviews source", async () => {
    vi.stubGlobal("fetch", makeMockFetch([
      { ok: true, body: { data: { id: "run-3", defaultDatasetId: "ds-3", status: "RUNNING" } } },
    ]));
    const tool = createBrandReputationTool(TEST_CONFIG)!;
    const result = await tool.execute("t1", {
      action: "start",
      requests: [{ source: "facebook_reviews", urls: ["https://www.facebook.com/nike/"] }],
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.runs[0].source).toBe("facebook_reviews");
  });

  it("collect returns review results", async () => {
    const items = [{ name: "John", stars: 5, text: "Amazing experience!", publishedAtDate: "2024-01" }];
    vi.stubGlobal("fetch", makeMockFetch(standardRunResponses(items)));
    const tool = createBrandReputationTool(TEST_CONFIG)!;
    await tool.execute("t1", { action: "start", requests: [{ source: "google_maps", queries: ["Nike"] }] });
    const result = await tool.execute("t2", {
      action: "collect",
      runs: [{ runId: "run-123", source: "google_maps", datasetId: "ds-456" }],
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.allDone).toBe(true);
    expect(data.completed[0].resultCount).toBe(1);
  });

  it("collect pending when RUNNING", async () => {
    vi.stubGlobal("fetch", makeMockFetch([
      { ok: true, body: { data: { status: "RUNNING", defaultDatasetId: "ds-1" } } },
    ]));
    const tool = createBrandReputationTool(TEST_CONFIG)!;
    const result = await tool.execute("t1", {
      action: "collect",
      runs: [{ runId: "run-1", source: "tiktok_comments", datasetId: "ds-1" }],
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.allDone).toBe(false);
  });
});
