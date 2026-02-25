---
name: apify-audience-analysis
description: >
  Analyze audience demographics, follower profiles, and channel statistics across
  Instagram, Facebook, YouTube, and TikTok using Apify. Use the audience_analysis
  tool to understand who follows a brand or creator, subscriber counts, and audience
  composition for creators or brands.
---

# Apify Audience Analysis Skill

## When to use audience_analysis

- "How many followers does @[username] have on Instagram?"
- "Get me stats for [YouTube channel]"
- "Analyze the TikTok profile of @[creator]"
- "What's the Facebook page audience for [brand]?"
- "Compare follower counts for these brands across platforms"
- "Show me the TikTok profile details for @[creator]"

## Available sources

| Source | Actor | Returns |
|--------|-------|---------|
| `instagram_profile` | apify/instagram-profile-scraper | Bio, followers, following, posts count, avg engagement |
| `facebook_followers` | apify/facebook-followers-following-scraper | Follower list with names and profile URLs |
| `youtube_channel` | streamers/youtube-channel-scraper | Subscribers, total views, video count, description |
| `tiktok_profile` | clockworks/tiktok-profile-scraper | Followers, following, likes, video count, bio |

## Two-phase async pattern

```json
// Step 1: start
{
  "action": "start",
  "requests": [
    {
      "source": "instagram_profile",
      "urls": ["https://www.instagram.com/nike/", "https://www.instagram.com/adidas/"]
    },
    {
      "source": "youtube_channel",
      "urls": ["https://www.youtube.com/@nike"]
    },
    {
      "source": "tiktok_profile",
      "urls": ["https://www.tiktok.com/@nike"]
    }
  ]
}

// Step 2: collect
{ "action": "collect", "runs": [...] }
```

## Key parameters

- **urls**: Profile/channel URLs. For Instagram and TikTok, the username is extracted automatically.
- **maxResults**: Relevant for `facebook_followers` (how many followers to retrieve).

## Key fields by source

**instagram_profile**: `username`, `fullName`, `followersCount`, `followsCount`, `postsCount`, `biography`, `isVerified`, `externalUrl`

**youtube_channel**: `channelName`, `subscriberCount`, `viewCount`, `videoCount`, `description`, `channelUrl`

**tiktok_profile**: `uniqueId`, `nickname`, `followerCount`, `followingCount`, `heartCount` (total likes), `videoCount`, `signature` (bio)

## Common workflows

**Cross-platform comparison**: Run all four sources simultaneously for the same brand to compare audience size across platforms.

**Influencer vetting**: Check follower counts and engagement before a partnership. High followers with low engagement = suspicious.

**Brand benchmarking**: Compare your audience size against 3-5 competitors across platforms.
