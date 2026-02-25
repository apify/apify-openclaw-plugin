---
name: apify-competitor-intelligence
description: Analyze competitor strategies, content, pricing, ads, and market positioning across Google Maps, Booking.com, Facebook, Instagram, YouTube, and TikTok.
version: 1.0.1
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

# Competitor Intelligence

Analyze competitors using Apify Actors to extract data from multiple platforms.

## Prerequisites

- `APIFY_TOKEN` configured in OpenClaw settings
- Node.js 20.6+
- `mcpc` CLI (auto-installed via skill metadata)

## Input Sanitization Rules

Before substituting any value into a bash command:
- **ACTOR_ID**: Must be either a technical name (`owner/actor-name` — alphanumeric, hyphens, dots, one slash) or a raw ID (exactly 17 alphanumeric characters, e.g., `oeiQgfg5fsmIJB7Cn`). Reject values containing shell metacharacters (`` ; | & $ ` ( ) { } < > ! \n ``).
- **SEARCH_KEYWORDS**: Plain text words only. Reject shell metacharacters.
- **JSON_INPUT**: Must be valid JSON. Must not contain single quotes (use escaped double quotes). Validate structure before use.
- **Output filenames**: Must match `YYYY-MM-DD_descriptive-name.{csv,json}`. No path separators (`/`, `..`), no spaces, no metacharacters.

## Workflow

Copy this checklist and track progress:

```
Task Progress:
- [ ] Step 1: Identify competitor analysis type (select Actor)
- [ ] Step 2: Fetch Actor schema via mcpc
- [ ] Step 3: Ask user preferences (format, filename)
- [ ] Step 4: Run the analysis script
- [ ] Step 5: Summarize findings
```

### Step 1: Identify Competitor Analysis Type

Select the appropriate Actor based on analysis needs:

| User Need | Actor ID | Best For |
|-----------|----------|----------|
| Competitor business data | `compass/crawler-google-places` | Location analysis |
| Competitor contact discovery | `poidata/google-maps-email-extractor` | Email extraction |
| Feature benchmarking | `compass/google-maps-extractor` | Detailed business data |
| Competitor review analysis | `compass/Google-Maps-Reviews-Scraper` | Review comparison |
| Hotel competitor data | `voyager/booking-scraper` | Hotel benchmarking |
| Hotel review comparison | `voyager/booking-reviews-scraper` | Review analysis |
| Competitor ad strategies | `apify/facebook-ads-scraper` | Ad creative analysis |
| Competitor page metrics | `apify/facebook-pages-scraper` | Page performance |
| Competitor content analysis | `apify/facebook-posts-scraper` | Post strategies |
| Competitor reels performance | `apify/facebook-reels-scraper` | Reels analysis |
| Competitor audience analysis | `apify/facebook-comments-scraper` | Comment sentiment |
| Competitor event monitoring | `apify/facebook-events-scraper` | Event tracking |
| Competitor audience overlap | `apify/facebook-followers-following-scraper` | Follower analysis |
| Competitor review benchmarking | `apify/facebook-reviews-scraper` | Review comparison |
| Competitor ad monitoring | `apify/facebook-search-scraper` | Ad discovery |
| Competitor profile metrics | `apify/instagram-profile-scraper` | Profile analysis |
| Competitor content monitoring | `apify/instagram-post-scraper` | Post tracking |
| Competitor engagement analysis | `apify/instagram-comment-scraper` | Comment analysis |
| Competitor reel performance | `apify/instagram-reel-scraper` | Reel metrics |
| Competitor growth tracking | `apify/instagram-followers-count-scraper` | Follower tracking |
| Comprehensive competitor data | `apify/instagram-scraper` | Full analysis |
| API-based competitor analysis | `apify/instagram-api-scraper` | API access |
| Competitor video analysis | `streamers/youtube-scraper` | Video metrics |
| Competitor sentiment analysis | `streamers/youtube-comments-scraper` | Comment sentiment |
| Competitor channel metrics | `streamers/youtube-channel-scraper` | Channel analysis |
| TikTok competitor analysis | `clockworks/tiktok-scraper` | TikTok data |
| Competitor video strategies | `clockworks/tiktok-video-scraper` | Video analysis |
| Competitor TikTok profiles | `clockworks/tiktok-profile-scraper` | Profile data |

### Step 2: Fetch Actor Schema

Fetch the Actor's input schema and details dynamically using mcpc:

```bash
mcpc --json mcp.apify.com --header "Authorization: Bearer $APIFY_TOKEN" tools-call fetch-actor-details actor:="ACTOR_ID" | jq -r ".content"
```

Replace `ACTOR_ID` with the selected Actor (e.g., `compass/crawler-google-places`).

This returns:
- Actor description and README
- Required and optional input parameters
- Output fields (if available)

### Step 3: Ask User Preferences

Before running, ask:
1. **Output format**:
   - **Quick answer** - Display top few results in chat (no file saved)
   - **CSV** - Full export with all fields
   - **JSON** - Full export in JSON format
2. **Number of results**: Based on character of use case

### Step 4: Run the Script

**Quick answer (display in chat, no file):**
```bash
node {baseDir}/reference/scripts/run_actor.js \
  --actor 'ACTOR_ID' \
  --input 'JSON_INPUT'
```

**CSV:**
```bash
node {baseDir}/reference/scripts/run_actor.js \
  --actor 'ACTOR_ID' \
  --input 'JSON_INPUT' \
  --output 'YYYY-MM-DD_OUTPUT_FILE.csv' \
  --format csv
```

**JSON:**
```bash
node {baseDir}/reference/scripts/run_actor.js \
  --actor 'ACTOR_ID' \
  --input 'JSON_INPUT' \
  --output 'YYYY-MM-DD_OUTPUT_FILE.json' \
  --format json
```

### Step 5: Summarize Findings

After completion, report:
- Number of competitors analyzed
- File location and name
- Key competitive insights
- Suggested next steps (deeper analysis, benchmarking)


## Security & Data Privacy

This skill instructs the agent to select an Apify Actor, fetch its schema (via mcpc), and run scrapers. The included script communicates only with api.apify.com and writes outputs to files under the current working directory; it does not access unrelated system files or other environment variables.

Apify Actors only scrape publicly available data and do not collect private or personally identifiable information beyond what is openly accessible on the target platforms. For additional security assurance, you can check an Actor's permission level by querying `https://api.apify.com/v2/acts/:actorId` — an Actor with `LIMITED_PERMISSIONS` operates in a restricted sandbox, while `FULL_PERMISSIONS` indicates broader system access. For full details, see [Apify's General Terms and Conditions](https://docs.apify.com/legal/general-terms-and-conditions).

## Error Handling

`APIFY_TOKEN not found` - Ask user to configure `APIFY_TOKEN` in OpenClaw settings
`mcpc not found` - Run `npm install -g @apify/mcpc`
`Actor not found` - Check Actor ID spelling
`Run FAILED` - Ask user to check Apify console link in error output
`Timeout` - Reduce input size or increase `--timeout`
