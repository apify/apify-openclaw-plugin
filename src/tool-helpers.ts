// ---------------------------------------------------------------------------
// Shared two-phase start/collect orchestration used by all domain tools.
// ---------------------------------------------------------------------------

import { readStringParam } from "openclaw/plugin-sdk";
import {
  CacheEntry,
  ToolInputError,
  normalizeCacheKey,
  readCache,
  wrapExternalContent,
  writeCache,
} from "./util.js";
import {
  getApifyDatasetItems,
  getApifyRunStatus,
  startApifyActorRun,
  truncateResults,
  TERMINAL_STATUSES,
} from "./apify-client.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PreparedRun {
  /** Tool-specific discriminator (e.g. "google_maps", "tiktok") */
  source: string;
  actorId: string;
  input: Record<string, unknown>;
}

export interface CollectRunRef {
  runId: string;
  source: string;
  datasetId: string;
}

// ---------------------------------------------------------------------------
// Generic start orchestration
// ---------------------------------------------------------------------------

export async function runTwoPhaseStart(params: {
  prepared: PreparedRun[];
  apiKey: string;
  baseUrl: string;
}): Promise<Record<string, unknown>> {
  const results = await Promise.allSettled(
    params.prepared.map(async ({ source, actorId, input }) => {
      const run = await startApifyActorRun({
        actorId,
        input,
        apiKey: params.apiKey,
        baseUrl: params.baseUrl,
      });
      return { source, runId: run.id, datasetId: run.defaultDatasetId, status: run.status };
    }),
  );

  const runs: Record<string, unknown>[] = [];
  const errors: { index: number; source: string; error: string }[] = [];
  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      runs.push(result.value);
    } else {
      errors.push({
        index: i,
        source: params.prepared[i].source,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  });

  return {
    action: "start",
    message:
      `Started ${runs.length} run(s)${errors.length ? `, ${errors.length} failed` : ""}. Use action='collect' to fetch results.`,
    runs,
    ...(errors.length ? { errors } : {}),
  };
}

// ---------------------------------------------------------------------------
// Generic collect orchestration
// ---------------------------------------------------------------------------

export async function runTwoPhaseCollect<CacheEntry_>(params: {
  runs: Record<string, unknown>[];
  apiKey: string;
  baseUrl: string;
  cacheTtlMs: number;
  cacheNamespace: string;
  cache: Map<string, import("./util.js").CacheEntry<Record<string, unknown>>>;
  toolName: string;
  formatItems: (source: string, items: unknown[]) => string;
}): Promise<Record<string, unknown>> {
  if (!params.runs?.length) {
    throw new ToolInputError("'collect' action requires 'runs' array.");
  }

  const results = await Promise.allSettled(
    params.runs.map(async (runRef) => {
      const runId = readStringParam(runRef, "runId", { required: true });
      const source = readStringParam(runRef, "source", { required: true });
      const datasetId = readStringParam(runRef, "datasetId", { required: true });

      const cacheKey = normalizeCacheKey(`${params.cacheNamespace}:run:${runId}`);
      const cached = readCache(params.cache, cacheKey);
      if (cached) return { ...cached.value, cached: true };

      const runStatus = await getApifyRunStatus({
        runId,
        apiKey: params.apiKey,
        baseUrl: params.baseUrl,
      });

      if (!TERMINAL_STATUSES.has(runStatus.status)) {
        return { source, runId, status: runStatus.status, pending: true } as Record<string, unknown>;
      }
      if (runStatus.status !== "SUCCEEDED") {
        return { source, runId, status: runStatus.status, error: `Run ended with status: ${runStatus.status}` } as Record<string, unknown>;
      }

      const items = await getApifyDatasetItems({
        datasetId,
        apiKey: params.apiKey,
        baseUrl: params.baseUrl,
      });

      const text = truncateResults(params.formatItems(source, items));
      const wrapped = wrapExternalContent(text, { source: params.toolName, includeWarning: false });

      const payload: Record<string, unknown> = {
        source,
        runId,
        status: "SUCCEEDED",
        resultCount: items.length,
        text: wrapped,
        externalContent: { untrusted: true, source: params.toolName, wrapped: true },
        fetchedAt: new Date().toISOString(),
      };

      writeCache(params.cache, cacheKey, payload, params.cacheTtlMs);
      return payload;
    }),
  );

  const completed: Record<string, unknown>[] = [];
  const pending: Record<string, unknown>[] = [];
  const errors: Record<string, unknown>[] = [];

  for (const result of results) {
    if (result.status === "rejected") {
      errors.push({
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
      continue;
    }
    const value = result.value;
    if (value.pending) pending.push(value);
    else if (value.error) errors.push(value);
    else completed.push(value);
  }

  return {
    action: "collect",
    allDone: pending.length === 0,
    message:
      pending.length === 0
        ? `All ${completed.length} run(s) completed.`
        : `${completed.length} completed, ${pending.length} still running. Call collect again.`,
    completed,
    ...(pending.length ? { pending } : {}),
    ...(errors.length ? { errors } : {}),
  };
}
