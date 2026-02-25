import readline from "readline";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { normalizeSecretInput } from "./util.js";
import { apifyFetch, DEFAULT_APIFY_BASE_URL } from "./apify-client.js";

// ---------------------------------------------------------------------------
// readline helpers (following OuraClaw pattern)
// ---------------------------------------------------------------------------

function ask(rl: readline.Interface, question: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue ? ` (${defaultValue})` : "";
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || defaultValue || "");
    });
  });
}

function confirm(rl: readline.Interface, question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? "[Y/n]" : "[y/N]";
  return new Promise((resolve) => {
    rl.question(`${question} ${hint} `, (answer) => {
      const a = answer.trim().toLowerCase();
      if (a === "") resolve(defaultYes);
      else resolve(a === "y" || a === "yes");
    });
  });
}

// ---------------------------------------------------------------------------
// CLI registration
// ---------------------------------------------------------------------------

export function registerCli(api: OpenClawPluginApi): void {
  api.registerCli(
    ({ program }) => {
      const apify = program
        .command("apify")
        .description("Apify plugin — web scraping and data extraction");

      apify
        .command("setup")
        .description("Interactive setup wizard for the Apify plugin")
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

const ALL_TOOLS: { name: string; desc: string }[] = [
  { name: "market_research",        desc: "Google Maps, Booking, TripAdvisor" },
  { name: "competitor_intelligence", desc: "Competitor profiles, reviews, search rankings" },
  { name: "trend_analysis",         desc: "Google Trends, Instagram & TikTok hashtags" },
  { name: "lead_generation",        desc: "Business leads with contact info" },
  { name: "ecommerce",              desc: "Product, review, and seller data" },
  { name: "content_analytics",      desc: "Post engagement across Instagram, YouTube, TikTok" },
  { name: "audience_analysis",      desc: "Profile follower counts and channel stats" },
  { name: "influencer_discovery",   desc: "Find creators by niche or hashtag" },
  { name: "brand_reputation",       desc: "Reviews and comments monitoring" },
  { name: "apify_scraper",          desc: "Universal scraper — any Apify actor" },
];

// ---------------------------------------------------------------------------
// Config write helpers
// ---------------------------------------------------------------------------

async function applyConfigChanges(
  api: OpenClawPluginApi,
  apiKey: string,
  selectedTools: string[],
  allSelected: boolean,
): Promise<void> {
  if (!api.runtime?.config?.loadConfig || !api.runtime?.config?.writeConfigFile) {
    throw new Error("Config write API not available — update OpenClaw and retry.");
  }

  const cfg = api.runtime.config.loadConfig();

  // Merge plugin entry
  if (!cfg.plugins) cfg.plugins = {};
  if (!cfg.plugins.entries) cfg.plugins.entries = {};
  const existing = cfg.plugins.entries["apify-openclaw-integration"] ?? {};
  const existingPluginConfig =
    typeof existing.config === "object" && existing.config !== null
      ? (existing.config as Record<string, unknown>)
      : {};
  cfg.plugins.entries["apify-openclaw-integration"] = {
    ...existing,
    enabled: true,
    config: {
      ...existingPluginConfig,
      apiKey,
      cacheTtlMinutes: existingPluginConfig.cacheTtlMinutes ?? 15,
      maxResults: existingPluginConfig.maxResults ?? 20,
    },
  };

  // Merge tools.alsoAllow (add selected tools, avoid duplicates)
  if (!cfg.tools) cfg.tools = {};
  if (!cfg.tools.alsoAllow) cfg.tools.alsoAllow = [];
  const toolsToAdd = allSelected ? ["group:plugins"] : selectedTools;
  for (const t of toolsToAdd) {
    if (!cfg.tools.alsoAllow.includes(t)) {
      cfg.tools.alsoAllow.push(t);
    }
  }

  await api.runtime.config.writeConfigFile(cfg);
}

function printManualConfig(apiKey: string, selectedTools: string[], allSelected: boolean): void {
  const toolAllow = allSelected
    ? "      - group:plugins   # all Apify tools"
    : selectedTools.map((t) => `      - ${t}`).join("\n");

  console.log("\n══════════════════════════════════════════");
  console.log("  ✓ Setup complete!\n");
  console.log("  Add this to your OpenClaw config:\n");
  console.log("  plugins:");
  console.log("    entries:");
  console.log("      apify-openclaw-integration:");
  console.log("        enabled: true");
  console.log("        config:");
  console.log(`          apiKey: "${apiKey}"`);
  console.log("          cacheTtlMinutes: 15");
  console.log("          maxResults: 20");
  console.log();
  console.log("  tools:");
  console.log("    alsoAllow:");
  console.log(toolAllow);
  console.log();
  if (!allSelected) {
    console.log(`  Selected tools: ${selectedTools.join(", ")}`);
    console.log();
  }
  console.log("  Then restart: openclaw restart");
  console.log("══════════════════════════════════════════\n");
}

// ---------------------------------------------------------------------------
// setup command
// ---------------------------------------------------------------------------

async function runSetupCommand(api: OpenClawPluginApi): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log("\n╔══════════════════════════════════════╗");
    console.log("║      Apify Plugin Setup Wizard       ║");
    console.log("╚══════════════════════════════════════╝\n");

    // ── Step 1: API key ──────────────────────────────────────────────────────
    console.log("Step 1 of 3 — API Key\n");

    const existingKey = getApiKey(api);
    let apiKey: string;

    if (existingKey) {
      console.log(`  ✓ API key already configured: ${existingKey.slice(0, 12)}…\n`);
      const change = await confirm(rl, "  Replace it with a new key?", false);
      if (change) {
        apiKey = await ask(rl, "\n  Enter new API key (from console.apify.com/settings/integrations)");
        apiKey = normalizeSecretInput(apiKey);
      } else {
        apiKey = existingKey;
      }
    } else {
      console.log("  No API key found. Get yours at:");
      console.log("  https://console.apify.com/settings/integrations\n");
      apiKey = await ask(rl, "  Paste your Apify API key");
      apiKey = normalizeSecretInput(apiKey);
    }

    if (!apiKey) {
      console.log("\n  ✗ No API key provided. Setup cancelled.\n");
      return;
    }

    // ── Step 2: Verify ───────────────────────────────────────────────────────
    console.log("\nStep 2 of 3 — Verifying connection…\n");
    const baseUrl = getBaseUrl(api);
    let accountInfo = "";

    try {
      process.stdout.write("  Connecting to Apify API… ");
      const result = await apifyFetch<{ data: { username?: string; plan?: { name?: string } } }>({
        path: "/v2/users/me",
        apiKey,
        baseUrl,
        errorPrefix: "Verification failed",
      });
      const user = result.data;
      accountInfo = `@${user.username ?? "unknown"} (${user.plan?.name ?? "unknown"} plan)`;
      console.log(`done.\n  ✓ Connected as ${accountInfo}\n`);
    } catch (err) {
      console.log("failed.");
      console.log(`  ✗ ${err instanceof Error ? err.message : String(err)}\n`);
      const cont = await confirm(rl, "  Key seems invalid. Continue anyway?", false);
      if (!cont) {
        console.log("\n  Setup cancelled.\n");
        return;
      }
    }

    // ── Step 3: Tool selection ───────────────────────────────────────────────
    console.log("Step 3 of 3 — Select tools to enable\n");
    ALL_TOOLS.forEach((t, i) => {
      const num = String(i + 1).padStart(2);
      const name = t.name.padEnd(27);
      console.log(`  ${num}. ${name} ${t.desc}`);
    });
    console.log();

    const sel = await ask(rl, "  Enter numbers separated by commas, or 'all'", "all");
    let selectedTools: string[];

    if (sel.trim().toLowerCase() === "all" || sel.trim() === "") {
      selectedTools = ALL_TOOLS.map((t) => t.name);
    } else {
      const nums = sel
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => n >= 1 && n <= ALL_TOOLS.length);
      selectedTools = [...new Set(nums)].map((n) => ALL_TOOLS[n - 1].name);
    }

    if (selectedTools.length === 0) {
      console.log("  No valid selection — enabling all tools.\n");
      selectedTools = ALL_TOOLS.map((t) => t.name);
    }

    // ── Write config or print manual instructions ────────────────────────────
    const allSelected = selectedTools.length === ALL_TOOLS.length;

    console.log();
    const writeDirectly = await confirm(rl, "  Write config directly to your OpenClaw config file?", true);

    if (writeDirectly) {
      try {
        process.stdout.write("\n  Writing config… ");
        await applyConfigChanges(api, apiKey, selectedTools, allSelected);
        console.log("done.\n");
        console.log("══════════════════════════════════════════");
        console.log("  ✓ Config saved!\n");
        if (!allSelected) {
          console.log(`  Tools enabled: ${selectedTools.join(", ")}\n`);
        } else {
          console.log("  All tools enabled.\n");
        }
        console.log("  Restart OpenClaw to apply: openclaw restart");
        console.log("══════════════════════════════════════════\n");
      } catch (err) {
        console.log("failed.");
        console.log(`\n  ✗ ${err instanceof Error ? err.message : String(err)}`);
        console.log("\n  Falling back to manual config:\n");
        printManualConfig(apiKey, selectedTools, allSelected);
      }
    } else {
      printManualConfig(apiKey, selectedTools, allSelected);
    }
  } finally {
    rl.close();
  }
}

