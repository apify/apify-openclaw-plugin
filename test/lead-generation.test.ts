import { describe, it, expect, vi, beforeEach } from "vitest";
import { createLeadGenerationTool } from "../src/tools/lead-generation-tool.js";
import { makeMockFetch, standardRunResponses, TEST_CONFIG } from "./helpers.js";

describe("lead_generation tool", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", makeMockFetch([]));
  });

  it("returns null when no API key", () => {
    expect(createLeadGenerationTool({ pluginConfig: {} })).toBeNull();
  });

  it("registers with correct name", () => {
    const tool = createLeadGenerationTool(TEST_CONFIG);
    expect(tool!.name).toBe("lead_generation");
    expect(tool!.label).toBe("Lead Generation");
  });

  it("start with google_maps source", async () => {
    vi.stubGlobal("fetch", makeMockFetch([
      { ok: true, body: { data: { id: "run-1", defaultDatasetId: "ds-1", status: "RUNNING" } } },
    ]));
    const tool = createLeadGenerationTool(TEST_CONFIG)!;
    const result = await tool.execute("t1", {
      action: "start",
      requests: [{ source: "google_maps", queries: ["dentists in Chicago"], maxResults: 50 }],
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.action).toBe("start");
    expect(data.runs[0].source).toBe("google_maps");
  });

  it("start with google_maps_email source", async () => {
    vi.stubGlobal("fetch", makeMockFetch([
      { ok: true, body: { data: { id: "run-2", defaultDatasetId: "ds-2", status: "RUNNING" } } },
    ]));
    const tool = createLeadGenerationTool(TEST_CONFIG)!;
    const result = await tool.execute("t1", {
      action: "start",
      requests: [{ source: "google_maps_email", queries: ["law firms Austin TX"] }],
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.runs[0].source).toBe("google_maps_email");
  });

  it("collect returns completed with lead data", async () => {
    const items = [{ title: "Dr. Smith Dentistry", phone: "555-1234", website: "smithdental.com" }];
    vi.stubGlobal("fetch", makeMockFetch(standardRunResponses(items)));
    const tool = createLeadGenerationTool(TEST_CONFIG)!;
    await tool.execute("t1", { action: "start", requests: [{ source: "google_maps", queries: ["dentists"] }] });
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
    const tool = createLeadGenerationTool(TEST_CONFIG)!;
    const result = await tool.execute("t1", {
      action: "collect",
      runs: [{ runId: "run-1", source: "google_search", datasetId: "ds-1" }],
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.allDone).toBe(false);
    expect(data.pending).toHaveLength(1);
  });
});
