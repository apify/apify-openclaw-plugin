import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { createSocialPlatformsTool } from "./social-platforms-tool.js";

export default {
  id: "apify-openclaw-integration",
  name: "Apify Social Scraper",
  description: "Social media scraping via Apify (Instagram, TikTok, YouTube, LinkedIn)",
  register(api: OpenClawPluginApi) {
    const tool = createSocialPlatformsTool({ pluginConfig: api.pluginConfig });
    if (tool) {
      api.registerTool(tool);
    }
  },
};
