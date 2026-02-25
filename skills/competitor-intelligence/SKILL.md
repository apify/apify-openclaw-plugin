---
name: apify-competitor-intelligence
description: >
  Analyze competitor strategies, ratings, reviews, and web presence using Apify.
  Use the competitor_intelligence tool for benchmarking rivals, analyzing competitor
  reviews, finding competitor locations, or assessing competitor search rankings.
---

# Apify Competitor Intelligence Skill

## When to use competitor_intelligence

- "Analyze my competitors in [city]"
- "What are [competitor name]'s reviews saying?"
- "How does [brand] rank on Google vs competitors?"
- "Find all [business type] competitors near [location]"
- "Compare ratings of [brand A] vs [brand B]"
- "What do customers complain about at [competitor]?"

## Available sources

| Source | Actor | Best for |
|--------|-------|---------|
| `google_maps` | compass/crawler-google-places | Competitor locations, ratings, contact info |
| `google_maps_reviews` | compass/Google-Maps-Reviews-Scraper | Deep review analysis for specific competitors |
| `google_search` | apify/google-search-scraper | Competitor search presence and web footprint |

## Two-phase async pattern

```json
// Step 1: start
{
  "action": "start",
  "requests": [
    {
      "source": "google_maps",
      "queries": ["Starbucks New York", "Blue Bottle Coffee New York"],
      "maxResults": 10
    },
    {
      "source": "google_search",
      "queries": ["Starbucks customer complaints 2024"],
      "maxResults": 10
    }
  ]
}

// Step 2: collect
{
  "action": "collect",
  "runs": [...]
}
```

## Key parameters

- **queries**: Competitor names or category+location (e.g., "Tesla showrooms Los Angeles").
- **urls**: Direct Google Maps URLs for specific competitor locations.
- **location**: Geographic filter for google_maps queries.
- **maxResults**: Up to 200 places or search results.

## Common workflows

**Competitive landscape mapping**: Use `google_maps` with category+location queries to find all competitors in an area. Compare ratings and review counts.

**Review intelligence**: Use `google_maps_reviews` with competitor place URLs for deep review mining. Look for recurring pain points in negative reviews — these are your opportunities.

**Search visibility**: Use `google_search` with competitor brand names to see their web presence, backlinks, and what content ranks for their brand.
