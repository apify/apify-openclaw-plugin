---
name: apify-ecommerce
description: >
  Scrape product data, prices, reviews, and seller information from Amazon, Walmart,
  IKEA, eBay, and 50+ other marketplaces using Apify. Use the ecommerce tool for
  price monitoring, competitor product analysis, review sentiment, and seller discovery.
---

# Apify Ecommerce Skill

## When to use ecommerce

- "Monitor prices for [product] on Amazon"
- "What are customers saying about [product]? Analyze reviews"
- "Find all sellers for [product] and compare prices"
- "Scrape product data from [e-commerce URL]"
- "Check if competitors are violating MAP pricing"
- "Research the [product category] market on Amazon"

## Actor

All three sources use a single actor: `apify/e-commerce-scraping-tool`

## Available sources

| Source | Best for | Input needed |
|--------|---------|-------------|
| `products` | Product details, pricing, availability, images | `urls` (product/category pages) |
| `reviews` | Customer reviews and ratings | `urls` (product/review pages) |
| `sellers` | Find who sells a product and at what price | `queries` (search terms) |

## Two-phase async pattern

```json
// Step 1: start
{
  "action": "start",
  "requests": [
    {
      "source": "products",
      "urls": [
        "https://www.amazon.com/dp/B08N5WRWNW",
        "https://www.walmart.com/ip/example/123456"
      ],
      "country": "US",
      "maxResults": 1
    },
    {
      "source": "sellers",
      "queries": ["Nike Air Max 90 size 10"],
      "country": "US",
      "maxResults": 20
    }
  ]
}

// Step 2: collect
{ "action": "collect", "runs": [...] }
```

## Key parameters

- **urls**: Direct product/category/review page URLs. Works for Amazon, Walmart, IKEA, eBay, Allegro, Kaufland, etc.
- **queries** (sellers only): Product search terms → discovers sellers via Google Shopping.
- **country**: Regional site selection. Use `"US"` for amazon.com, `"DE"` for amazon.de, etc.
- **maxResults**: Max products/reviews/sellers (up to 200).

## Supported marketplaces (selection)

Amazon (20+ regional: US, UK, DE, FR, JP, CA, IT, ES, …), Walmart, Costco, Home Depot, Best Buy, Newegg, eBay, IKEA (40+ regional), Allegro, Alza, Kaufland, Cdiscount, Fnac, and more.

## Common workflows

**Price monitoring**: Collect product URLs → run `products` daily → compare prices over time.

**Review sentiment**: Run `reviews` for a product → summarize common themes in positive/negative feedback.

**MAP violation detection**: Run `sellers` for your branded products → find sellers below minimum advertised price.

**Competitor product catalog**: Scrape competitor product pages for titles, descriptions, images, and pricing.

## Interpreting results

- `price` / `currentPrice` — current sale price
- `originalPrice` — before discount price
- `inStock` — availability boolean
- `rating` — average star rating
- `reviewsCount` — total reviews
- `seller` / `store` — marketplace or seller name
