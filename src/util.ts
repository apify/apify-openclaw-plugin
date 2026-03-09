// ---------------------------------------------------------------------------
// Inlined utilities – these are NOT exported from openclaw/plugin-sdk, so we
// carry local copies to keep the plugin self-contained.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// ToolInputError (from src/agents/tools/common.ts)
// ---------------------------------------------------------------------------

export class ToolInputError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}

// ---------------------------------------------------------------------------
// normalizeSecretInput (from src/utils/normalize-secret-input.ts)
// ---------------------------------------------------------------------------

export function normalizeSecretInput(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/[\r\n\u2028\u2029]+/g, "").trim();
}

// ---------------------------------------------------------------------------
// Cache utilities (from src/agents/tools/web-shared.ts)
// ---------------------------------------------------------------------------

export type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  insertedAt: number;
};

export const DEFAULT_CACHE_TTL_MINUTES = 15;
const DEFAULT_CACHE_MAX_ENTRIES = 100;

export function resolveCacheTtlMs(value: unknown, fallbackMinutes: number): number {
  const minutes =
    typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : fallbackMinutes;
  return Math.round(minutes * 60_000);
}

export function normalizeCacheKey(value: string): string {
  return value.trim().toLowerCase();
}

export function readCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
): { value: T; cached: boolean } | null {
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return { value: entry.value, cached: true };
}

export function writeCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
  ttlMs: number,
) {
  if (ttlMs <= 0) {
    return;
  }
  if (cache.size >= DEFAULT_CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (!oldest.done) {
      cache.delete(oldest.value);
    }
  }
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
    insertedAt: Date.now(),
  });
}

// ---------------------------------------------------------------------------
// External content wrapping (simplified from src/security/external-content.ts)
// ---------------------------------------------------------------------------

const EXTERNAL_CONTENT_START = "<<<EXTERNAL_UNTRUSTED_CONTENT>>>";
const EXTERNAL_CONTENT_END = "<<<END_EXTERNAL_UNTRUSTED_CONTENT>>>";

function sanitizeMarkers(content: string): string {
  return content
    .replace(/<<<EXTERNAL_UNTRUSTED_CONTENT>>>/gi, "[[MARKER_SANITIZED]]")
    .replace(/<<<END_EXTERNAL_UNTRUSTED_CONTENT>>>/gi, "[[END_MARKER_SANITIZED]]");
}

export function wrapExternalContent(
  content: string,
  options: { source: string; includeWarning?: boolean },
): string {
  const sanitized = sanitizeMarkers(content);
  const metadata = `Source: ${options.source}`;

  return [EXTERNAL_CONTENT_START, metadata, "---", sanitized, EXTERNAL_CONTENT_END].join("\n");
}
