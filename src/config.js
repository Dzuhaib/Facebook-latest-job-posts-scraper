import fs from "node:fs";
import path from "node:path";

export const DEFAULTS = {
  windowMinutes: 10,
  maxResultsPerSource: 30,
  minScore: 4,
  watchIntervalMinutes: 10,
  sources: {
    groups: [],
    pages: []
  },
  intent: {
    extra: {}
  },
  output: {
    dir: "./output",
    keepJsonl: true
  }
};

function loadDotEnv(cwd) {
  const envPath = path.join(cwd, ".env");
  if (fs.existsSync(envPath) && typeof process.loadEnvFile === "function") {
    process.loadEnvFile(envPath);
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Could not read ${filePath}: ${error.message}`);
  }
}

function toPositiveInt(value, name, { min = 1, max = 100000 } = {}) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max} (got "${value}")`);
  }
  return parsed;
}

function normalizeUrls(values, name) {
  if (!Array.isArray(values)) return [];
  const raw = values
    .map((value) => (typeof value === "string" ? value : value?.url))
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  const urls = raw.filter((value) => /^https?:\/\//i.test(value));
  if (raw.length > 0 && urls.length === 0) {
    throw new Error(
      `${name} must contain full URLs starting with http:// or https:// (got "${raw[0]}")`
    );
  }
  return [...new Set(urls)];
}

function deepMerge(base, override) {
  if (Array.isArray(base) || Array.isArray(override)) {
    return override === undefined ? base : override;
  }
  if (
    base &&
    override &&
    typeof base === "object" &&
    typeof override === "object"
  ) {
    const result = { ...base };
    for (const key of Object.keys(override)) {
      result[key] = deepMerge(base[key], override[key]);
    }
    return result;
  }
  return override === undefined ? base : override;
}

export function loadConfig({ cwd = process.cwd(), argv = {} } = {}) {
  loadDotEnv(cwd);

  const configPath = argv.config
    ? path.resolve(cwd, argv.config)
    : path.join(cwd, "config.json");

  const fileConfig = fs.existsSync(configPath) ? readJson(configPath) : {};
  const config = deepMerge(DEFAULTS, fileConfig);

  const env = process.env;
  if (env.FB_WINDOW_MINUTES) config.windowMinutes = env.FB_WINDOW_MINUTES;
  if (env.FB_MIN_SCORE) config.minScore = env.FB_MIN_SCORE;
  if (env.FB_MAX_RESULTS_PER_SOURCE) {
    config.maxResultsPerSource = env.FB_MAX_RESULTS_PER_SOURCE;
  }
  if (env.FB_OUTPUT_DIR) config.output.dir = env.FB_OUTPUT_DIR;
  if (env.FB_WATCH_INTERVAL_MINUTES) {
    config.watchIntervalMinutes = env.FB_WATCH_INTERVAL_MINUTES;
  }

  if (argv.window !== undefined) config.windowMinutes = argv.window;
  if (argv.minScore !== undefined) config.minScore = argv.minScore;
  if (argv.limit !== undefined) config.maxResultsPerSource = argv.limit;
  if (argv.out !== undefined) config.output.dir = argv.out;
  if (argv.interval !== undefined) config.watchIntervalMinutes = argv.interval;

  config.windowMinutes = toPositiveInt(config.windowMinutes, "windowMinutes", {
    min: 1,
    max: 1440
  });
  config.maxResultsPerSource = toPositiveInt(
    config.maxResultsPerSource,
    "maxResultsPerSource",
    { min: 1, max: 1000 }
  );
  config.watchIntervalMinutes = toPositiveInt(
    config.watchIntervalMinutes,
    "watchIntervalMinutes",
    { min: 1, max: 1440 }
  );

  const minScore = Number(config.minScore);
  if (!Number.isFinite(minScore) || minScore < 0 || minScore > 100) {
    throw new Error(`minScore must be a number between 0 and 100 (got "${config.minScore}")`);
  }
  config.minScore = minScore;

  config.sources = {
    groups: normalizeUrls(config.sources?.groups, "sources.groups"),
    pages: normalizeUrls(config.sources?.pages, "sources.pages")
  };

  config.intent = config.intent ?? { extra: {} };
  config.intent.extra = config.intent.extra ?? {};

  config.output = config.output ?? {};
  config.output.dir = path.resolve(cwd, config.output.dir ?? "./output");
  config.output.keepJsonl = config.output.keepJsonl !== false;

  config.cwd = cwd;
  config.configPath = configPath;

  return config;
}

export function loadToken() {
  const token = (process.env.APIFY_TOKEN ?? "").trim();
  if (!token) {
    throw new Error(
      "APIFY_TOKEN is missing. Copy .env.example to .env and paste your token from https://console.apify.com/settings/integrations"
    );
  }
  if (token.includes("replace_me")) {
    throw new Error("APIFY_TOKEN is still the placeholder value from .env.example");
  }
  return token;
}

export function assertSources(config) {
  const total = config.sources.groups.length + config.sources.pages.length;
  if (total === 0) {
    throw new Error(
      "No Facebook sources configured. Add public group or page URLs to config.json under sources.groups / sources.pages."
    );
  }
}
