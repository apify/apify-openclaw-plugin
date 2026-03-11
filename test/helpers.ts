// Shared test helpers for all tool tests.

import type { ApifyClient } from "apify-client";

/** Build a mock ApifyClient with controllable responses. */
export function makeMockClient(overrides?: {
  actorStart?: (input?: unknown) => Promise<unknown>;
  actorGet?: () => Promise<unknown>;
  lastBuildGet?: () => Promise<unknown>;
  runGet?: () => Promise<unknown>;
  datasetListItems?: () => Promise<unknown>;
  storeList?: (opts?: unknown) => Promise<unknown>;
  userGet?: () => Promise<unknown>;
}): ApifyClient {
  const actorStart = overrides?.actorStart ?? (async () => ({ id: "run-123", defaultDatasetId: "ds-456", status: "RUNNING" }));
  const actorGet = overrides?.actorGet ?? (async () => ({ name: "test-actor", title: "Test Actor", username: "testuser", description: "A test actor" }));
  const defaultBuildGet = overrides?.lastBuildGet ?? (async () => ({ inputSchema: "{}", readme: "# Test", actorDefinition: null }));
  const runGet = overrides?.runGet ?? (async () => ({ id: "run-123", status: "SUCCEEDED", defaultDatasetId: "ds-456" }));
  const datasetListItems = overrides?.datasetListItems ?? (async () => ({ items: [], total: 0, count: 0, offset: 0, limit: 100, desc: false }));
  const storeList = overrides?.storeList ?? (async () => ({ items: [], total: 0, count: 0, offset: 0, limit: 10, desc: false }));
  const userGet = overrides?.userGet ?? (async () => ({ username: "testuser", profile: {} }));

  return {
    actor: () => ({
      start: actorStart,
      get: actorGet,
      defaultBuild: async () => ({
        get: defaultBuildGet,
      }),
    }),
    run: () => ({
      get: runGet,
    }),
    dataset: () => ({
      listItems: datasetListItems,
    }),
    store: () => ({
      list: storeList,
    }),
    user: () => ({
      get: userGet,
    }),
  } as unknown as ApifyClient;
}

/** Tool plugin config with a test API key. */
export const TEST_CONFIG = {
  pluginConfig: { apiKey: "test-key" },
};
