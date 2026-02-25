---
name: apify-content-analytics
description: >
  Measure social media content performance and engagement metrics across Instagram,
  Facebook, YouTube, and TikTok using Apify. Use the content_analytics tool to
  track post engagement, measure campaign ROI, analyze reel performance, or audit
  content across social platforms.
---

# Apify Content Analytics Skill

## When to use content_analytics

- "How did this Instagram post perform?"
- "Analyze engagement on [brand's] recent Instagram reels"
- "Measure our Facebook campaign ROI"
- "Get YouTube metrics for these videos"
- "What's the engagement rate on TikTok for #[hashtag]?"
- "Track follower growth on Instagram"
- "Analyze content performance for @[username]"

## Available sources

| Source | Actor | Returns |
|--------|-------|---------|
| `instagram_posts` | apify/instagram-post-scraper | Likes, comments, views, timestamp, caption |
| `instagram_reels` | apify/instagram-reel-scraper | Play count, likes, comments, shares for reels |
| `facebook_posts` | apify/facebook-posts-scraper | Reactions, comments, shares, reach |
| `youtube` | streamers/youtube-scraper | Views, likes, comments, duration, publish date |
| `tiktok` | clockworks/tiktok-scraper | Plays, likes, shares, comments, author stats |

## Two-phase async pattern

```json
// Step 1: start
{
  "action": "start",
  "requests": [
    {
      "source": "instagram_posts",
      "urls": ["https://www.instagram.com/nike/"],
      "maxResults": 20
    },
    {
      "source": "tiktok",
      "hashtags": ["nikerunning", "justdoit"],
      "maxResults": 30
    }
  ]
}

// Step 2: collect
{ "action": "collect", "runs": [...] }
```

## Key parameters

- **urls**: Profile or post URLs. For profile URLs, returns recent posts from that profile.
- **hashtags**: Hashtag names (without `#`) for hashtag-based content discovery.
- **maxResults**: Number of posts/videos to fetch (up to 200).

## Engagement metrics to watch

| Platform | Key metrics |
|----------|------------|
| Instagram | `likesCount`, `commentsCount`, `videoViewCount` |
| Facebook | `likesCount`, `commentsCount`, `sharesCount`, `reactionsCount` |
| YouTube | `viewCount`, `likeCount`, `commentCount` |
| TikTok | `playCount`, `diggCount` (likes), `shareCount`, `commentCount` |

## Calculating engagement rate

After collecting, calculate:
```
Engagement Rate = (likes + comments + shares) / followers × 100
```

A good engagement rate by platform:
- Instagram: 1-3% average, >5% excellent
- TikTok: 3-9% average (higher due to viral algorithm)
- YouTube: 0.5-2% for views-to-engagement ratio
- Facebook: 0.5-1% average

## Common workflows

**Campaign reporting**: Collect post URLs before and after a campaign. Compare engagement deltas.

**Content audit**: Scrape 50+ recent posts from a profile. Sort by engagement to identify top-performing content types.

**Hashtag performance**: Run tiktok or instagram_posts with hashtags to see what content performs in a niche.
