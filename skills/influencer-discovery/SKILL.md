---
name: apify-influencer-discovery
description: >
  Discover and evaluate influencers for brand partnerships across Instagram,
  YouTube, and TikTok using Apify. Use the influencer_discovery tool to find
  creators by niche or hashtag, compare follower counts, and assess engagement
  quality before outreach.
---

# Apify Influencer Discovery Skill

## When to use influencer_discovery

- "Find fitness influencers on Instagram with 50k+ followers"
- "Discover TikTok creators in the cooking niche"
- "Find YouTube channels about personal finance"
- "Who are the top beauty influencers on Instagram?"
- "Search for travel content creators on TikTok"

## Available sources

| Source | Actor | Returns |
|--------|-------|---------|
| `instagram` | apify/instagram-profile-scraper | Bio, followers, following, posts count, engagement rate, verified status |
| `youtube` | streamers/youtube-channel-scraper | Subscribers, total views, video count, description, channel URL |
| `tiktok` | clockworks/tiktok-scraper | Followers, likes, video count, hashtag posts, creator bio |

## Two-phase async pattern

```json
// Step 1: start
{
  "action": "start",
  "requests": [
    {
      "source": "instagram",
      "queries": ["fitness", "gym", "workout"],
      "minFollowers": 10000,
      "maxResults": 20
    },
    {
      "source": "tiktok",
      "queries": ["fitnessmotivation"],
      "maxResults": 15
    }
  ]
}

// Step 2: collect
{ "action": "collect", "runs": [...] }
```

## Key parameters

- **queries**: Hashtags (without #) or search keywords to find creators by niche.
- **urls**: Direct profile URLs to scrape specific known accounts.
- **minFollowers**: Post-scrape filter — only return creators with at least this many followers.
- **maxResults**: Number of profiles to retrieve per run (default: 20).

## Key fields by source

**instagram**: `username`, `fullName`, `followersCount`, `followsCount`, `postsCount`, `biography`, `isVerified`, `avgEngagement`

**youtube**: `channelName`, `subscriberCount`, `viewCount`, `videoCount`, `description`, `channelUrl`

**tiktok**: `uniqueId`, `nickname`, `followerCount`, `followingCount`, `heartCount` (total likes), `videoCount`, `signature` (bio)

## Common workflows

**Niche influencer search**: Search hashtags on Instagram or TikTok to find active creators in your vertical. Use `minFollowers` to filter out micro vs. macro influencers.

**Multi-platform roster**: Run Instagram + YouTube + TikTok simultaneously for the same niche to build a cross-platform shortlist.

**Authenticity check**: High followers with low `heartCount` or `avgEngagement` may indicate purchased followers. Compare engagement-to-follower ratio across candidates.

**Competitor's partners**: Use profile URLs of known brand collaborators to analyze their metrics before approaching similar creators.
