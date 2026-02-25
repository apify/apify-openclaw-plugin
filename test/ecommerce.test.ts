import { describe, it, expect, vi, beforeEach } from "vitest";
import { createEcommerceTool } from "../src/tools/ecommerce-tool.js";
import { makeMockFetch, standardRunResponses, TEST_CONFIG } from "./helpers.js";

describe("ecommerce tool", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", makeMockFetch([]));
  });

  it("returns null when no API key", () => {
    expect(createEcommerceTool({ pluginConfig: {} })).toBeNull();
  });

  it("registers with correct name", () => {
    const tool = createEcommerceTool(TEST_CONFIG);
    expect(tool!.name).toBe("ecommerce");
    expect(tool!.label).toBe("Ecommerce");
  });

  it("start with products source", async () => {
    vi.stubGlobal("fetch", makeMockFetch([
      { ok: true, body: { data: { id: "run-1", defaultDatasetId: "ds-1", status: "RUNNING" } } },
    ]));
    const tool = createEcommerceTool(TEST_CONFIG)!;
    const result = await tool.execute("t1", {
      action: "start",
      requests: [{
        source: "products",
        urls: ["https://www.amazon.com/dp/B0XXXX"],
        maxResults: 5,
      }],
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.action).toBe("start");
    expect(data.runs[0].source).toBe("products");
  });

  it("start with reviews source", async () => {
    vi.stubGlobal("fetch", makeMockFetch([
      { ok: true, body: { data: { id: "run-2", defaultDatasetId: "ds-2", status: "RUNNING" } } },
    ]));
    const tool = createEcommerceTool(TEST_CONFIG)!;
    const result = await tool.execute("t1", {
      action: "start",
      requests: [{ source: "reviews", urls: ["https://www.amazon.com/dp/B0XXXX/reviews"] }],
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.runs[0].source).toBe("reviews");
  });

  it("collect returns product results", async () => {
    const items = [{ title: "Wireless Headphones", price: "$49.99", rating: 4.3 }];
    vi.stubGlobal("fetch", makeMockFetch(standardRunResponses(items)));
    const tool = createEcommerceTool(TEST_CONFIG)!;
    await tool.execute("t1", { action: "start", requests: [{ source: "products", urls: ["https://amazon.com/dp/XXX"] }] });
    const result = await tool.execute("t2", {
      action: "collect",
      runs: [{ runId: "run-123", source: "products", datasetId: "ds-456" }],
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.allDone).toBe(true);
    expect(data.completed[0].resultCount).toBe(1);
  });

  it("collect pending when RUNNING", async () => {
    vi.stubGlobal("fetch", makeMockFetch([
      { ok: true, body: { data: { status: "RUNNING", defaultDatasetId: "ds-1" } } },
    ]));
    const tool = createEcommerceTool(TEST_CONFIG)!;
    const result = await tool.execute("t1", {
      action: "collect",
      runs: [{ runId: "run-1", source: "sellers", datasetId: "ds-1" }],
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.allDone).toBe(false);
  });
});
