---
name: apify-ecommerce
description: Scrape e-commerce data for pricing intelligence, customer reviews, and seller discovery across Amazon, Walmart, eBay, IKEA, and 50+ marketplaces. Use when user asks to monitor prices, track competitors, analyze reviews, research products, or find sellers.
---

# E-commerce

Use the `apify_scraper` tool with actor `apify~e-commerce-scraping-tool`. Use `action="discover"` with the actor ID first to see the full input schema.

## Actor

| Use Case | Actor ID |
|----------|----------|
| Products, pricing, reviews, sellers | `apify~e-commerce-scraping-tool` |

## Key Input Fields

- `workflow`: `"products"` · `"reviews"` · `"sellers"`
- `query`: search keyword or product URL
- `maxItems`: number of results

Supports 50+ marketplaces including Amazon, Walmart, eBay, IKEA, and more.
