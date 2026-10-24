<p align="center">
  <img src="public/Facebook%20Job%20Discovery%20Dashboard%20Banner.png" alt="Facebook Job Discovery Dashboard banner" width="100%" />
</p>

<h1 align="center">Facebook Fresh Leads</h1>

<p align="center">
  Find public Facebook posts where people are hiring or asking for your services — while the post is still fresh.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20.12%2B-339933?logo=node.js&logoColor=white" alt="Node.js 20.12+" />
  <img src="https://img.shields.io/badge/Apify-official%20actors-00A67E" alt="Apify official actors" />
  <img src="https://img.shields.io/badge/tests-61%20passing-brightgreen" alt="61 tests passing" />
  <img src="https://img.shields.io/badge/dashboard-local-blue" alt="Local dashboard" />
</p>

---

## What it does

Facebook Fresh Leads monitors public Facebook groups and pages for buying intent. It fetches recent posts, scores them against your services and skills, removes duplicates, and gives you a local dashboard for reviewing and contacting leads.

It is built for freelancers and agencies who want to answer real requests quickly — not scrape the entire internet.

| You get | Why it matters |
| --- | --- |
| Fresh posts only | A configurable window (default 10 minutes) keeps the list actionable |
| Intent scoring | Service keywords plus buying signals, not just keyword matches |
| Your own skills | Add video editing, design, Shopify, AI automation, or anything else |
| Local dashboard | Review, search, filter, and mark leads as contacted |
| Multiple exports | JSON, CSV, Markdown, and JSONL for automation tools |
| Official Apify actors | No unofficial scrapers or browser extensions |

## Features

- **Recency guard** — the time window is enforced by Apify and again locally, so old posts cannot slip through.
- **Intent scoring** — every post is scored from service matches, need/hiring phrases, and intent phrases; negative and noise terms subtract points.
- **Custom services and skills** — add your own keywords from the dashboard Settings or `config.json`.
- **Multi-select service filter** — choose as many services as you want; results match any selected service.
- **Contact tracking** — mark leads as contacted; the state survives rescans.
- **Demo mode** — load sample leads without spending Apify credits.
- **Demo-only cleanup** — remove sample leads without touching real Facebook leads.
- **Source issue reporting** — see which public group or page could not be read and why.
- **Background scans** — the dashboard polls scan status, so you can leave it open.
- **Cost estimate** — see a worst-case Apify cost before a real run.
- **CLI and dashboard** — run one scan, watch on an interval, or use the local UI.

## How it works

```text
Public Facebook groups / pages
            |
            v
   Official Apify actors
            |
            v
 Recency check + normalization
            |
            v
 Intent scoring + service detection
            |
            v
 Deduplication + local lead store
            |
            v
 Dashboard / JSON / CSV / Markdown / JSONL
```

A post must pass three gates before it becomes a lead:

