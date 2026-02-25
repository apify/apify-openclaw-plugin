---
name: apify-audience-analysis
description: Understand audience demographics, preferences, behavior patterns, and engagement quality across Facebook, Instagram, YouTube, and TikTok.
---

# Audience Analysis

Use the `apify_scraper` tool. Select the best actor from the table below and run it with `action="start"`. Use `action="discover"` with the actor ID first if you need to see the full input schema.

## Actor Selection

| User Need | Actor ID |
|-----------|----------|
| Facebook follower demographics | `apify~facebook-followers-following-scraper` |
| Facebook engagement / reactions | `apify~facebook-likes-scraper` |
| Facebook comment sentiment | `apify~facebook-comments-scraper` |
| Instagram audience sizing | `apify~instagram-profile-scraper` |
| Instagram follower count tracking | `apify~instagram-followers-count-scraper` |
| Instagram comment sentiment | `apify~instagram-comment-scraper` |
| Instagram tagged content | `apify~instagram-tagged-scraper` |
| Bulk Instagram comment/post export | `apify~export-instagram-comments-posts` |
| YouTube channel subscribers | `streamers~youtube-channel-scraper` |
| YouTube comment analysis | `streamers~youtube-comments-scraper` |
| TikTok follower demographics | `clockworks~tiktok-followers-scraper` |
| TikTok profile analysis | `clockworks~tiktok-profile-scraper` |
| TikTok comment analysis | `clockworks~tiktok-comments-scraper` |
