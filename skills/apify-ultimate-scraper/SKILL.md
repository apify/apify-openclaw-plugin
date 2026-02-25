---
name: apify-ultimate-scraper
description: Universal AI-powered web scraper for any platform. Scrape data from Instagram, Facebook, TikTok, YouTube, Google Maps, Google Search, Google Trends, Booking.com, and TripAdvisor. Use for lead generation, brand monitoring, competitor analysis, influencer discovery, trend research, content analytics, audience analysis, or any data extraction task.
version: 1.0.8
source: https://github.com/apify/agent-skills
homepage: https://apify.com
metadata:
  openclaw:
    requires:
      env:
        - APIFY_TOKEN
      bins:
        - node
        - mcpc
    primaryEnv: APIFY_TOKEN
    install:
      - kind: node
        package: "@apify/mcpc"
        bins: [mcpc]
---

# Universal Web Scraper

AI-driven data extraction from 57+ Actors across all major platforms.

## Workflow

**Option A — `apify_scraper` tool (preferred):**
1. Pick the best actor from the tables below
2. `action="discover"` + `actorId` → fetch input schema + README (when you need param details)
3. `action="start"` + `actorId` + `input` → fire the run
4. `action="collect"` + `runs` → get results

**Option B — mcpc CLI (alternative, requires mcpc installed):**

Search for actors:
```bash
mcpc --json mcp.apify.com --header "Authorization: Bearer $APIFY_TOKEN" tools-call search-actors keywords:="SEARCH_KEYWORDS" limit:=10 offset:=0 category:=""
```

Fetch actor schema:
```bash
mcpc --json mcp.apify.com --header "Authorization: Bearer $APIFY_TOKEN" tools-call fetch-actor-details actor:="ACTOR_ID"
```

## Actor Selection

### Instagram (12)

| Actor ID | Best For |
|----------|----------|
| `apify~instagram-profile-scraper` | Profile data, follower counts, bio info |
| `apify~instagram-post-scraper` | Individual post details, engagement metrics |
| `apify~instagram-comment-scraper` | Comment extraction, sentiment analysis |
| `apify~instagram-hashtag-scraper` | Hashtag content, trending topics |
| `apify~instagram-hashtag-stats` | Hashtag performance metrics |
| `apify~instagram-reel-scraper` | Reels content and metrics |
| `apify~instagram-search-scraper` | Search users, places, hashtags |
| `apify~instagram-tagged-scraper` | Posts tagged with specific accounts |
| `apify~instagram-followers-count-scraper` | Follower count tracking |
| `apify~instagram-scraper` | Comprehensive Instagram data |
| `apify~instagram-api-scraper` | API-based Instagram access |
| `apify~export-instagram-comments-posts` | Bulk comment/post export |

### Facebook (14)

| Actor ID | Best For |
|----------|----------|
| `apify~facebook-pages-scraper` | Page data, metrics, contact info |
| `apify~facebook-page-contact-information` | Emails, phones, addresses from pages |
| `apify~facebook-posts-scraper` | Post content and engagement |
| `apify~facebook-comments-scraper` | Comment extraction |
| `apify~facebook-likes-scraper` | Reaction analysis |
| `apify~facebook-reviews-scraper` | Page reviews |
| `apify~facebook-groups-scraper` | Group content and members |
| `apify~facebook-events-scraper` | Event data |
| `apify~facebook-ads-scraper` | Ad creative and targeting |
| `apify~facebook-search-scraper` | Search results |
| `apify~facebook-reels-scraper` | Reels content |
| `apify~facebook-photos-scraper` | Photo extraction |
| `apify~facebook-marketplace-scraper` | Marketplace listings |
| `apify~facebook-followers-following-scraper` | Follower/following lists |

### TikTok (14)

| Actor ID | Best For |
|----------|----------|
| `clockworks~tiktok-scraper` | Comprehensive TikTok data |
| `clockworks~free-tiktok-scraper` | Free TikTok extraction |
| `clockworks~tiktok-profile-scraper` | Profile data |
| `clockworks~tiktok-video-scraper` | Video details and metrics |
| `clockworks~tiktok-comments-scraper` | Comment extraction |
| `clockworks~tiktok-followers-scraper` | Follower lists |
| `clockworks~tiktok-user-search-scraper` | Find users by keywords |
| `clockworks~tiktok-hashtag-scraper` | Hashtag content |
| `clockworks~tiktok-sound-scraper` | Trending sounds |
| `clockworks~tiktok-ads-scraper` | Ad content |
| `clockworks~tiktok-discover-scraper` | Discover page content |
| `clockworks~tiktok-explore-scraper` | Explore content |
| `clockworks~tiktok-trends-scraper` | Trending content |
| `clockworks~tiktok-live-scraper` | Live stream data |

