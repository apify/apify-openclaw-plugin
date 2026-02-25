---
name: apify-competitor-intelligence
description: Analyze competitor strategies, content, pricing, ads, and market positioning across Google Maps, Booking.com, Facebook, Instagram, YouTube, and TikTok.
---

# Competitor Intelligence

Use the `apify_scraper` tool. Select the best actor from the table below and run it with `action="start"`. Use `action="discover"` with the actor ID first if you need to see the full input schema.

## Actor Selection

| User Need | Actor ID |
|-----------|----------|
| Competitor business listings | `compass~crawler-google-places` |
| Competitor contact discovery | `poidata~google-maps-email-extractor` |
| Detailed competitor benchmarking | `compass~google-maps-extractor` |
| Competitor review analysis | `compass~Google-Maps-Reviews-Scraper` |
| Hotel competitor data | `voyager~booking-scraper` |
| Competitor hotel reviews | `voyager~booking-reviews-scraper` |
| Competitor ad strategies | `apify~facebook-ads-scraper` |
| Competitor page metrics | `apify~facebook-pages-scraper` |
| Competitor content analysis | `apify~facebook-posts-scraper` |
| Competitor follower analysis | `apify~facebook-followers-following-scraper` |
| Competitor profile metrics | `apify~instagram-profile-scraper` |
| Competitor content monitoring | `apify~instagram-post-scraper` |
| Competitor video analysis | `streamers~youtube-scraper` |
| Competitor YouTube channel | `streamers~youtube-channel-scraper` |
| TikTok competitor profiles | `clockworks~tiktok-profile-scraper` |
| TikTok competitor videos | `clockworks~tiktok-video-scraper` |
