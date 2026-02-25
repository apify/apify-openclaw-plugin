---
name: apify-market-research
description: >
  Analyze local markets, geographic business density, hotel availability, and travel
  destinations using Apify. Use the market_research tool when asked about businesses
  in a specific area, hotel options, restaurant scenes, market sizing by location,
  or pricing trends at hospitality venues.
---

# Apify Market Research Skill

## When to use market_research

Use this tool when the user asks:
- "Find coffee shops / restaurants / [business type] in [city/area]"
- "What's the hotel market like in [location]?"
- "How many [business type] are there in [area]?"
- "Get me TripAdvisor reviews for hotels in [destination]"
- "What are competitors charging in [location]?"
- "Research the restaurant market in [city]"

## Available sources

| Source | Actor | Best for |
|--------|-------|---------|
| `google_maps` | compass/crawler-google-places | Local businesses: name, address, phone, website, rating, hours, reviews |
| `booking` | voyager/booking-scraper | Hotels and accommodation from Booking.com |
| `tripadvisor` | maxcopell/tripadvisor-reviews | Hotels, restaurants, attractions from TripAdvisor |

## Two-phase async pattern

Always use start → collect:

```json
// Step 1: start
{
  "action": "start",
  "requests": [
    {
      "source": "google_maps",
      "queries": ["pizza restaurants in Chicago", "Italian restaurants Chicago"],
      "maxResults": 20,
      "includeReviews": true,
      "maxReviews": 5
    },
    {
      "source": "tripadvisor",
      "queries": ["hotels in Barcelona"],
      "maxResults": 15
    }
  ]
}
// → returns { runs: [{ runId, source, datasetId }, ...] }

// Step 2: collect (use runs from step 1)
{
  "action": "collect",
  "runs": [{ "runId": "...", "source": "google_maps", "datasetId": "..." }]
}
```

## Key parameters

- **queries**: Search strings like "dentists in Austin TX" or "boutique hotels London". One run per query fires concurrently.
- **urls**: Direct Google Maps / Booking.com / TripAdvisor URLs for known places.
- **includeReviews** (google_maps only): Set to `true` to include customer reviews. Slows the run.
- **maxReviews**: How many reviews per place to include (default: 10).
- **maxResults**: Max places per query (up to 200).
- **actorInput**: Pass any actor-specific parameter directly (e.g., `{ "language": "de", "country": "DE" }` for German results).

## Interpreting results

Google Maps fields of note:
- `totalScore` — average star rating (1-5)
- `reviewsCount` — total number of reviews
- `categoryName` — business category
- `openingHours` — structured hours array
- `phone`, `website` — contact info

## Common workflows

**Market sizing**: Run multiple queries for the same business type across an area, then count/average results.

**Pricing research**: Use `booking` source for hotel pricing across dates and locations.

**Review sentiment**: Enable `includeReviews: true` on google_maps and summarize the review text.
