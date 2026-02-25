---
name: apify-trend-analysis
description: >
  Discover trending content, hashtags, and search patterns across Google Trends,
  Instagram, and TikTok using Apify. Use the trend_analysis tool when asked about
  what's trending, rising keywords, viral hashtags, or content performance by topic.
---

# Apify Trend Analysis Skill

## When to use trend_analysis

- "What's trending on TikTok for [topic]?"
- "Show me Google Trends for [keyword] over the last 3 months"
- "What are popular Instagram hashtags for [niche]?"
- "Is [topic] trending up or down?"
- "Find viral TikTok content about [subject]"
- "What hashtags should I use for [campaign]?"

## Available sources

| Source | Actor | Best for |
|--------|-------|---------|
| `google_trends` | apify/google-trends-scraper | Search interest over time for keywords |
| `instagram_hashtags` | apify/instagram-hashtag-scraper | Posts and engagement under Instagram hashtags |
| `tiktok_hashtags` | clockworks/tiktok-hashtag-scraper | TikTok videos and stats for specific hashtags |
| `tiktok_trends` | clockworks/tiktok-trends-scraper | Currently trending TikTok content globally |

## Two-phase async pattern

```json
// Step 1: start — run all sources concurrently
{
  "action": "start",
  "requests": [
    {
      "source": "google_trends",
      "queries": ["AI tools", "ChatGPT", "Claude AI"],
      "timeRange": "today 3-m"
    },
    {
      "source": "tiktok_hashtags",
      "queries": ["fitness", "gymtok", "workout"],
      "maxResults": 30
    }
  ]
}

// Step 2: collect
{ "action": "collect", "runs": [...] }
```

## Key parameters

- **queries**: Keywords or hashtag names (without the `#` symbol). One run per query fires concurrently.
- **timeRange** (google_trends only):
  - `"now 1-H"` — past hour
  - `"now 7-d"` — past 7 days
  - `"today 1-m"` — past 30 days
  - `"today 3-m"` — past 90 days *(default)*
  - `"today 12-m"` — past year
  - `"today 5-y"` — past 5 years
- **maxResults**: Max posts/videos to retrieve (default: 20).

## Interpreting Google Trends results

- `value` (0-100): Relative search interest. 100 = peak popularity.
- Values are relative, not absolute search volume.
- Compare multiple terms in one run to see relative popularity.

## Common workflows

**Content calendar planning**: Search Google Trends for seasonal patterns in your niche to time content releases.

**Hashtag research**: Run instagram_hashtags or tiktok_hashtags for your target keywords to find which have the most engagement.

**Trend validation**: Run google_trends for a product idea to see if search interest is rising or falling before investing.

**Competitive hashtag discovery**: Run tiktok_hashtags with competitor brand names to see what content performs in their space.
