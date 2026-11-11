<p align="center">
  <img src="public/Facebook%20Job%20Discovery%20Dashboard%20Banner.png" alt="Facebook Job Discovery Dashboard banner" width="100%" />
</p>

<h1 align="center">Facebook + LinkedIn Fresh Leads</h1>

<p align="center">
  Find fresh public Facebook buying-intent posts and LinkedIn hiring posts that match your services.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20.12%2B-339933?logo=node.js&logoColor=white" alt="Node.js 20.12+" />
  <img src="https://img.shields.io/badge/Apify-actors-00A67E" alt="Apify actors" />
  <img src="https://img.shields.io/badge/tests-100%20passing-brightgreen" alt="100 tests passing" />
  <img src="https://img.shields.io/badge/dashboard-local-blue" alt="Local dashboard" />
</p>

---

## What it does

Fresh Leads monitors public Facebook groups/pages for buying intent **and** LinkedIn posts where people are hiring, looking for freelance help, or asking for tasks to be completed. It fetches recent posts, scores them for buying intent, removes duplicates, and gives you a local dashboard for reviewing and contacting leads.

It is built for freelancers and agencies who want to answer real requests quickly — not scrape the entire internet.

| You get | Why it matters |
| --- | --- |
| Two lead sources | Facebook buying-intent posts plus LinkedIn hiring posts in one dashboard |
| Fresh posts only | A configurable Facebook window (default 10 minutes) and LinkedIn window (default 24 hours) |
| Platform-aware scoring | Buying-intent scoring for both Facebook and LinkedIn, with a separate LinkedIn minimum score |
| Your own skills | Add video editing, design, Shopify, AI automation, or anything else |
| Local dashboard | Review, filter by platform, search, and mark leads as contacted |
| Multiple exports | JSON, CSV, Markdown, and JSONL for automation tools |
| Apify-hosted actors | No browser extensions or local scraping |

## Features

- **LinkedIn post search** — optional `harvestapi/linkedin-post-search` integration with buyer-intent query searches, date-posted filters, and buying-intent scoring.
- **Separate windows** — Facebook uses the fast `windowMinutes` window (default 10 minutes); LinkedIn posts keep their own `linkedin.windowMinutes` window (default 24 hours).
- **Recency guard** — time windows are enforced by the actors and again locally, so old posts cannot slip through.
- **Intent scoring** — Facebook posts are scored from service matches, need/hiring phrases, and intent phrases; negative and noise terms subtract points.
- **Buyer-only gate** — LinkedIn and Facebook posts must contain a service/skill plus a hiring or need signal; job listings are discarded.
- **Noise and seller filters** — rejects freelancer ads, service offers, availability pitches, learning/advice questions, and "DM me" sales posts.
- **Explainable leads** — every saved lead keeps the matched keywords and score breakdown behind "Why this lead?".
- **Re-validation** — saved leads are re-scored on startup and after every scan, so stale/no-longer-matching rows are dropped automatically.
- **Custom services and skills** — add your own keywords from the dashboard Settings or `config.json`; common word forms (design/designer, edit/editor) are matched automatically.
- **Multi-select service filter** — choose as many services as you want; results match any selected service.
- **Not relevant** — remove a lead and optionally block its post, author, or source from future scans.
- **Duplicate cleanup** — exact and near-duplicate reposts with the same author are merged into one lead; duplicates never merge across platforms.
- **Contact tracking** — mark leads as contacted; the state survives rescans.
- **Demo mode** — load sample Facebook leads without spending Apify credits.
- **Demo-only cleanup** — remove sample leads without touching real leads.
- **Platform filter** — switch between Facebook, LinkedIn posts, or both.
- **Source issue reporting** — see which group, page, or LinkedIn search could not be read and why.
- **Per-source controls** — disable individual Facebook sources and set per-source result limits.
- **Notifications** — optional Telegram, Discord, or generic webhook alerts when new leads arrive.
- **Retention** — optionally prune leads older than a configurable number of hours.
- **Background scans** — the dashboard polls scan status, so you can leave it open.
- **Cost estimate** — see a worst-case Apify cost before a real run.
- **CLI and dashboard** — run one scan, watch on an interval, or use the local UI.

