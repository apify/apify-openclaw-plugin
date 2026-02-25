import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { normalizeSecretInput } from "./util.js";
import { apifyFetch, DEFAULT_APIFY_BASE_URL } from "./apify-client.js";

export function registerCli(api: OpenClawPluginApi): void {
  api.registerCli(
    ({ program }) => {
      const apify = program
        .command("apify")
        .description("Apify plugin — web scraping and data extraction");

      apify
        .command("setup")
        .description("Show setup instructions for the Apify plugin")
        .action(() => runSetupCommand(api));

      apify
        .command("status")
        .description("Show current Apify plugin configuration status")
        .action(() => runStatusCommand(api));

      apify
        .command("test")
        .description("Test the Apify API connection")
        .action(() => runTestCommand(api));
    },
    { commands: ["apify"] },
  );
}

function getApiKey(api: OpenClawPluginApi): string | undefined {
  const config = (api.pluginConfig ?? {}) as Record<string, unknown>;
  const fromConfig = typeof config.apiKey === "string" ? normalizeSecretInput(config.apiKey) : "";
  const fromEnv = normalizeSecretInput(process.env.APIFY_API_KEY);
  return fromConfig || fromEnv || undefined;
}

function getBaseUrl(api: OpenClawPluginApi): string {
  const config = (api.pluginConfig ?? {}) as Record<string, unknown>;
  const raw = typeof config.baseUrl === "string" ? config.baseUrl.trim() : "";
  return raw || DEFAULT_APIFY_BASE_URL;
}

function runSetupCommand(api: OpenClawPluginApi): void {
  const apiKey = getApiKey(api);
  console.log("\n=== Apify Plugin Setup ===\n");

  if (apiKey) {
    console.log("✓ API key is already configured.");
    console.log("  Run 'openclaw apify status' to see full configuration.");
    console.log("  Run 'openclaw apify test' to verify the connection.\n");
    return;
  }

  console.log("API key not found. Configure it using one of these methods:\n");
  console.log("Option 1 — Environment variable (recommended):");
  console.log("  export APIFY_API_KEY=apify_api_...\n");
  console.log("Option 2 — Plugin config in your OpenClaw config file:");
  console.log(`  plugins:
    entries:
      apify-openclaw-integration:
        enabled: true
        config:
          apiKey: "apify_api_..."
          cacheTtlMinutes: 15
          maxResults: 20\n`);
  console.log("Get your API key at: https://console.apify.com/settings/integrations\n");
  console.log("After configuring, allow the tools you want in your config:");
  console.log(`  tools:
    alsoAllow:
      - market_research
      - competitor_intelligence
      - trend_analysis
      - lead_generation
      - ecommerce
      - content_analytics
      - audience_analysis
      - influencer_discovery
      - brand_reputation
      - apify_scraper\n`);
  console.log("Then restart the gateway: openclaw restart\n");
}

function runStatusCommand(api: OpenClawPluginApi): void {
  const config = (api.pluginConfig ?? {}) as Record<string, unknown>;
  const apiKey = getApiKey(api);
  const baseUrl = getBaseUrl(api);

  console.log("\n=== Apify Plugin Status ===\n");
  console.log(`API key:    ${apiKey ? `configured (${apiKey.slice(0, 12)}…)` : "NOT SET — run 'openclaw apify setup'"}`);
  console.log(`Base URL:   ${baseUrl}`);
  console.log(`Cache TTL:  ${config.cacheTtlMinutes ?? 15} minutes`);
  console.log(`Max results: ${config.maxResults ?? 20} per run`);

  const enabledTools = Array.isArray(config.enabledTools) && config.enabledTools.length > 0
    ? (config.enabledTools as string[]).join(", ")
    : "all (no restriction)";
  console.log(`Enabled tools: ${enabledTools}`);
  console.log(`Plugin enabled: ${config.enabled === false ? "no" : "yes (when API key is set)"}`);
  console.log();
}

async function runTestCommand(api: OpenClawPluginApi): Promise<void> {
  const apiKey = getApiKey(api);
  const baseUrl = getBaseUrl(api);

  console.log("\n=== Testing Apify API Connection ===\n");

  if (!apiKey) {
    console.log("✗ Cannot test: API key not configured.");
    console.log("  Run 'openclaw apify setup' for instructions.\n");
    return;
  }

  console.log("Connecting to Apify API…");

  try {
    const result = await apifyFetch<{ data: { username?: string; plan?: { name?: string } } }>({
      path: "/v2/users/me",
      apiKey,
      baseUrl,
      errorPrefix: "API test failed",
    });
    const user = result.data;
    console.log(`✓ Connected successfully!`);
    console.log(`  Account:  ${user.username ?? "unknown"}`);
    console.log(`  Plan:     ${user.plan?.name ?? "unknown"}`);
    console.log();
  } catch (err) {
    console.log(`✗ Connection failed: ${err instanceof Error ? err.message : String(err)}`);
    console.log("  Check that your API key is correct and has the required permissions.\n");
  }
}