### YouTube (5)

| Actor ID | Best For |
|----------|----------|
| `streamers~youtube-scraper` | Video data and metrics |
| `streamers~youtube-channel-scraper` | Channel information |
| `streamers~youtube-comments-scraper` | Comment extraction |
| `streamers~youtube-shorts-scraper` | Shorts content |
| `streamers~youtube-video-scraper-by-hashtag` | Videos by hashtag |

### Google Maps (4)

| Actor ID | Best For |
|----------|----------|
| `compass~crawler-google-places` | Business listings, ratings, contact info |
| `compass~google-maps-extractor` | Detailed business data |
| `compass~Google-Maps-Reviews-Scraper` | Review extraction |
| `poidata~google-maps-email-extractor` | Email discovery from listings |

### Other (7)

| Actor ID | Best For |
|----------|----------|
| `apify~google-search-scraper` | Google search results |
| `apify~google-trends-scraper` | Google Trends data |
| `voyager~booking-scraper` | Booking.com hotel data |
| `voyager~booking-reviews-scraper` | Booking.com reviews |
| `maxcopell~tripadvisor-reviews` | TripAdvisor reviews |
| `vdrmota~contact-info-scraper` | Contact enrichment from URLs |
| `apify~e-commerce-scraping-tool` | Products, reviews, sellers (50+ marketplaces) |

---

## Use Case Quick Reference

| Use Case | Primary Actors |
|----------|---------------|
| **Lead Generation** | `compass~crawler-google-places`, `poidata~google-maps-email-extractor`, `vdrmota~contact-info-scraper` |
| **Influencer Discovery** | `apify~instagram-profile-scraper`, `clockworks~tiktok-profile-scraper`, `streamers~youtube-channel-scraper` |
| **Brand Monitoring** | `apify~instagram-tagged-scraper`, `apify~instagram-hashtag-scraper`, `compass~Google-Maps-Reviews-Scraper` |
| **Competitor Analysis** | `apify~facebook-pages-scraper`, `apify~facebook-ads-scraper`, `apify~instagram-profile-scraper` |
| **Content Analytics** | `apify~instagram-post-scraper`, `clockworks~tiktok-scraper`, `streamers~youtube-scraper` |
| **Trend Research** | `apify~google-trends-scraper`, `clockworks~tiktok-trends-scraper`, `apify~instagram-hashtag-stats` |
| **Review Analysis** | `compass~Google-Maps-Reviews-Scraper`, `voyager~booking-reviews-scraper`, `maxcopell~tripadvisor-reviews` |
| **Audience Analysis** | `apify~instagram-followers-count-scraper`, `clockworks~tiktok-followers-scraper`, `apify~facebook-followers-following-scraper` |
| **E-commerce** | `apify~e-commerce-scraping-tool` |

---

## Multi-Actor Workflows

| Workflow | Step 1 | Step 2 |
|----------|--------|--------|
| **Lead enrichment** | `compass~crawler-google-places` → | `vdrmota~contact-info-scraper` |
| **Influencer vetting** | `apify~instagram-profile-scraper` → | `apify~instagram-comment-scraper` |
| **Competitor deep-dive** | `apify~facebook-pages-scraper` → | `apify~facebook-posts-scraper` |
| **Local business analysis** | `compass~crawler-google-places` → | `compass~Google-Maps-Reviews-Scraper` |

## Security & Data Privacy

Apify Actors only scrape publicly available data. For additional assurance, check an Actor's permission level via `action="discover"` — look for `LIMITED_PERMISSIONS` (restricted sandbox) vs `FULL_PERMISSIONS` (broader system access). See [Apify's General Terms](https://docs.apify.com/legal/general-terms-and-conditions).

## Error Handling

`Actor not found` — Check actor ID spelling and use `~` separator (not `/`)
`Run FAILED` — Check Apify console link in error output
`missing_api_key` — Run `openclaw apify setup` to configure your API key
`mcpc not found` — Run `npm install -g @apify/mcpc`
