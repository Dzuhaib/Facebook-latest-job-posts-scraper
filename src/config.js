import fs from "node:fs";
import path from "node:path";

export const DEFAULTS = {
  windowMinutes: 10,
  maxResultsPerSource: 30,
  minScore: 4,
  watchIntervalMinutes: 10,
  retentionHours: 0,
  sources: {
    groups: [],
    pages: [],
    disabled: [],
    limits: {},
    concurrency: 3
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

function normalizeLimits(value, fallback) {
  if (value === undefined || value === null) return { ...fallback };
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("sources.limits must be an object mapping a source URL to a number");
  }
  const limits = {};
  for (const [url, raw] of Object.entries(value)) {
    if (!/^https?:\/\//i.test(url)) {
      throw new Error(`sources.limits has an invalid URL key: "${url}"`);
    }
    const limit = toPositiveInt(raw, `sources.limits["${url}"]`, {
      min: 1,
      max: 1000
    });
    limits[url] = limit;
  }
  return limits;
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
  if (env.FB_RETENTION_HOURS) config.retentionHours = env.FB_RETENTION_HOURS;

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

  const retentionHours = Number(config.retentionHours ?? 0);
  if (!Number.isInteger(retentionHours) || retentionHours < 0 || retentionHours > 8760) {
    throw new Error(
      `retentionHours must be a whole number between 0 and 8760 (got "${config.retentionHours}")`
    );
  }
  config.retentionHours = retentionHours;

  const concurrency = Number(config.sources?.concurrency ?? 3);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 10) {
    throw new Error(`sources.concurrency must be a whole number between 1 and 10 (got "${config.sources?.concurrency}")`);
  }

  config.sources = {
    groups: normalizeUrls(config.sources?.groups, "sources.groups"),
    pages: normalizeUrls(config.sources?.pages, "sources.pages"),
    disabled: normalizeUrls(config.sources?.disabled, "sources.disabled"),
    limits: normalizeLimits(config.sources?.limits, {}),
    concurrency
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
