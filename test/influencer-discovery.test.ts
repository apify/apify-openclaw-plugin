import { describe, it, expect, vi, beforeEach } from "vitest";
import { createInfluencerDiscoveryTool } from "../src/tools/influencer-discovery-tool.js";
import { makeMockFetch, standardRunResponses, TEST_CONFIG } from "./helpers.js";

describe("influencer_discovery tool", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", makeMockFetch([]));
  });

  it("returns null when no API key", () => {
    expect(createInfluencerDiscoveryTool({ pluginConfig: {} })).toBeNull();
  });

  it("registers with correct name", () => {
    const tool = createInfluencerDiscoveryTool(TEST_CONFIG);
    expect(tool!.name).toBe("influencer_discovery");
    expect(tool!.label).toBe("Influencer Discovery");
  });

  it("start with instagram source", async () => {
    vi.stubGlobal("fetch", makeMockFetch([
      { ok: true, body: { data: { id: "run-1", defaultDatasetId: "ds-1", status: "RUNNING" } } },
    ]));
    const tool = createInfluencerDiscoveryTool(TEST_CONFIG)!;
    const result = await tool.execute("t1", {
      action: "start",
      requests: [{ source: "instagram", queries: ["fitness", "gym"], minFollowers: 10000 }],
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.action).toBe("start");
    expect(data.runs[0].source).toBe("instagram");
  });

  it("start with tiktok source", async () => {
    vi.stubGlobal("fetch", makeMockFetch([
      { ok: true, body: { data: { id: "run-2", defaultDatasetId: "ds-2", status: "RUNNING" } } },
    ]));
    const tool = createInfluencerDiscoveryTool(TEST_CONFIG)!;
    const result = await tool.execute("t1", {
      action: "start",
      requests: [{ source: "tiktok", queries: ["cooking", "recipes"] }],
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.runs[0].source).toBe("tiktok");
  });

  it("collect returns influencer profiles", async () => {
    const items = [{ username: "fitnessqueen", followersCount: 150000, postsCount: 800 }];
    vi.stubGlobal("fetch", makeMockFetch(standardRunResponses(items)));
    const tool = createInfluencerDiscoveryTool(TEST_CONFIG)!;
    await tool.execute("t1", { action: "start", requests: [{ source: "instagram", queries: ["fitness"] }] });
    const result = await tool.execute("t2", {
      action: "collect",
      runs: [{ runId: "run-123", source: "instagram", datasetId: "ds-456" }],
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.allDone).toBe(true);
    expect(data.completed[0].resultCount).toBe(1);
  });

  it("collect pending when RUNNING", async () => {
    vi.stubGlobal("fetch", makeMockFetch([
      { ok: true, body: { data: { status: "RUNNING", defaultDatasetId: "ds-1" } } },
    ]));
    const tool = createInfluencerDiscoveryTool(TEST_CONFIG)!;
    const result = await tool.execute("t1", {
      action: "collect",
      runs: [{ runId: "run-1", source: "youtube", datasetId: "ds-1" }],
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.allDone).toBe(false);
  });
});
