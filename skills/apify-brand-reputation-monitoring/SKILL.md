---
name: apify-brand-reputation-monitoring
description: Track reviews, ratings, sentiment, and brand mentions across Google Maps, Booking.com, TripAdvisor, Facebook, Instagram, YouTube, and TikTok. Use when user asks to monitor brand reputation, analyze reviews, track mentions, or gather customer feedback.
---

# Brand Reputation Monitoring

Use the `apify_scraper` tool. Select the best Actor from the table below and run it with `action="start"`. Use `action="discover"` with the Actor ID first if you need to see the full input schema.

## Actor Selection

| User Need | Actor ID |
|-----------|----------|
| Google Maps reviews | `compass~Google-Maps-Reviews-Scraper` |
| Google Maps business + rating | `compass~crawler-google-places` |
| Booking.com hotel reviews | `voyager~booking-reviews-scraper` |
| TripAdvisor reviews | `maxcopell~tripadvisor-reviews` |
| Facebook page reviews | `apify~facebook-reviews-scraper` |
| Facebook comment monitoring | `apify~facebook-comments-scraper` |
| Facebook page mentions | `apify~facebook-pages-scraper` |
| Instagram comment sentiment | `apify~instagram-comment-scraper` |
| Instagram brand hashtags | `apify~instagram-hashtag-scraper` |
| Instagram tagged posts | `apify~instagram-tagged-scraper` |
| Bulk Instagram comment export | `apify~export-instagram-comments-posts` |
| YouTube comment sentiment | `streamers~youtube-comments-scraper` |
| TikTok comment sentiment | `clockworks~tiktok-comments-scraper` |
