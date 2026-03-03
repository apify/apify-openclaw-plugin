# Apify OpenClaw Integration — Repository Guidelines

## Overview

This is a standalone OpenClaw plugin (`@apify/apify-openclaw-integration`) that provides web scraping and data extraction via Apify's API. It registers **10 agent tools** covering social media, market research, lead generation, e-commerce, and more.

- **Upstream repo:** https://github.com/openclaw/openclaw
- **Plugin docs:** https://docs.openclaw.ai/plugins/community
- **Agent tools guide:** https://docs.openclaw.ai/plugins/agent-tools
- **Plugin system docs:** https://docs.openclaw.ai/plugins
- **Apify console:** https://console.apify.com/

## Project Structure

```
src/
  index.ts                    # Plugin entry point — registers all 10 tools + CLI
  apify-client.ts             # Shared HTTP client, startApifyActorRun, config helpers
  tool-helpers.ts             # runTwoPhaseStart + runTwoPhaseCollect (used by domain tools)
  cli.ts                      # openclaw apify setup|status|test commands
  util.ts                     # Inlined utilities (not exported by openclaw/plugin-sdk)
  tools/
    market-research-tool.ts
    competitor-intelligence-tool.ts
    trend-analysis-tool.ts
    lead-generation-tool.ts
    ecommerce-tool.ts
    content-analytics-tool.ts
    audience-analysis-tool.ts
    influencer-discovery-tool.ts
    brand-reputation-tool.ts
    apify-scraper-tool.ts     # Universal scraper — discover + start + collect
test/
  helpers.ts                  # makeMockFetch, standardRunResponses, TEST_CONFIG
  *.test.ts                   # 10 test files (one per tool)
skills/
  <name>/SKILL.md             # 10 agent training docs for OpenClaw's skill system
openclaw.plugin.json          # Plugin manifest (configSchema + uiHints) — REQUIRED
package.json                  # npm package config
```

## Registered Tools

| Tool | Sources |
|------|---------|
| `market_research` | Google Maps, Booking, TripAdvisor |
| `competitor_intelligence` | Google Maps, Google Maps Reviews, Google Search |
| `trend_analysis` | Google Trends, Instagram hashtags, TikTok hashtags/trends |
| `lead_generation` | Google Maps, Google Maps Email, Google Search |
| `ecommerce` | Products, reviews, sellers via `apify~e-commerce-scraping-tool` |
| `content_analytics` | Instagram posts/reels, Facebook posts, YouTube, TikTok |
| `audience_analysis` | Instagram profile, Facebook followers, YouTube channel, TikTok profile |
| `influencer_discovery` | Instagram, YouTube, TikTok |
| `brand_reputation` | Google Maps, Booking, TripAdvisor, Facebook reviews, YouTube/TikTok comments |
| `apify_scraper` | Universal — discover (store search + schema) + start + collect |

## Key Architecture Decisions

- **Two-phase async pattern:** `start` fires Apify actor runs concurrently and returns run IDs immediately. `collect` fetches results for completed runs. This lets the agent do other work while scraping runs.
- **Shared client (`apify-client.ts`):** All tools use `startApifyActorRun`, `getApifyRunStatus`, `getApifyDatasetItems`. Domain tools go through `runTwoPhaseStart`/`runTwoPhaseCollect` from `tool-helpers.ts`. `apify_scraper` orchestrates its own collect loop.
- **Inlined utilities (`util.ts`):** `ToolInputError`, cache helpers, HTTP helpers, and `wrapExternalContent` are NOT exported from `openclaw/plugin-sdk`. We carry local copies to keep the plugin self-contained.
- **No build step:** OpenClaw loads plugins via `jiti` (TypeScript JIT). We ship `.ts` source directly. No compilation needed.
- **Plugin id:** `apify-openclaw-integration` — must match the unscoped npm package name.
- **`isToolEnabled(config, toolName)`:** Checks the `enabledTools[]` array in plugin config. Empty array = all tools enabled.

## Apify Actor IDs

**Format: `username~actor-name`** (tilde separator, not slash).

The Apify API accepts both `username/actor-name` and `username~actor-name`, but the `~` format avoids URL path ambiguity. All hardcoded actor IDs in `ACTOR_IDS` maps use `~`. The `discover` action in `apify_scraper` builds slugs as `${username}~${name}` and its tip tells the agent to use `~` format.

