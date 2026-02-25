---
name: apify-market-research
description: Analyze market conditions, geographic opportunities, pricing, consumer behavior, and product validation across Google Maps, Facebook, Instagram, Booking.com, and TripAdvisor.
---

# Market Research

Use the `apify_scraper` tool. Select the best actor from the table below and run it with `action="start"`. Use `action="discover"` with the actor ID first if you need to see the full input schema.

## Actor Selection

| User Need | Actor ID |
|-----------|----------|
| Market density / local businesses | `compass~crawler-google-places` |
| Geospatial / detailed business data | `compass~google-maps-extractor` |
| Regional interest / search trends | `apify~google-trends-scraper` |
| Pricing and demand | `apify~facebook-marketplace-scraper` |
| Event market analysis | `apify~facebook-events-scraper` |
| Consumer group insights | `apify~facebook-groups-scraper` |
| Market landscape / business pages | `apify~facebook-pages-scraper` |
| Business contact discovery | `apify~facebook-page-contact-information` |
| Niche targeting via hashtags | `apify~instagram-hashtag-scraper` |
| Hashtag market sizing | `apify~instagram-hashtag-stats` |
| Hospitality market | `voyager~booking-scraper` |
| Tourism / attraction insights | `maxcopell~tripadvisor-reviews` |
