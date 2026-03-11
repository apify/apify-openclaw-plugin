# Apify Plugin for OpenClaw

Universal web scraping and data extraction via [Apify](https://apify.com) — 57+ Actors across Instagram, Facebook, TikTok, YouTube, Google Maps, Google Search, e-commerce, and more.

## Install

```bash
openclaw plugins install @apify/apify-openclaw-plugin
```

Restart the Gateway after installation.

## How it works

The plugin registers a single tool — `apify_scraper` — with three actions:

| Action | Purpose |
|--------|---------|
| `discover` + `query` | Search the Apify Store for Actors by keyword |
| `discover` + `actorId` | Fetch an Actor's input schema + README |
| `start` + `actorId` + `input` | Run any Apify Actor, returns `runId` / `datasetId` |
| `collect` + `runs` | Poll status and return results for completed runs |

The tool uses a **two-phase async pattern**: `start` fires off a run and returns immediately. `collect` fetches results when the run completes. The agent does other work in between.

## Get an API key

1. Create an Apify account at [https://console.apify.com/](https://console.apify.com/)
2. Generate an API token in Account Settings → Integrations.
3. Store it in plugin config or set the `APIFY_API_KEY` environment variable.

## Configure

```json5
{
  plugins: {
    entries: {
      "apify-openclaw-plugin": {
        config: {
          apiKey: "apify_api_...",     // optional if APIFY_API_KEY env var is set
          baseUrl: "https://api.apify.com",
          maxResults: 20,
          enabledTools: [],           // empty = all tools enabled
        },
      },
    },
  },
  // Make the tool available to agents:
  tools: {
    alsoAllow: ["apify_scraper"],   // or "apify-openclaw-plugin" or "group:plugins"
  },
}
```

Or use the interactive setup wizard:

```bash
openclaw apify setup
```

## apify_scraper

### Workflow

```
discover (search) → discover (schema) → start → collect
```

1. **Search** — Find Actors: `{ action: "discover", query: "amazon price scraper" }`
2. **Schema** — Get input params: `{ action: "discover", actorId: "apify~google-search-scraper" }`
3. **Start** — Run the Actor: `{ action: "start", actorId: "apify~google-search-scraper", input: { queries: ["OpenAI"] } }`
4. **Collect** — Get results: `{ action: "collect", runs: [{ runId: "...", actorId: "...", datasetId: "..." }] }`

### Actor ID format

Actor IDs use the `username~actor-name` format (tilde separator, not slash).

### Known Actors

The tool description includes 57+ known Actors across these categories:

- **Instagram** — profiles, posts, comments, hashtags, reels, search, followers, tagged posts
- **Facebook** — pages, posts, comments, likes, reviews, groups, events, ads, reels, photos, marketplace
- **TikTok** — search, profiles, videos, comments, followers, hashtags, sounds, ads, trends, live
- **YouTube** — search, channels, comments, shorts, video-by-hashtag
- **Google Maps** — places, reviews, email extraction
- **Other** — Google Search, Google Trends, Booking.com, TripAdvisor, contact info, e-commerce

### Batching

Most Actors accept arrays of URLs/queries in their input (e.g., `startUrls`, `queries`). Always batch multiple targets into a single run — one run with 5 URLs is cheaper and faster than 5 separate runs.

### Examples

```javascript
// 1. Search the Apify Store
const search = await apify_scraper({
  action: "discover",
  query: "linkedin company scraper",
});

// 2. Get an Actor's input schema
const schema = await apify_scraper({
  action: "discover",
  actorId: "compass~crawler-google-places",
});

// 3. Start a Google Search scrape
const started = await apify_scraper({
  action: "start",
  actorId: "apify~google-search-scraper",
  input: { queries: ["OpenAI", "Anthropic"], maxPagesPerQuery: 1 },
  label: "search",
});
// -> { runs: [{ runId, actorId, datasetId, status }] }

// 4. Collect results
const results = await apify_scraper({
  action: "collect",
  runs: started.runs,
});
// -> { completed: [...], pending: [...] }

// Instagram profile scraping
await apify_scraper({
  action: "start",
  actorId: "apify~instagram-profile-scraper",
  input: { usernames: ["natgeo", "nasa"] },
});

// TikTok search
await apify_scraper({
  action: "start",
  actorId: "clockworks~tiktok-scraper",
  input: { searchQueries: ["AI tools"], resultsPerPage: 20 },
});
```

### Sub-agent delegation

The tool description instructs agents to delegate `apify_scraper` calls to a sub-agent. The sub-agent handles the full discover → start → collect workflow and returns only the relevant extracted data — not raw API responses or run metadata.

## Security

- **API keys** are resolved from plugin config or `APIFY_API_KEY` env var — never logged or included in output.
- **Base URL validation** — only `https://api.apify.com` prefix is allowed (SSRF prevention).
- **External content wrapping** — all scraped results are wrapped with untrusted content markers.

## Development

```bash
# Install dependencies
npm install

# Type check
npx tsc --noEmit

# Run tests
npx vitest run

# Pack (dry run)
npm pack --dry-run
```

## Support

For issues with this integration, contact [integrations@apify.com](mailto:integrations@apify.com).

## License

MIT
