---
name: apify-influencer-discovery
description: Find and evaluate influencers for brand partnerships, verify authenticity, and track collaboration performance across Instagram, Facebook, YouTube, and TikTok.
---

# Influencer Discovery

Use the `apify_scraper` tool. Select the best actor from the table below and run it with `action="start"`. Use `action="discover"` with the actor ID first if you need to see the full input schema.

## Actor Selection

| User Need | Actor ID |
|-----------|----------|
| Instagram influencer profiles | `apify~instagram-profile-scraper` |
| Find influencers by hashtag | `apify~instagram-hashtag-scraper` |
| Find influencers by keyword | `apify~instagram-search-scraper` |
| Instagram engagement verification | `apify~instagram-comment-scraper` |
| Instagram comprehensive data | `apify~instagram-scraper` |
| TikTok influencer discovery | `clockworks~tiktok-scraper` |
| TikTok user search by keyword | `clockworks~tiktok-user-search-scraper` |
| TikTok profile details | `clockworks~tiktok-profile-scraper` |
| TikTok live streamers | `clockworks~tiktok-live-scraper` |
| YouTube creator channels | `streamers~youtube-channel-scraper` |
| Facebook page discovery | `apify~facebook-search-scraper` |
| Facebook group influencers | `apify~facebook-groups-scraper` |

## Influencer Vetting Workflow

1. Discover profiles with a search/hashtag actor
2. Verify engagement quality with a comment scraper (low genuine comments = fake followers)
