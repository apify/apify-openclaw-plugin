---
name: apify-lead-generation
description: Generates B2B/B2C leads by scraping Google Maps, websites, Instagram, TikTok, Facebook, LinkedIn, YouTube, and Google Search. Use when user asks to find leads, prospects, businesses, build lead lists, enrich contacts, or scrape profiles for sales outreach.
---

# Lead Generation

Use the `apify_scraper` tool. Select the best actor from the table below and run it with `action="start"`. Use `action="discover"` with the actor ID first if you need to see the full input schema.

## Actor Selection

| User Need | Actor ID |
|-----------|----------|
| Local business leads | `compass~crawler-google-places` |
| Google Maps email discovery | `poidata~google-maps-email-extractor` |
| Contact enrichment from URLs | `vdrmota~contact-info-scraper` |
| Google Search discovery | `apify~google-search-scraper` |
| Instagram profile leads | `apify~instagram-profile-scraper` |
| Instagram user search | `apify~instagram-search-scraper` |
| TikTok user search | `clockworks~tiktok-user-search-scraper` |
| TikTok profile leads | `clockworks~tiktok-profile-scraper` |
| TikTok follower lists | `clockworks~tiktok-followers-scraper` |
| Facebook page leads | `apify~facebook-pages-scraper` |
| Facebook page contact info | `apify~facebook-page-contact-information` |
| Facebook group members | `apify~facebook-groups-scraper` |
| YouTube channel leads | `streamers~youtube-channel-scraper` |

## Multi-step Lead Enrichment

For richer leads: first scrape listings with `compass~crawler-google-places`, then pass the website URLs to `vdrmota~contact-info-scraper` to extract emails and phones.
