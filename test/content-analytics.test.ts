import { describe, it, expect, vi, beforeEach } from "vitest";
import { createContentAnalyticsTool } from "../src/tools/content-analytics-tool.js";
import { makeMockFetch, standardRunResponses, TEST_CONFIG } from "./helpers.js";

describe("content_analytics tool", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", makeMockFetch([]));
  });

  it("returns null when no API key", () => {
    expect(createContentAnalyticsTool({ pluginConfig: {} })).toBeNull();
  });

  it("registers with correct name", () => {
    const tool = createContentAnalyticsTool(TEST_CONFIG);
    expect(tool!.name).toBe("content_analytics");
    expect(tool!.label).toBe("Content Analytics");
  });

  it("start with instagram_posts source", async () => {
    vi.stubGlobal("fetch", makeMockFetch([
      { ok: true, body: { data: { id: "run-1", defaultDatasetId: "ds-1", status: "RUNNING" } } },
    ]));
    const tool = createContentAnalyticsTool(TEST_CONFIG)!;
    const result = await tool.execute("t1", {
      action: "start",
      requests: [{ source: "instagram_posts", urls: ["https://www.instagram.com/nike/"] }],
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.action).toBe("start");
    expect(data.runs[0].source).toBe("instagram_posts");
  });

  it("start with tiktok source", async () => {
    vi.stubGlobal("fetch", makeMockFetch([
      { ok: true, body: { data: { id: "run-2", defaultDatasetId: "ds-2", status: "RUNNING" } } },
    ]));
    const tool = createContentAnalyticsTool(TEST_CONFIG)!;
    const result = await tool.execute("t1", {
      action: "start",
      requests: [{ source: "tiktok", urls: ["https://www.tiktok.com/@nike"] }],
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.runs[0].source).toBe("tiktok");
  });

  it("collect returns content results", async () => {
    const items = [{ id: "post123", likesCount: 1500, commentsCount: 42, caption: "Just do it" }];
    vi.stubGlobal("fetch", makeMockFetch(standardRunResponses(items)));
    const tool = createContentAnalyticsTool(TEST_CONFIG)!;
    await tool.execute("t1", { action: "start", requests: [{ source: "instagram_posts", urls: ["https://www.instagram.com/nike/"] }] });
    const result = await tool.execute("t2", {
      action: "collect",
      runs: [{ runId: "run-123", source: "instagram_posts", datasetId: "ds-456" }],
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.allDone).toBe(true);
    expect(data.completed[0].resultCount).toBe(1);
  });

  it("collect pending when RUNNING", async () => {
    vi.stubGlobal("fetch", makeMockFetch([
      { ok: true, body: { data: { status: "RUNNING", defaultDatasetId: "ds-1" } } },
    ]));
    const tool = createContentAnalyticsTool(TEST_CONFIG)!;
    const result = await tool.execute("t1", {
      action: "collect",
      runs: [{ runId: "run-1", source: "youtube", datasetId: "ds-1" }],
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.allDone).toBe(false);
  });

  it("start with facebook_posts source", async () => {
    vi.stubGlobal("fetch", makeMockFetch([
      { ok: true, body: { data: { id: "run-3", defaultDatasetId: "ds-3", status: "RUNNING" } } },
    ]));
    const tool = createContentAnalyticsTool(TEST_CONFIG)!;
    const result = await tool.execute("t1", {
      action: "start",
      requests: [{ source: "facebook_posts", urls: ["https://www.facebook.com/nike/"] }],
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.runs[0].source).toBe("facebook_posts");
  });
});