// ---------------------------------------------------------------------------
// status command
// ---------------------------------------------------------------------------

function runStatusCommand(api: OpenClawPluginApi): void {
  const config = (api.pluginConfig ?? {}) as Record<string, unknown>;
  const apiKey = getApiKey(api);
  const baseUrl = getBaseUrl(api);

  console.log("\n=== Apify Plugin Status ===\n");
  console.log(`  API key:       ${apiKey ? `configured (${apiKey.slice(0, 12)}…)` : "NOT SET — run 'openclaw apify setup'"}`);
  console.log(`  Base URL:      ${baseUrl}`);
  console.log(`  Cache TTL:     ${config.cacheTtlMinutes ?? 15} minutes`);
  console.log(`  Max results:   ${config.maxResults ?? 20} per run`);

  const enabledTools =
    Array.isArray(config.enabledTools) && config.enabledTools.length > 0
      ? (config.enabledTools as string[]).join(", ")
      : "all (no restriction)";
  console.log(`  Tools:         ${enabledTools}`);
  console.log(`  Plugin:        ${config.enabled === false ? "disabled" : "enabled (when API key is set)"}`);
  console.log();
}

// ---------------------------------------------------------------------------
// test command
// ---------------------------------------------------------------------------

async function runTestCommand(api: OpenClawPluginApi): Promise<void> {
  const apiKey = getApiKey(api);
  const baseUrl = getBaseUrl(api);

  console.log("\n=== Testing Apify API Connection ===\n");

  if (!apiKey) {
    console.log("  ✗ Cannot test: API key not configured.");
    console.log("    Run 'openclaw apify setup' to configure.\n");
    return;
  }

  process.stdout.write("  Connecting… ");

  try {
    const result = await apifyFetch<{ data: { username?: string; plan?: { name?: string } } }>({
      path: "/v2/users/me",
      apiKey,
      baseUrl,
      errorPrefix: "API test failed",
    });
    const user = result.data;
    console.log("done.\n");
    console.log(`  ✓ Connected successfully!`);
    console.log(`    Account: ${user.username ?? "unknown"}`);
    console.log(`    Plan:    ${user.plan?.name ?? "unknown"}`);
    console.log();
  } catch (err) {
    console.log("failed.\n");
    console.log(`  ✗ ${err instanceof Error ? err.message : String(err)}`);
    console.log("    Check that your API key is correct.\n");
  }
}
