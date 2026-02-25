import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAudienceAnalysisTool } from "../src/tools/audience-analysis-tool.js";
import { makeMockFetch, standardRunResponses, TEST_CONFIG } from "./helpers.js";

describe("audience_analysis tool", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", makeMockFetch([]));
  });

  it("returns null when no API key", () => {
    expect(createAudienceAnalysisTool({ pluginConfig: {} })).toBeNull();
  });

  it("registers with correct name", () => {
    const tool = createAudienceAnalysisTool(TEST_CONFIG);
    expect(tool!.name).toBe("audience_analysis");
    expect(tool!.label).toBe("Audience Analysis");
  });

  it("start with instagram_profile source", async () => {
    vi.stubGlobal("fetch", makeMockFetch([
      { ok: true, body: { data: { id: "run-1", defaultDatasetId: "ds-1", status: "RUNNING" } } },
    ]));
    const tool = createAudienceAnalysisTool(TEST_CONFIG)!;
    const result = await tool.execute("t1", {
      action: "start",
      requests: [{ source: "instagram_profile", urls: ["https://www.instagram.com/nike/"] }],
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.action).toBe("start");
    expect(data.runs[0].source).toBe("instagram_profile");
  });

  it("start with youtube_channel source", async () => {
    vi.stubGlobal("fetch", makeMockFetch([
      { ok: true, body: { data: { id: "run-2", defaultDatasetId: "ds-2", status: "RUNNING" } } },
    ]));
    const tool = createAudienceAnalysisTool(TEST_CONFIG)!;
    const result = await tool.execute("t1", {
      action: "start",
      requests: [{ source: "youtube_channel", urls: ["https://www.youtube.com/@nike"] }],
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.runs[0].source).toBe("youtube_channel");
  });

  it("collect returns profile data", async () => {
    const items = [{ username: "nike", followersCount: 310000000, postsCount: 1200 }];
    vi.stubGlobal("fetch", makeMockFetch(standardRunResponses(items)));
    const tool = createAudienceAnalysisTool(TEST_CONFIG)!;
    await tool.execute("t1", { action: "start", requests: [{ source: "instagram_profile", urls: ["https://www.instagram.com/nike/"] }] });
    const result = await tool.execute("t2", {
      action: "collect",
      runs: [{ runId: "run-123", source: "instagram_profile", datasetId: "ds-456" }],
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.allDone).toBe(true);
    expect(data.completed[0].resultCount).toBe(1);
  });

  it("collect pending when RUNNING", async () => {
    vi.stubGlobal("fetch", makeMockFetch([
      { ok: true, body: { data: { status: "RUNNING", defaultDatasetId: "ds-1" } } },
    ]));
    const tool = createAudienceAnalysisTool(TEST_CONFIG)!;
    const result = await tool.execute("t1", {
      action: "collect",
      runs: [{ runId: "run-1", source: "tiktok_profile", datasetId: "ds-1" }],
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.allDone).toBe(false);
  });

  it("start with tiktok_profile source", async () => {
    vi.stubGlobal("fetch", makeMockFetch([
      { ok: true, body: { data: { id: "run-3", defaultDatasetId: "ds-3", status: "RUNNING" } } },
    ]));
    const tool = createAudienceAnalysisTool(TEST_CONFIG)!;
    const result = await tool.execute("t1", {
      action: "start",
      requests: [{ source: "tiktok_profile", urls: ["https://www.tiktok.com/@nike"] }],
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.runs[0].source).toBe("tiktok_profile");
  });
});