`startApifyActorRun` in `apify-client.ts` uses `encodeURIComponent(actorId)` in the URL path as a safety guard — `~` is unreserved so it won't be percent-encoded, but the guard handles any edge-case IDs.

**Why this matters:** Using `username/actor-name` unencoded in a URL path causes 404s because the server interprets the `/` as a path separator (e.g. `/v2/acts/apify/google-search-scraper/runs` → no matching route). Always encode or use `~`.

## Skills (SKILL.md files)

The `skills/<name>/SKILL.md` files are agent training documents loaded by OpenClaw's skill system (`"skills": ["./skills"]` in `openclaw.plugin.json`). They are **custom-written for this plugin** — not from any Apify official repository. They teach the agent when and how to use each tool, with worked examples.

These are separate from the Claude Code skills (the `apify-content-analytics`, `apify-lead-generation` etc. in the Claude skills menu) — those are Apify's official Claude Code integration skills.

## Setup Wizard — Direct Config Write

`openclaw apify setup` (in `src/cli.ts`) now writes the config directly to the OpenClaw config file instead of printing manual instructions.

It uses:
- `api.runtime.config.loadConfig()` → returns current `OpenClawConfig`
- `api.runtime.config.writeConfigFile(cfg)` → writes it back to disk

The wizard merges safely: preserves existing `cacheTtlMinutes`/`maxResults`, adds to `tools.alsoAllow` without duplicates, uses `group:plugins` when all tools are selected. If the config API is unavailable (older OpenClaw), it falls back to printing the manual config block.

## Build, Test, and Development

- **Runtime:** Node 22+ (required by openclaw peer dependency).
- **Install:** `npm install`
- **Type-check:** `npx tsc --noEmit`
- **Test:** `npx vitest run`
- **Pack (dry run):** `npm pack --dry-run`

## Coding Style

- TypeScript (ESM). Prefer strict typing; avoid `any`.
- Tool names: `snake_case` (e.g., `market_research`).
- Plugin id / config keys: `kebab-case` (e.g., `apify-openclaw-integration`).
- Keep files concise. Add comments for non-obvious logic.
- Tool schema guardrails: avoid `Type.Union` in tool input schemas. Use `stringEnum` for string enums, `Type.Optional(...)` instead of nullable types. Keep top-level schema as `type: "object"` with `properties`. Avoid raw `format` property names (some validators treat it as reserved).
- TypeScript gotcha: nested optional chaining on `Record<string, unknown>` needs explicit cast — `(item.foo as Record<string, unknown>)?.bar`.

---

## How the OpenClaw Plugin System Works

This section documents how OpenClaw discovers, loads, and runs plugins. Reference this when modifying the plugin or debugging integration issues.

### Plugin Lifecycle

```
Discovery → Manifest Loading → Config Validation → Module Loading → Registration → Tool Resolution
```

#### 1. Discovery

OpenClaw scans for plugins in strict precedence order:

1. **Config paths** (`plugins.load.paths`) — highest priority
2. **Workspace extensions** (`<workspace>/.openclaw/extensions/`)
3. **Global extensions** (`~/.config/openclaw/extensions/` or `~/.openclaw/extensions/`)
4. **Bundled extensions** (shipped with OpenClaw) — lowest priority

For npm-installed plugins: `openclaw plugins install <npm-spec>` runs `npm pack`, extracts the tarball into `~/.openclaw/extensions/<id>/`, and runs `npm install --ignore-scripts` for dependencies (no lifecycle scripts — keep deps pure JS/TS).

The plugin id is derived from the **unscoped** npm package name. For `@apify/apify-openclaw-integration`, the id = `apify-openclaw-integration`.

#### 2. Manifest Loading

Every plugin **must** ship `openclaw.plugin.json` in its root. This file is loaded **without executing plugin code** and provides:

- `id` (string, required) — canonical plugin identifier
- `configSchema` (JSON Schema, required) — validated at config read/write time, before code runs
- `uiHints` (optional) — field labels, placeholders, sensitive flags for the Control UI
- `kind` (optional) — for exclusive slot selection (e.g., `"memory"`)

If the manifest is missing, the plugin errors and never loads.

#### 3. Config Validation

Plugin config from `plugins.entries.<id>.config` is validated against the manifest's `configSchema` using JSON Schema. Invalid config blocks the plugin from loading entirely. Unknown plugin ids in `entries` are errors.

