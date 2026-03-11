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
