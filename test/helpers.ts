// Shared test helpers for all tool tests.

export type MockResponse = {
  ok: boolean;
  status?: number;
  body: unknown;
};

/** Build a mock fetch that returns responses in sequence. */
export function makeMockFetch(responses: MockResponse[]) {
  let index = 0;
  const fn = async (_url: unknown, _opts?: unknown) => {
    const resp = responses[index++] ?? { ok: true, body: [] };
    return {
      ok: resp.ok,
      status: resp.status ?? (resp.ok ? 200 : 500),
      statusText: resp.ok ? "OK" : "Internal Server Error",
      json: async () => resp.body,
      text: async () => JSON.stringify(resp.body),
      body: {
        getReader: () => {
          let done = false;
          return {
            read: async () => {
              if (done) return { value: undefined, done: true };
              done = true;
              const text = JSON.stringify(resp.body);
              return { value: new TextEncoder().encode(text), done: false };
            },
            cancel: async () => {},
          };
        },
      },
    };
  };
  // Node 22 fetch.preconnect compatibility
  (fn as unknown as Record<string, unknown>).preconnect = () => {};
  return fn;
}

/** Standard mock responses for a successful two-phase run. */
export function standardRunResponses(items: unknown[] = [{ title: "Test", totalScore: 4.5 }]) {
  return [
    // start: POST /acts/:id/runs
    { ok: true, body: { data: { id: "run-123", defaultDatasetId: "ds-456", status: "RUNNING" } } },
    // collect: GET /actor-runs/run-123
    { ok: true, body: { data: { status: "SUCCEEDED", defaultDatasetId: "ds-456" } } },
    // collect: GET /datasets/ds-456/items
    { ok: true, body: items },
  ] satisfies MockResponse[];
}

/** Tool plugin config with a test API key. */
export const TEST_CONFIG = {
  pluginConfig: { apiKey: "test-key", cacheTtlMinutes: 0 },
};
