// ---------------------------------------------------------------------------
// Shared Apify HTTP client and plugin config helpers
// Used by all tool modules.
// ---------------------------------------------------------------------------

import { readResponseText, withTimeout, normalizeSecretInput } from "./util.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_APIFY_BASE_URL = "https://api.apify.com";
export const ALLOWED_APIFY_BASE_URL_PREFIX = "https://api.apify.com";
export const HTTP_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_RESULTS = 20;
export const MAX_RESULT_CHARS = 50_000;
export const TERMINAL_STATUSES = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApifyRunInfo {
  id: string;
  defaultDatasetId: string;
  status: string;
}

/** Minimal shared plugin config shape. All tools read these fields. */
export interface ApifyPluginConfig {
  enabled?: boolean;
  apiKey?: string;
  baseUrl?: string;
  cacheTtlMinutes?: number;
  maxResults?: number;
  enabledTools?: string[];
}

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

export function parsePluginConfig(raw?: Record<string, unknown>): ApifyPluginConfig {
  if (!raw) return {};
  return raw as ApifyPluginConfig;
}

export function resolveApiKey(config: ApifyPluginConfig): string | undefined {
  const fromConfig = typeof config.apiKey === "string" ? normalizeSecretInput(config.apiKey) : "";
  const fromEnv = normalizeSecretInput(process.env.APIFY_API_KEY);
  return fromConfig || fromEnv || undefined;
}

export function resolveBaseUrl(config: ApifyPluginConfig): string {
  const raw = typeof config.baseUrl === "string" ? config.baseUrl.trim() : "";
  const url = raw || DEFAULT_APIFY_BASE_URL;
  if (!url.startsWith(ALLOWED_APIFY_BASE_URL_PREFIX)) {
    throw new Error(
      `Invalid Apify base URL: "${url}". Must start with "${ALLOWED_APIFY_BASE_URL_PREFIX}".`,
    );
  }
  return url;
}

export function resolveEnabled(params: {
  config: ApifyPluginConfig;
  apiKey?: string;
}): boolean {
  if (typeof params.config.enabled === "boolean") {
    return params.config.enabled;
  }
  return Boolean(params.apiKey);
}

export function resolveMaxResults(
  config: ApifyPluginConfig,
  max = 100,
): number {
  const raw = config.maxResults;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.min(max, Math.floor(raw));
  }
  return DEFAULT_MAX_RESULTS;
}

export function isToolEnabled(config: ApifyPluginConfig, toolName: string): boolean {
  const list = config.enabledTools;
  if (!Array.isArray(list) || list.length === 0) return true;
  return list.includes(toolName);
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

export async function apifyFetch<T>(params: {
  method?: string;
  path: string;
  apiKey: string;
  baseUrl: string;
  body?: Record<string, unknown>;
  errorPrefix: string;
}): Promise<T> {
  const res = await fetch(`${params.baseUrl}${params.path}`, {
    method: params.method ?? "GET",
    headers: {
      ...(params.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${params.apiKey}`,
      "x-apify-integration-platform": "openclaw",
      "x-apify-integration-ai-tool": "true",
    },
    ...(params.body ? { body: JSON.stringify(params.body) } : {}),
    signal: withTimeout(undefined, HTTP_TIMEOUT_MS),
  });
  if (!res.ok) {
    const detail = await readResponseText(res, { maxBytes: 64_000 });
    throw new Error(`${params.errorPrefix} (${res.status}): ${detail.text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function startApifyActorRun(params: {
  actorId: string;
  input: Record<string, unknown>;
  apiKey: string;
  baseUrl: string;
}): Promise<ApifyRunInfo> {
  const result = await apifyFetch<{ data: ApifyRunInfo }>({
    method: "POST",
    path: `/v2/acts/${encodeURIComponent(params.actorId)}/runs`,
    apiKey: params.apiKey,
    baseUrl: params.baseUrl,
    body: params.input,
    errorPrefix: "Failed to start Apify actor",
  });
  return result.data;
}

export async function getApifyRunStatus(params: {
  runId: string;
  apiKey: string;
  baseUrl: string;
}): Promise<{ status: string; defaultDatasetId: string }> {
  const result = await apifyFetch<{ data: { status: string; defaultDatasetId: string } }>({
    path: `/v2/actor-runs/${params.runId}`,
    apiKey: params.apiKey,
    baseUrl: params.baseUrl,
    errorPrefix: "Failed to get run status",
  });
  return result.data;
}

export async function getApifyDatasetItems(params: {
  datasetId: string;
  apiKey: string;
  baseUrl: string;
}): Promise<unknown[]> {
  return apifyFetch<unknown[]>({
    path: `/v2/datasets/${params.datasetId}/items`,
    apiKey: params.apiKey,
    baseUrl: params.baseUrl,
    errorPrefix: "Failed to get dataset items",
  });
}

// ---------------------------------------------------------------------------
// Shared result helpers
// ---------------------------------------------------------------------------

export function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value as string | number | boolean);
}

export function num(value: unknown): string {
  if (typeof value === "number") return value.toLocaleString();
  return str(value);
}

export function rawDataBlock(data: unknown): string {
  return `\n<details><summary>Raw data</summary>\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`\n</details>`;
}

export function formatStats(entries: [string, unknown][]): string | null {
  const parts = entries
    .filter(([, v]) => v !== undefined)
    .map(([label, v]) => `${label}: ${num(v)}`);
  return parts.length ? `**${parts.join(" | ")}**` : null;
}

export function pushField(lines: string[], label: string, value: unknown): void {
  const s = str(value);
  if (s) lines.push(`**${label}**: ${s}`);
}

export function truncateResults(text: string): string {
  if (text.length > MAX_RESULT_CHARS) {
    return text.slice(0, MAX_RESULT_CHARS) + "\n\n[…truncated]";
  }
  return text;
}
