import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCompetitorIntelligenceTool } from "../src/tools/competitor-intelligence-tool.js";
import { makeMockFetch, standardRunResponses, TEST_CONFIG } from "./helpers.js";

describe("competitor_intelligence tool", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", makeMockFetch([]));
  });

  it("returns null when no API key", () => {
    expect(createCompetitorIntelligenceTool({ pluginConfig: {} })).toBeNull();
  });

  it("registers with correct name", () => {
    const tool = createCompetitorIntelligenceTool(TEST_CONFIG);
    expect(tool!.name).toBe("competitor_intelligence");
    expect(tool!.label).toBe("Competitor Intelligence");
  });

  it("start action with google_maps source", async () => {
    vi.stubGlobal("fetch", makeMockFetch([
      { ok: true, body: { data: { id: "run-1", defaultDatasetId: "ds-1", status: "RUNNING" } } },
    ]));
    const tool = createCompetitorIntelligenceTool(TEST_CONFIG)!;
    const result = await tool.execute("t1", {
      action: "start",
      requests: [{ source: "google_maps", queries: ["Starbucks New York"] }],
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.action).toBe("start");
    expect(data.runs[0].source).toBe("google_maps");
  });

  it("start action with google_search source", async () => {
    vi.stubGlobal("fetch", makeMockFetch([
      { ok: true, body: { data: { id: "run-2", defaultDatasetId: "ds-2", status: "RUNNING" } } },
    ]));
    const tool = createCompetitorIntelligenceTool(TEST_CONFIG)!;
    const result = await tool.execute("t1", {
      action: "start",
      requests: [{ source: "google_search", queries: ["competitor brand site:techcrunch.com"] }],
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.runs[0].source).toBe("google_search");
  });

  it("collect returns completed results", async () => {
    const items = [{ title: "Starbucks", totalScore: 4.2, address: "123 Main St" }];
    vi.stubGlobal("fetch", makeMockFetch(standardRunResponses(items)));
    const tool = createCompetitorIntelligenceTool(TEST_CONFIG)!;
    await tool.execute("t1", { action: "start", requests: [{ source: "google_maps", queries: ["test"] }] });
    const result = await tool.execute("t2", {
      action: "collect",
      runs: [{ runId: "run-123", source: "google_maps", datasetId: "ds-456" }],
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.allDone).toBe(true);
    expect(data.completed[0].resultCount).toBe(1);
  });

  it("collect marks pending when still running", async () => {
    vi.stubGlobal("fetch", makeMockFetch([
      { ok: true, body: { data: { status: "RUNNING", defaultDatasetId: "ds-1" } } },
    ]));
    const tool = createCompetitorIntelligenceTool(TEST_CONFIG)!;
    const result = await tool.execute("t1", {
      action: "collect",
      runs: [{ runId: "run-1", source: "google_search", datasetId: "ds-1" }],
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.allDone).toBe(false);
    expect(data.pending).toHaveLength(1);
  });
});