## How it works

```text
Public Facebook groups / pages          LinkedIn post queries
            |                                  |
            v                                  v
   Facebook Apify actors              LinkedIn Apify actor
            |                                  |
            +----------------+-----------------+
                             |
                             v
              Recency check + normalization
                             |
                             v
      Facebook intent scoring | LinkedIn intent scoring
                             |
                             v
              Deduplication + local lead store
                             |
                             v
       Dashboard / JSON / CSV / Markdown / JSONL
```

A row must pass three gates before it becomes a lead:

1. **Recency** — inside the platform window (`windowMinutes` for Facebook, `linkedin.windowMinutes` for posts).
2. **Relevance** — Facebook needs a service/skill plus a buying signal; LinkedIn needs a service/skill plus a hiring or need signal with a score at or above `linkedin.minScore`.
3. **Novelty** — its ID has not already been seen and it is not a duplicate of an existing lead.

## Quick start

### 1. Requirements

- [Node.js](https://nodejs.org/) 20.12 or newer
- An [Apify account](https://console.apify.com/sign-up) and API token

### 2. Clone and install

```powershell
git clone https://github.com/Dzuhaib/Facebook-latest-job-posts-scraper.git
cd Facebook-latest-job-posts-scraper
npm install
```

### 3. Create your local files

```powershell
Copy-Item .env.example .env
Copy-Item config.example.json config.json
```

Open `.env` and add your Apify token:

```env
APIFY_TOKEN=apify_api_your_token_here
```

Open `config.json` and add the **public** Facebook groups and/or pages you want to monitor:

```json
{
  "sources": {
    "groups": [
      "https://www.facebook.com/groups/your-public-group"
    ],
    "pages": [
      "https://www.facebook.com/your-page"
    ]
  },
  "linkedin": {
    "enabled": true,
    "keywords": ["hiring web developer", "need seo help", "looking for video editor"],
    "datePosted": "past24Hours"
  }
}
```

Leave `linkedin.enabled` as `false` if you only want Facebook. When enabled, each query runs a separate Apify LinkedIn post search.

> Private groups, personal profiles, and login-only content cannot be scraped. Open the URL in a private browser window; if Facebook asks you to join, the group is private.

### 4. Try it without spending credits

```powershell
npm run dry-run
```

This uses bundled sample posts and never calls Apify.

### 5. Run a real scan

```powershell
npm start
```

Or start the dashboard:

```powershell
npm run ui
```

Then open [http://127.0.0.1:3000](http://127.0.0.1:3000).

## Using the dashboard

The dashboard is designed for fast triage:

- **Stats bar** — total leads, not contacted, contacted, and last scan time.
- **Scan now** — starts a real Apify scan. A spinner and status badge show progress.
- **Filters sidebar** — platform (Facebook / LinkedIn posts), contact status, recency, search, multi-select services, sort order, and page size.
- **Leads table** — author, source, services, posted time, engagement, and contact action.
- **Platform badges** — each row is marked Facebook or LinkedIn; LinkedIn rows show likes, comments, and shares.
- **Mark** — flags a lead as contacted. Click again to undo.
- **Why this lead?** — expands the matched service, need/hiring, and intent keywords together with the score breakdown.
- **Not relevant** — deletes the lead and, if you choose, blocks the post, author, or source from future scans.
- **Load demo leads** — loads sample leads for testing the UI.
- **Remove demo** — deletes only demo leads, never real ones.
- **Remove duplicates** — appears when reposts are found; keeps one copy and preserves contact state.
- **Clear filters** — appears when a filter is active.
- **Fetch last** — sets the scan window in minutes or hours and saves it automatically.
- **Settings** — edits the token, Facebook sources/limits, LinkedIn post queries/date filter/window, retention, concurrency, and services/skills.

### Service filter

The service filter is multi-select. Open it, tick any number of services or skills, and the table shows leads matching **any** of them. The option list includes:

- Built-in services: `automation`, `web`, and `seo`
- Your saved custom skills
- Services detected in the current lead data

Custom skills appear even when no lead matches them yet, so you can add a new service before your first relevant post arrives.

### Duplicate handling

A duplicate is the same author plus the same (or very similar) normalized post text. New scans skip reposts in the same run, and the lead store merges matching posts from later scans instead of adding another row. Similar-text detection uses token overlap with a conservative threshold and only compares posts by the same author. The kept lead preserves its contact state and merges services, score, engagement, and first/last seen timestamps. Very short posts are left alone to avoid merging unrelated generic requests.

If older data already contains duplicates, the sidebar shows **Remove duplicates (N)**. Removing them keeps one lead per group and preserves any contacted state from the discarded copies.

### Keep the list clean

- **Re-validation** runs at startup and after each scan. Saved leads are scored again with the current services, skills, and gate; rows that no longer qualify are removed.
- **Not relevant** asks whether to block the post, the author, or the whole source. Blocked authors and sources are skipped on every future scan and persist in `data/leads.json`.
- **Retention** (`retentionHours`, default `0` = keep forever) prunes leads older than the configured age.

## Configuration

`config.json` is created from `config.example.json` and is intentionally ignored by Git because it contains your sources and skills.

| Key | Default | What it does |
| --- | --- | --- |
| `windowMinutes` | `10` | How far back to fetch posts, in minutes |
| `maxResultsPerSource` | `30` | Maximum posts requested from each source |
| `minScore` | `4` | Minimum intent score for a lead |
| `watchIntervalMinutes` | `10` | Interval for `npm run watch` |
| `retentionHours` | `0` | Delete leads older than this many hours (`0` keeps them) |
| `sources.groups` | `[]` | Public Facebook group URLs |
| `sources.pages` | `[]` | Public Facebook page URLs |
| `sources.disabled` | `[]` | Source URLs to skip without deleting them |
| `sources.limits` | `{}` | Per-source result limit, e.g. `{"https://...": 50}` |
| `sources.concurrency` | `3` | How many Facebook sources are scraped in parallel (1-10) |
| `linkedin.enabled` | `false` | Enable LinkedIn post search |
| `linkedin.actorId` | `"harvestapi/linkedin-post-search"` | LinkedIn post search actor |
| `linkedin.keywords` | built-in buyer-intent query list | One Apify post search per query |
| `linkedin.datePosted` | `"past24Hours"` | `anyTime`, `past24Hours`, `pastWeek`, or `pastMonth` |
| `linkedin.windowMinutes` | `1440` | Keep LinkedIn posts within this many minutes |
| `linkedin.maxResultsPerKeyword` | `30` | Max posts requested per query |
| `linkedin.minScore` | `4` | Minimum buying-intent score for LinkedIn posts |
| `linkedin.concurrency` | `2` | How many LinkedIn searches run in parallel (1-5) |
| `linkedin.usdPer1000` | `2` | Price used for the cost estimate |
| `intent.extra.services` | `{}` | Extra keywords per built-in service |
| `intent.extra.skills` | `[]` | Your own services/skills |
| `intent.extra.need` | `[]` | Extra buying-signal phrases |
| `intent.extra.negative` | `[]` | Phrases that should suppress a lead |
| `output.dir` | `"./output"` | CLI report directory |

### CLI options

```powershell
npm start -- --window=10 --min-score=4 --limit=30
npm start -- --out=./output --config=./config.json
```

| Flag | Meaning |
| --- | --- |
| `--window` | Recency window in minutes |
| `--min-score` | Intent threshold |
| `--limit` | Max posts per source |
| `--out` | Output directory |
| `--config` | Alternate config file |

### Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `APIFY_TOKEN` | required for real scans | Apify API token |
| `FB_WINDOW_MINUTES` | `10` | Override scan window |
| `FB_MIN_SCORE` | `4` | Override intent threshold |
| `FB_MAX_RESULTS_PER_SOURCE` | `30` | Override per-source limit |
| `FB_OUTPUT_DIR` | `./output` | Override output directory |
| `FB_WATCH_INTERVAL_MINUTES` | `10` | Override watch interval |
| `FB_RETENTION_HOURS` | `0` | Override retention |
| `TELEGRAM_BOT_TOKEN` | unset | Telegram bot token for new-lead alerts |
| `TELEGRAM_CHAT_ID` | unset | Telegram chat ID for new-lead alerts |
| `DISCORD_WEBHOOK_URL` | unset | Discord webhook for new-lead alerts |
| `NOTIFY_WEBHOOK_URL` | unset | Generic JSON webhook for new-lead alerts |
| `UI_HOST` | `127.0.0.1` | Dashboard host |
| `UI_PORT` | `3000` | Dashboard port |
| `UI_ALLOW_ANY_HOST` | `0` | Disable the loopback Host-header guard (only if you know why) |

Set any combination of the notification variables; each configured channel receives the new leads after a real scan. Alerts are skipped for demo scans and when there are no new leads.

## How intent scoring works

Every post is normalized and scored. Points come from:

| Signal | Points |
| --- | --- |
| Service keyword match | +2 per match, capped |
| Custom skill match | +2 per match, capped |
| Need phrase (`need`, `looking for`, `budget`, ...) | +2 per match, capped |
| Hiring phrase (`hiring`, `paid gig`, `job opening`, ...) | +2 per match, capped |
| Intent phrase (`need a website`, `who can build`, ...) | +3 per match, capped |
| Negative phrase (self-promotion, job seekers, ...) | subtracts points |
| Noise phrase (tutorials, tool questions, ...) | subtracts points |
| Seller / self-promotion pattern | rejects the post |

A post becomes a lead only when it has:

1. At least one service or skill match
2. At least one need, hiring, or intent trigger
3. A score greater than or equal to `minScore`
4. No seller/self-promotion pattern

The seller gate is intentionally strict. Posts such as "I am a professional website developer", "I build websites", "We offer SEO services", "Why choose me?", "DM me for pricing", and "Contact me via WhatsApp" are rejected even if they mention services and buying words. This keeps the list focused on people hiring or asking for help, not freelancers advertising themselves.

**Min score** is therefore a strictness dial:

- **Lower** (`3`) → more leads, more noise
- **Default** (`4`) → balanced
- **Higher** (`5` or `6`) → fewer, stronger leads

Add custom keywords without touching code:

```json
{
  "intent": {
    "extra": {
      "services": {
        "automation": ["gohighlevel", "airtable automation"],
        "web": ["webflow", "framer"],
        "seo": ["semrush", "local ranking"]
      },
      "skills": ["video editing", "graphic design", "lead generation"],
      "negative": ["student project", "unpaid"]
    }
  }
}
```

## Output files

Every CLI run writes to `./output`:

| File | Purpose |
| --- | --- |
| `leads-<timestamp>.json` / `latest.json` | Full payload with scores and matched keywords |
| `leads-<timestamp>.csv` / `latest.csv` | Spreadsheet-ready export |
| `leads-<timestamp>.md` / `latest.md` | Human-readable report |
| `leads.jsonl` | Append-only stream for Make, Zapier, n8n, or custom scripts |

The dashboard stores its own data in `data/leads.json`, separate from CLI reports.

## Cost

Apify charges per scraped result. Approximate prices:

- **Facebook groups:** about $2.60 per 1,000 results
- **Facebook pages:** about $7.00 per 1,000 results (including the date filter)
- **LinkedIn posts:** `harvestapi/linkedin-post-search` is priced separately (about $2.00 per 1,000 results at the time of writing). Check the actor page for the current price and set `linkedin.usdPer1000` to match.

The tool prints a worst-case estimate before each real run, including every LinkedIn query search. Because the actors only return results inside your windows, real costs are usually lower. `npm run dry-run` is free and never calls LinkedIn.

## Scheduling

```powershell
npm run watch
```

This runs every `watchIntervalMinutes` until you press `Ctrl+C`. For unattended use, run it with Task Scheduler, `pm2`, or NSSM.

You can also schedule the Apify actors directly, but scoring, deduplication, and lead storage run locally in this project.

## Troubleshooting

### Scan returns zero leads

- Check the **Source issues** panel or terminal log for `source(s) returned no results` or `Empty or private data for provided input`.
- Open the group or page URL in a private browser window. If Facebook asks you to join or log in, it is private and cannot be scraped.
- A wider window includes older posts; it does not unlock private groups.
- Add more active public groups. One group may only post a few times per hour.
- For LinkedIn, check that `linkedin.enabled` is true, keywords are set, and the actor run status in the terminal log is `SUCCEEDED`.

### LinkedIn returns posts but no leads

- Lower `linkedin.minScore`, or add buyer-intent queries such as `hiring web developer` to `linkedin.keywords`.
- Use `datePosted: "pastWeek"` if `past24Hours` is too narrow.
- Job listings are intentionally discarded, and posts without a service plus hiring/need signal are filtered out; check **Why this lead?** for matched service, need, and hiring terms.

### Too many irrelevant leads

- Raise `minScore` to `5` or `6`.
- Add negative keywords such as `student project`, `unpaid`, or `open to work`.

### Missing leads

- Lower `minScore` to `3`.
- Add synonyms for your services under `intent.extra.services` or `intent.extra.skills`.
- Make sure the source is public and active.

### Dashboard will not start

- Confirm Node.js is 20.12 or newer: `node --version`
- Confirm dependencies are installed: `npm install`
- Change the port if it is busy: `$env:UI_PORT=3001; npm run ui`

## Project structure

```text
.
├── public/                  Dashboard HTML, CSS, JS, and banner
├── server/                  Local dashboard API and static server
├── src/
│   ├── index.js             One-shot CLI
│   ├── watch.js             Interval loop
│   ├── apify.js             Apify actor calls and cost estimate
│   ├── normalize.js         Unified Facebook and LinkedIn post shapes
│   ├── intent.js            Buying-intent scoring
│   ├── │   ├── filter.js            Platform-aware recency, scoring, and dedupe pipeline
│   ├── duplicates.js        Repost fingerprinting and duplicate cleanup
│   ├── state.js             Seen-post store
│   ├── notify.js            Telegram, Discord, and webhook alerts
│   ├── report.js            JSON, CSV, Markdown output
│   └── fixtures/            Sample posts for dry runs
├── test/                    Unit and API tests
├── config.example.json      Safe template for local config
├── .env.example             Safe template for environment variables
└── README.md
```

## Privacy and limitations

- Only public Facebook groups/pages and public LinkedIn posts are supported. Personal profiles, private groups, and login-only content are not.
- The dashboard binds to `127.0.0.1` by default and rejects non-loopback `Host` headers. There is no authentication; do not expose it to the internet without adding auth.
- `.env`, `config.json`, `data/`, `output/`, and `.state/` are ignored by Git because they can contain secrets, personal data, or runtime state.
- The tool collects publicly visible posts for outreach research. Follow Facebook's, LinkedIn's, and Apify's terms and applicable privacy laws when storing or contacting people.

## Tests

```powershell
npm test
```

The suite has 100 tests covering configuration, Apify input/costs, Facebook and LinkedIn post normalization, buying-intent scoring, platform-aware filtering, duplicate detection and removal, lead storage and re-validation, blocking, settings, demo removal, notifications, and dashboard API behavior.

## Contributing

Issues and pull requests are welcome. Please keep changes focused, add or update tests, and run `npm test` before opening a PR.

## Acknowledgements

Built with [Apify](https://apify.com/) and these actors:

- `apify/facebook-groups-scraper`
- `apify/facebook-posts-scraper`
- `harvestapi/linkedin-post-search`

---

<p align="center">
  Built for freelancers who would rather answer a real request than scroll all day.
</p>
