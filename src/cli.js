const VALUE_FLAGS = {
  "--config": "config",
  "--window": "window",
  "--min-score": "minScore",
  "--limit": "limit",
  "--out": "out",
  "--interval": "interval",
  "--max-display": "maxDisplay"
};

export function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];

    if (raw === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (raw === "--help" || raw === "-h") {
      args.help = true;
      continue;
    }

    if (raw.startsWith("--")) {
      const eq = raw.indexOf("=");
      const flag = eq === -1 ? raw : raw.slice(0, eq);
      const key = VALUE_FLAGS[flag];
      if (!key) {
        throw new Error(`Unknown option: ${flag}. Run with --help for usage.`);
      }
      const value = eq === -1 ? argv[index + 1] : raw.slice(eq + 1);
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`Option ${flag} requires a value.`);
      }
      if (eq === -1) index += 1;
      args[key] = value;
      continue;
    }

    throw new Error(`Unexpected argument: ${raw}. Run with --help for usage.`);
  }

  return args;
}

export const HELP = `
Facebook fresh leads (Apify)

Usage:
  npm start                     one run using config.json
  npm run watch                 keep running every N minutes
  npm run dry-run               demo with bundled sample posts (no credits)

Options:
  --dry-run                     use sample data, never calls Apify
  --config <path>               config file (default: ./config.json)
  --window <minutes>            recency window (default: 10)
  --min-score <number>          intent threshold (default: 4)
  --limit <number>              max posts per source (default: 30)
  --out <dir>                   output directory (default: ./output)
  --interval <minutes>          watch interval (default: 10)
  --max-display <number>        leads printed to console (default: 20)
  -h, --help                    show this help

Environment:
  APIFY_TOKEN                   required for real runs (put it in .env)
`;
