import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { createMarketResearchTool } from "./tools/market-research-tool.js";
import { createCompetitorIntelligenceTool } from "./tools/competitor-intelligence-tool.js";
import { createTrendAnalysisTool } from "./tools/trend-analysis-tool.js";
import { createLeadGenerationTool } from "./tools/lead-generation-tool.js";
import { createEcommerceTool } from "./tools/ecommerce-tool.js";
import { createContentAnalyticsTool } from "./tools/content-analytics-tool.js";
import { createAudienceAnalysisTool } from "./tools/audience-analysis-tool.js";
import { createInfluencerDiscoveryTool } from "./tools/influencer-discovery-tool.js";
import { createBrandReputationTool } from "./tools/brand-reputation-tool.js";
import { createApifyScraperTool } from "./tools/apify-scraper-tool.js";
import { registerCli } from "./cli.js";

export default {
  id: "apify-openclaw-integration",
  name: "Apify",
  description:
    "Web scraping and AI-powered data extraction via Apify — market research, competitor intelligence, trend analysis, lead generation, e-commerce, social media analytics, and more.",
  register(api: OpenClawPluginApi) {
    const cfg = { pluginConfig: api.pluginConfig };
    const tools = [
      createMarketResearchTool(cfg),
      createCompetitorIntelligenceTool(cfg),
      createTrendAnalysisTool(cfg),
      createLeadGenerationTool(cfg),
      createEcommerceTool(cfg),
      createContentAnalyticsTool(cfg),
      createAudienceAnalysisTool(cfg),
      createInfluencerDiscoveryTool(cfg),
      createBrandReputationTool(cfg),
      createApifyScraperTool(cfg),
    ];
    for (const tool of tools) {
      if (tool) api.registerTool(tool);
    }
    registerCli(api);
  },
};
