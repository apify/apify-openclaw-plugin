import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMarketResearchTool } from "../src/tools/market-research-tool.js";
import { makeMockFetch, standardRunResponses, TEST_CONFIG } from "./helpers.js";

describe("market_research tool", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", makeMockFetch([]));
  });

  it("returns null when no API key", () => {
    const tool = createMarketResearchTool({ pluginConfig: {} });
    expect(tool).toBeNull();
  });

  it("returns null when tool is disabled via enabledTools", () => {
    const tool = createMarketResearchTool({
      pluginConfig: { apiKey: "test-key", enabledTools: ["competitor_intelligence"] },
    });
    expect(tool).toBeNull();
  });

  it("registers with correct name and label", () => {
    const tool = createMarketResearchTool(TEST_CONFIG);
    expect(tool).not.toBeNull();
    expect(tool!.name).toBe("market_research");
    expect(tool!.label).toBe("Market Research");
  });

  it("start action fires actor run and returns run refs", async () => {
    vi.stubGlobal("fetch", makeMockFetch([
      { ok: true, body: { data: { id: "run-1", defaultDatasetId: "ds-1", status: "RUNNING" } } },
    ]));
    const tool = createMarketResearchTool(TEST_CONFIG)!;
    const result = await tool.execute("t1", {
      action: "start",
      requests: [{ source: "google_maps", queries: ["coffee shops in Austin"] }],
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.action).toBe("start");
    expect(data.runs).toHaveLength(1);
    expect(data.runs[0].source).toBe("google_maps");
    expect(data.runs[0].runId).toBe("run-1");
  });

  it("collect action returns results when run SUCCEEDED", async () => {
    const items = [{ title: "Blue Bottle Coffee", totalScore: 4.8, address: "Austin, TX" }];
    vi.stubGlobal("fetch", makeMockFetch(standardRunResponses(items)));
    const tool = createMarketResearchTool(TEST_CONFIG)!;

    // start
    await tool.execute("t1", {
      action: "start",
      requests: [{ source: "google_maps", queries: ["coffee"] }],
    });

    // collect
    const result = await tool.execute("t2", {
      action: "collect",
      runs: [{ runId: "run-123", source: "google_maps", datasetId: "ds-456" }],
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.action).toBe("collect");
    expect(data.allDone).toBe(true);
    expect(data.completed).toHaveLength(1);
    expect(data.completed[0].resultCount).toBe(1);
    expect(data.completed[0].status).toBe("SUCCEEDED");
  });

  it("collect action marks pending when run still RUNNING", async () => {
    vi.stubGlobal("fetch", makeMockFetch([
      { ok: true, body: { data: { status: "RUNNING", defaultDatasetId: "ds-456" } } },
    ]));
    const tool = createMarketResearchTool(TEST_CONFIG)!;
    const result = await tool.execute("t1", {
      action: "collect",
      runs: [{ runId: "run-123", source: "google_maps", datasetId: "ds-456" }],
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.allDone).toBe(false);
    expect(data.pending).toHaveLength(1);
    expect(data.pending[0].pending).toBe(true);
  });

  it("start action handles booking source", async () => {
    vi.stubGlobal("fetch", makeMockFetch([
      { ok: true, body: { data: { id: "run-2", defaultDatasetId: "ds-2", status: "RUNNING" } } },
    ]));
    const tool = createMarketResearchTool(TEST_CONFIG)!;
    const result = await tool.execute("t1", {
      action: "start",
      requests: [{ source: "booking", queries: ["hotels in London"], maxResults: 10 }],
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.runs[0].source).toBe("booking");
  });

  it("throws on unknown action", async () => {
    const tool = createMarketResearchTool(TEST_CONFIG)!;
    await expect(tool.execute("t1", { action: "unknown" })).rejects.toThrow();
  });
});
