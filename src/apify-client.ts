// ---------------------------------------------------------------------------
// Shared Apify client wrapper and plugin config helpers
// Uses the official apify-client package for type safety, retries, and
// proper error handling.
// ---------------------------------------------------------------------------

import { ApifyClient } from "apify-client";
import { normalizeSecretInput } from "./util.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_APIFY_BASE_URL = "https://api.apify.com";
export const ALLOWED_APIFY_BASE_URL_PREFIX = "https://api.apify.com";
export const DEFAULT_MAX_RESULTS = 20;
export const MAX_RESULT_CHARS = 50_000;
export const TERMINAL_STATUSES = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
// Client factory
// ---------------------------------------------------------------------------

export function createApifyClient(apiKey: string, baseUrl: string): ApifyClient {
  return new ApifyClient({
    token: apiKey,
    baseUrl,
    requestInterceptors: [
      (config) => {
        config.headers = {
          ...config.headers,
          "x-apify-integration-platform": "openclaw",
          "x-apify-integration-ai-tool": "true",
        };
        return config;
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Shared result helpers
// ---------------------------------------------------------------------------

export function truncateResults(text: string): string {
  if (text.length > MAX_RESULT_CHARS) {
    return text.slice(0, MAX_RESULT_CHARS) + "\n\n[…truncated]";
  }
  return text;
}