#### 4. Module Loading via Jiti

OpenClaw uses [Jiti](https://github.com/unjs/jiti) (just-in-time TypeScript loader) to import the plugin entry file. Jiti is configured with:

- Support for `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.mjs`, `.cjs`, `.json`
- An alias from `"openclaw/plugin-sdk"` → the local OpenClaw SDK source/dist
- `interopDefault: true` for CJS/ESM compatibility

The module must export either:
- A function: `(api: OpenClawPluginApi) => void`
- An object: `{ id, name, description, register(api: OpenClawPluginApi) }` ← what we use

**Critical gotcha:** If `register()` returns a Promise, the async work is **silently ignored** (a warning is emitted but never awaited). All registration must be synchronous.

#### 5. Registration

The `register(api)` function receives an `OpenClawPluginApi` object:

- `api.config` — full gateway config (read-only snapshot)
- `api.pluginConfig` — the validated per-plugin config from `plugins.entries.<id>.config`
- `api.logger` — scoped logger
- `api.runtime` — rich runtime (channels, media, TTS, system, config, logging, state)
- `api.runtime.config.loadConfig()` — load fresh `OpenClawConfig` from disk
- `api.runtime.config.writeConfigFile(cfg)` — write config back to disk (used by setup wizard)
- `api.registerTool(tool, opts?)` — register an agent tool
- `api.registerHook(...)`, `api.registerGatewayMethod(...)`, `api.registerCli(...)`, etc.

Our plugin calls `api.registerTool(tool)` for each of the 10 tools and `api.registerCli(...)` for the `apify` CLI subcommand.

#### 6. Tool Resolution at Runtime

When an agent run begins, `resolvePluginTools()` is called. For each registered tool:

1. Tool factory (if used) is called with runtime context
2. **Optional tools** (`{ optional: true }`) are only included if the tool name, plugin ID, or `"group:plugins"` is in the allowlist
3. **Required tools** (default, what we use) are always included when the plugin is loaded
4. Tool names that collide with core tool names are silently dropped

### The `AnyAgentTool` Interface

A tool is an object with:

```ts
{
  name: string;              // e.g. "market_research"
  label?: string;            // display name
  description: string;       // shown to the LLM
  parameters: object;        // JSON Schema or TypeBox schema
  execute(id: string, params: Record<string, unknown>): Promise<AgentToolResult>;
}
```

`AgentToolResult` shape:

```ts
{
  content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }>;
  details?: unknown;  // structured data (accessible from hooks/tests)
}
```

The SDK provides `jsonResult(payload)` which wraps any value as:
```ts
{ content: [{ type: "text", text: JSON.stringify(payload) }], details: payload }
```

### Plugin SDK Exports (`openclaw/plugin-sdk`)

The SDK re-exports from core. Key exports used by this plugin:

**Tool helpers:**
- `jsonResult(payload)` — wrap structured data as tool result
- `readStringParam(params, key, opts)` — safe string extraction with required/trim options
- `readNumberParam(params, key, opts)` — safe number extraction
- `stringEnum(values, opts)` — TypeBox schema for string enum (avoids `Type.Union`)

**Types:**
- `OpenClawPluginApi` — the API object passed to `register()`
- `AnyAgentTool` — the tool interface

**Not exported** (we inline in `util.ts`):
- `ToolInputError` — custom error for bad tool input (status 400)
- `readStringArrayParam` — array param extraction
- `normalizeSecretInput` — strip newlines/whitespace from secrets
- Cache utilities (`readCache`, `writeCache`, `resolveCacheTtlMs`, `normalizeCacheKey`)
- HTTP utilities (`withTimeout`, `readResponseText`)
- `wrapExternalContent` — security wrapping for untrusted content

### Tool Allowlisting

Users control which tools are available to the agent:

```json5
{
  tools: {
    alsoAllow: [
      "market_research",            // by individual tool name
      "apify-openclaw-integration", // by plugin id (enables all tools from plugin)
      "group:plugins",              // enables ALL plugin tools
    ],
  },
}
```

Allowlists can also be set per-agent (`agents.list[].tools.allow/alsoAllow`) or per-provider (`tools.byProvider.<provider>.allow`).

### Gateway Config Structure (for this plugin)

```json5
{
  plugins: {
    enabled: true,
    entries: {
      "apify-openclaw-integration": {
        enabled: true,
        config: {
          apiKey: "apify_api_...",     // or use APIFY_API_KEY env var
          baseUrl: "https://api.apify.com",
          cacheTtlMinutes: 15,
          maxResults: 20,
          enabledTools: [],           // empty = all 10 tools enabled; list names to restrict
        },
      },
    },
  },
  tools: {
    alsoAllow: ["group:plugins"],   // or list individual tool names
  },
}
```

Config changes require a gateway restart (`openclaw gateway restart`).

---

## External Content Security Model

All data scraped from external sources is **untrusted external content** that could contain prompt injection attacks. OpenClaw's security model requires wrapping such content.

### How wrapping works

The core `wrapExternalContent(content, options)` function (inlined in `util.ts`):

1. **Sanitizes markers** — replaces any occurrence of `<<<EXTERNAL_UNTRUSTED_CONTENT>>>` or `<<<END_EXTERNAL_UNTRUSTED_CONTENT>>>` within the content with `[[MARKER_SANITIZED]]` (including Unicode homoglyph variants)
2. **Wraps with boundary markers** — the content is placed between start/end markers with source metadata

All scraped results are wrapped with the source tool name (e.g. `source: "market_research"`) and `externalContent: { untrusted: true, source: "<tool>", wrapped: true }` in the tool result metadata.

---

## Security

- **API keys:** Resolved from plugin config `apiKey` or `APIFY_API_KEY` env var. Never logged or included in tool output.
- **Base URL validation:** Only `https://api.apify.com` prefix allowed. Rejects other URLs to prevent SSRF.
- **External content wrapping:** All scraped results wrapped with untrusted content markers (see above).
- **HTTP timeout:** 30s per request via `AbortSignal`.
- **Install security:** `openclaw plugins install` runs `npm install --ignore-scripts` — no lifecycle scripts execute.

---

## Testing

- **Framework:** Vitest
- Tests mock `global.fetch` to simulate Apify API responses (start runs, check status, get dataset items).
- Shared test helpers in `test/helpers.ts`: `makeMockFetch`, `standardRunResponses`, `TEST_CONFIG`.
- Cache tests use `cacheTtlMinutes: 0` (disabled) by default, `cacheTtlMinutes: 60` for cache-hit tests.
- Each tool is tested by calling its `create*Tool()` factory directly, bypassing the plugin loader.
- **Current state:** 10/10 test files, 69/69 tests passing.

---

## Release

- **Publish:** `npm publish --access public` (requires `NPM_TOKEN` secret for CI).
- CI runs on push/PR to `main` (tsc + vitest).
- Release workflow triggers on GitHub release publish.
- Version bumps are manual — update `package.json` version before creating a release.

---

## Important Gotchas

1. **Async `register()` is ignored.** The `register(api)` function must be synchronous. If it returns a Promise, OpenClaw logs a warning and never awaits it. Our `register()` is sync (good).

2. **`openclaw.plugin.json` is mandatory.** Without it, the plugin will never load. The file is read for config validation before any plugin code executes.

3. **Tool name collisions are silent drops.** If a tool name collides with a core tool, it gets silently skipped.

4. **Config validation happens before code.** If the config doesn't match `configSchema`, the plugin won't load at all. Test schema changes carefully.

5. **`workspace:*` deps break outside the monorepo.** We use `"openclaw": "^2026.2.18"` in devDependencies (not `workspace:*`). The Jiti alias resolves `openclaw/plugin-sdk` at runtime from the host OpenClaw installation.

6. **Plugin tools are gated by allowlists.** Users must add tool names (or `group:plugins` or `apify-openclaw-integration`) to their `tools.alsoAllow` config for tools to appear in agent runs.

7. **No `Type.Union` in schemas.** OpenClaw's tool schema validation rejects `anyOf`/`oneOf`/`allOf`. Use `stringEnum()` for enum strings and `Type.Optional()` for optional fields.

8. **Actor ID URL encoding.** `startApifyActorRun` must use `encodeURIComponent(actorId)` in the URL path. Without it, `username/actor-name` gets parsed as a multi-segment path and returns 404. All actor IDs use `~` format (`username~actor-name`) which is unreserved and won't be percent-encoded, but the `encodeURIComponent` guard is kept for safety.
