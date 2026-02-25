---
name: apify-brand-reputation-monitoring
description: >
  Monitor brand reputation by collecting reviews, ratings, and comments across
  Google Maps, Booking.com, TripAdvisor, Facebook, YouTube, and TikTok using
  Apify. Use the brand_reputation tool to track sentiment, surface complaints,
  and benchmark against competitors.
---

# Apify Brand Reputation Monitoring Skill

## When to use brand_reputation

- "What are customers saying about [brand] on Google Maps?"
- "Get recent reviews for [hotel] on Booking.com and TripAdvisor"
- "Monitor YouTube comments on [brand]'s channel"
- "What's the sentiment on TikTok for [brand] videos?"
- "Show me Facebook reviews for [business]"
- "Compare our Google reviews against our top 3 competitors"

## Available sources

| Source | Actor | Returns |
|--------|-------|---------|
| `google_maps` | compass/crawler-google-places | Business details, star rating, review text, reviewer info |
| `booking` | voyager/booking-scraper | Hotel listings, guest ratings, review breakdown |
| `tripadvisor` | maxcopell/tripadvisor-reviews | Reviews, ratings, reviewer location, response from owner |
| `facebook_reviews` | apify/facebook-reviews-scraper | Facebook page reviews, ratings, review text |
| `youtube_comments` | streamers/youtube-comments-scraper | Comments, likes, replies, commenter info |
| `tiktok_comments` | clockworks/tiktok-comments-scraper | Comments, likes, reply count on TikTok videos |

## Two-phase async pattern

```json
// Step 1: start
{
  "action": "start",
  "requests": [
    {
      "source": "google_maps",
      "queries": ["Nike Store New York"],
      "maxResults": 50
    },
    {
      "source": "facebook_reviews",
      "urls": ["https://www.facebook.com/nike/"],
      "maxResults": 30
    },
    {
      "source": "youtube_comments",
      "urls": ["https://www.youtube.com/watch?v=VIDEO_ID"],
      "maxResults": 100
    }
  ]
}

// Step 2: collect
{ "action": "collect", "runs": [...] }
```

## Key parameters

- **queries**: Search terms for finding businesses on Google Maps or TripAdvisor (e.g., `"Nike Store London"`).
- **urls**: Direct URLs for Facebook pages, YouTube videos, TikTok videos, or hotel/place pages.
- **dateFrom**: ISO date string — only return reviews/comments newer than this date (e.g., `"2024-01-01"`). Supported by select actors.
- **maxResults**: Number of reviews/comments to retrieve per run (default: 20).

## Key fields by source

**google_maps**: `title` (business name), `totalScore` (rating), `reviewsCount`, `reviews[].text`, `reviews[].stars`, `reviews[].publishedAtDate`

**tripadvisor**: `title`, `rating`, `reviewsCount`, `reviews[].text`, `reviews[].rating`, `reviews[].publishedDate`

**facebook_reviews**: `pageUrl`, `rating`, `text`, `author`, `publishedAt`

**youtube_comments**: `text`, `likesCount`, `replyCount`, `authorDisplayName`, `publishedAt`

**tiktok_comments**: `text`, `likesCount`, `replyCount`, `authorUniqueId`, `createTime`

## Common workflows

**Sentiment monitoring**: Pull 100+ reviews from Google Maps and TripAdvisor. Ask the agent to summarize positive vs. negative themes.

**Crisis detection**: Monitor YouTube and TikTok comments on recent brand videos for spikes in negative sentiment.

**Competitive benchmarking**: Pull Google Maps reviews for 3–5 competitors. Compare average ratings, review volume, and common complaints.

**Review response gaps**: Collect TripAdvisor reviews. Identify reviews without owner responses to find service recovery opportunities.

**Multi-platform brand health**: Run all six sources simultaneously to get a 360° view of brand perception.