1. **Recency** — published inside your scan window.
2. **Intent** — mentions a service or custom skill **and** contains a buying signal, with a score at or above `minScore`.
3. **Novelty** — its post ID has not already been seen.

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
  }
}
```

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
- **Filters sidebar** — contact status, recency, search, multi-select services, sort order, and page size.
- **Leads table** — post text, author, source, services, posted time, engagement, and contact action.
- **Mark** — flags a lead as contacted. Click again to undo.
- **Load demo leads** — loads sample leads for testing the UI.
- **Remove demo** — deletes only demo leads, never real ones.
- **Clear filters** — appears when a filter is active.
- **Fetch last** — sets the scan window in minutes or hours and saves it automatically.
- **Settings** — edits the token, score threshold, per-source limit, sources, and services/skills.

### Service filter

The service filter is multi-select. Open it, tick any number of services or skills, and the table shows leads matching **any** of them. The option list includes:

- Built-in services: `automation`, `web`, and `seo`
- Your saved custom skills
- Services detected in the current lead data

Custom skills appear even when no lead matches them yet, so you can add a new service before your first relevant post arrives.

## Configuration

`config.json` is created from `config.example.json` and is intentionally ignored by Git because it contains your sources and skills.

| Key | Default | What it does |
| --- | --- | --- |
| `windowMinutes` | `10` | How far back to fetch posts, in minutes |
| `maxResultsPerSource` | `30` | Maximum posts requested from each source |
| `minScore` | `4` | Minimum intent score for a lead |
| `watchIntervalMinutes` | `10` | Interval for `npm run watch` |
| `sources.groups` | `[]` | Public Facebook group URLs |
| `sources.pages` | `[]` | Public Facebook page URLs |
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
| `UI_HOST` | `127.0.0.1` | Dashboard host |
| `UI_PORT` | `3000` | Dashboard port |

## How intent scoring works

Every post is normalized and scored. Points come from:

| Signal | Points |
| --- | --- |
| Service keyword match | +2 per match, capped |
| Custom skill match | +2 per match, capped |
| Need phrase (`need`, `looking for`, `budget`, ...) | +2 per match, capped |
| Hiring phrase (`hiring`, `paid gig`, `freelancer`, ...) | +2 per match, capped |
| Intent phrase (`need a website`, `who can build`, ...) | +3 per match, capped |
| Negative phrase (self-promotion, job seekers, ...) | subtracts points |
| Noise phrase (tutorials, tool questions, ...) | subtracts points |

A post becomes a lead only when it has:

1. At least one service or skill match
2. At least one need, hiring, or intent trigger
3. A score greater than or equal to `minScore`

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

Apify charges per scraped post. Approximate prices:

- **Groups:** about $2.60 per 1,000 posts
- **Pages:** about $5.00 per 1,000 posts

The tool prints a worst-case estimate before each real run. Because the actor only returns posts inside your window, real costs are usually much lower. `npm run dry-run` is free.

## Scheduling

```powershell
npm run watch
```

This runs every `watchIntervalMinutes` until you press `Ctrl+C`. For unattended use, run it with Task Scheduler, `pm2`, or NSSM.

You can also schedule the Apify actors directly, but scoring, deduplication, and lead storage run locally in this project.

## Troubleshooting

### Scan returns zero leads

- Check the **Source issues** panel or terminal log for `source(s) returned no posts` or `Empty or private data for provided input`.
- Open the group or page URL in a private browser window. If Facebook asks you to join or log in, it is private and cannot be scraped.
- A wider window includes older posts; it does not unlock private groups.
- Add more active public groups. One group may only post a few times per hour.

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
│   ├── normalize.js         Unified post shape
│   ├── intent.js            Keyword scoring
│   ├── filter.js            Recency, intent, and dedupe pipeline
│   ├── state.js             Seen-post store
│   ├── report.js            JSON, CSV, Markdown output
│   └── fixtures/            Sample posts for dry runs
├── test/                    Unit and API tests
├── config.example.json      Safe template for local config
├── .env.example             Safe template for environment variables
└── README.md
```

## Privacy and limitations

- Only public groups and pages are supported. Personal profiles and private groups are not.
- The dashboard binds to `127.0.0.1` by default. There is no authentication; do not expose it to the internet without adding auth.
- `.env`, `config.json`, `data/`, `output/`, and `.state/` are ignored by Git because they can contain secrets, personal data, or runtime state.
- The tool collects publicly visible posts for outreach research. Follow Facebook's terms and applicable privacy laws when storing or contacting people.

## Tests

```powershell
npm test
```

The test suite covers configuration, Apify input, normalization, intent scoring, deduplication, lead storage, settings, demo removal, and dashboard API behavior.

## Contributing

Issues and pull requests are welcome. Please keep changes focused, add or update tests, and run `npm test` before opening a PR.

## Acknowledgements

Built with [Apify](https://apify.com/) and the official Facebook scrapers:

- `apify/facebook-groups-scraper`
- `apify/facebook-posts-scraper`

---

<p align="center">
  Built for freelancers who would rather answer a real request than scroll all day.
</p>
