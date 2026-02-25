---
name: apify-lead-generation
description: >
  Generate B2B and B2C leads from local business directories and web search using
  Apify. Use the lead_generation tool when asked to find business contacts, build
  prospect lists, find company emails, or discover potential clients in a market.
---

# Apify Lead Generation Skill

## When to use lead_generation

- "Find marketing agencies in London"
- "Get me a list of dentists in Austin with contact info"
- "Find restaurants in NYC that don't have a website"
- "Build a prospect list of plumbers in Seattle"
- "Find email addresses for gyms in Chicago"
- "Discover software companies in Berlin"

## Available sources

| Source | Actor | Best for |
|--------|-------|---------|
| `google_maps` | compass/crawler-google-places | Local business leads: name, address, phone, website, category |
| `google_maps_email` | poidata/google-maps-email-extractor | Same as google_maps + visits websites to extract email addresses (slower) |
| `google_search` | apify/google-search-scraper | Web-based lead discovery via search results |

## Two-phase async pattern

```json
// Step 1: start
{
  "action": "start",
  "requests": [
    {
      "source": "google_maps_email",
      "queries": ["web design agencies Chicago", "digital marketing agencies Chicago"],
      "maxResults": 50
    }
  ]
}

// Step 2: collect
{ "action": "collect", "runs": [...] }
```

## Key parameters

- **queries**: Niche + location strings. Be specific: "plumbers in downtown Austin" works better than "plumbers Austin".
- **maxResults**: Up to 200 leads per query (default: 20).
- **source choice**:
  - Use `google_maps` for fast results with phone/website
  - Use `google_maps_email` when emails are needed (runs longer, costs more Apify credits)
  - Use `google_search` for non-local or B2B leads

## Lead quality tips

1. **Specific queries yield better leads**: "pediatric dentists Austin TX" > "dentists Austin"
2. **Batch parallel queries**: Pass multiple queries in one `start` call — they run concurrently
3. **Filter by rating**: After collecting, filter `totalScore >= 4.0` for quality leads
4. **Check website field**: Businesses with no website are often underserved prospects
5. **Combine sources**: Run `google_maps` for quick volume, then `google_maps_email` for top prospects

## Common workflows

**Local B2B outreach**: Use `google_maps_email` for a specific niche + city. Export to CSV for CRM import.

**Market validation**: Use `google_maps` to count how many businesses exist in a niche across multiple cities. Helps prioritize geographic expansion.

**Website audit prospects**: Filter `google_maps` results for leads where `website` is empty — these businesses need web services.
