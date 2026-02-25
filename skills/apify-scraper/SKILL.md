---
name: apify-ultimate-scraper
description: >
  Universal Apify actor runner with built-in actor discovery. Use the
  apify_scraper tool when no specialized tool covers your use case, when you
  need to run a specific actor you already know, or when you want to discover
  new actors from the Apify Store for any web scraping task.
---

# Apify Ultimate Scraper Skill

## When to use apify_scraper

- "Find me a LinkedIn company scraper"
- "Is there an Apify actor that scrapes eBay prices?"
- "Run the `apify/google-search-scraper` actor for me"
- "Scrape Amazon product reviews using Apify"
- "I need data from a site that none of the specialized tools cover"
- Any scraping task where specialized tools (market_research, competitor_intelligence, etc.) don't apply

## Four-action workflow

### 1. `discover` — Search the Apify Store

Search by keyword to find relevant actors:

```json
{ "action": "discover", "query": "linkedin company scraper" }
```

Returns a ranked list of matching actors with IDs, run counts, and descriptions. Use the returned `actorId` (format: `username/actor-name`) in subsequent steps.

### 2. `discover` — Fetch an actor's input schema

Once you have an actor ID, fetch its schema to know what parameters to pass:

```json
{ "action": "discover", "actorId": "apify/linkedin-company-scraper" }
```

Returns the actor's `inputSchema` — field names, types, descriptions, defaults. Read this before calling `start`.

### 3. `start` — Run the actor

Fire an actor run with your prepared input:

```json
{
  "action": "start",
  "actorId": "apify/linkedin-company-scraper",
  "input": {
    "startUrls": [{ "url": "https://www.linkedin.com/company/apify/" }],
    "maxResults": 10
  },
  "label": "linkedin-apify"
}
```

Returns a `runs` array with `runId`, `datasetId`, and `actorId` needed for collection.

### 4. `collect` — Fetch results

Poll status and retrieve results when the run completes:

```json
{
  "action": "collect",
  "runs": [
    { "runId": "abc123", "actorId": "apify/linkedin-company-scraper", "datasetId": "def456" }
  ]
}
```

If the run is still pending, call `collect` again with the same `runs` array. Results are cached so repeated `collect` calls are cheap.

## Shortcut (known actors)

If you already know the actor ID and its parameters, skip both `discover` steps:

```json
// Start immediately
{
  "action": "start",
  "actorId": "apify/google-search-scraper",
  "input": { "queries": ["OpenAI site:techcrunch.com"], "maxPagesPerQuery": 1 }
}
```

## Actor ID format

- **Slug format**: `username/actor-name` (e.g., `apify/google-search-scraper`, `compass/crawler-google-places`)
- **Browse actors**: https://apify.com/store

## When to use specialized tools instead

If a specialized tool covers your use case, prefer it — they have curated schemas, better formatters, and useful defaults:

| Use case | Preferred tool |
|----------|---------------|
| Google Maps, Booking, TripAdvisor | `market_research` |
| Google Maps reviews, Google Search | `competitor_intelligence` |
| Google Trends, hashtag trends | `trend_analysis` |
| Business leads, email extraction | `lead_generation` |
| E-commerce product/review data | `ecommerce` |
| Instagram, Facebook, YouTube, TikTok posts | `content_analytics` |
| Social media follower/profile data | `audience_analysis` |
| Finding creators by niche | `influencer_discovery` |
| Reviews, ratings, comments | `brand_reputation` |
| **Anything else** | `apify_scraper` ← use this |

## Examples

```json
// Find an actor
{ "action": "discover", "query": "amazon product reviews scraper" }

// Get its schema
{ "action": "discover", "actorId": "junglee/amazon-reviews-scraper" }

// Run it
{
  "action": "start",
  "actorId": "junglee/amazon-reviews-scraper",
  "input": { "productUrls": [{ "url": "https://www.amazon.com/dp/B0XXXXX" }], "maxReviews": 50 }
}

// Collect results
{ "action": "collect", "runs": [{ "runId": "...", "actorId": "...", "datasetId": "..." }] }
```
