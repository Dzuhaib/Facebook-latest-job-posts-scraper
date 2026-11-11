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
  linkedin: {
    enabled: false,
    actorId: "harvestapi/linkedin-post-search",
    keywords: [
      "hiring web developer",
      "looking for web developer",
      "need website developer",
      "hiring freelance developer",
      "looking for wordpress developer",
      "need seo help",
      "looking for video editor",
      "need graphic designer",
      "hiring copywriter"
    ],
    datePosted: "past24Hours",
    windowMinutes: 1440,
    maxResultsPerKeyword: 30,
    minScore: 4,
    concurrency: 2,
    usdPer1000: 2
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

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
  }
  return Boolean(value);
}

function normalizePhraseList(value, name, { max = 50, maxLength = 80 } = {}) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) && typeof value !== "string") {
    throw new Error(`${name} must be a list of keywords`);
  }
  const items = Array.isArray(value)
    ? value
    : String(value).split(/\r?\n|,/);
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const clean = String(item ?? "").replace(/\s+/g, " ").trim();
    if (!clean) continue;
    if (clean.length > maxLength) {
      throw new Error(`${name}: "${clean.slice(0, 30)}..." is too long (max ${maxLength} characters)`);
    }
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= max) break;
  }
  return out;
}

const LEGACY_LINKEDIN_ACTOR = "curious_coder/linkedin-jobs-scraper";
const LINKEDIN_INTENT_RE =
  /\b(hiring|hire|looking for|need|needs|seeking|want|wanted|required|require|freelance|task|project|help|build|fix)\b/i;

function toLinkedInPostQuery(value) {
  const query = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!query || LINKEDIN_INTENT_RE.test(query)) return query;
  return `need ${query}`;
}

function normalizeLinkedIn(value) {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const legacy =
    raw.actorId === LEGACY_LINKEDIN_ACTOR ||
    raw.locations !== undefined ||
    raw.scrapeCompany !== undefined ||
    raw.under10Applicants !== undefined;
  const merged = {
    ...DEFAULTS.linkedin,
    ...raw,
    ...(legacy
      ? {
          actorId: DEFAULTS.linkedin.actorId,
          usdPer1000: DEFAULTS.linkedin.usdPer1000
        }
      : {})
  };

  const rawKeywords = normalizePhraseList(merged.keywords, "linkedin.keywords", {
    max: 30,
    maxLength: 120
  });
  const keywords = legacy
    ? normalizePhraseList(rawKeywords.map(toLinkedInPostQuery), "linkedin.keywords", {
        max: 30,
        maxLength: 120
      })
    : rawKeywords;

  const datePosted = String(merged.datePosted ?? "past24Hours").trim();
  if (!["anyTime", "past24Hours", "pastWeek", "pastMonth"].includes(datePosted)) {
    throw new Error(
      `linkedin.datePosted must be anyTime, past24Hours, pastWeek, or pastMonth (got "${merged.datePosted}")`
    );
  }

  const actorId = String(merged.actorId ?? "").trim();
  if (!/^[\w.~-]+(?:\/[\w.~-]+)?$/.test(actorId)) {
    throw new Error(`linkedin.actorId is invalid (got "${merged.actorId}")`);
  }

  const usdPer1000 = Number(merged.usdPer1000);
  if (!Number.isFinite(usdPer1000) || usdPer1000 < 0 || usdPer1000 > 1000) {
    throw new Error(
      `linkedin.usdPer1000 must be a number between 0 and 1000 (got "${merged.usdPer1000}")`
    );
  }

  const enabled = parseBoolean(merged.enabled, false);
  if (enabled && keywords.length === 0) {
    throw new Error("linkedin.keywords must contain at least one search query when LinkedIn is enabled");
  }

  return {
    enabled,
    actorId,
    keywords,
    datePosted,
    windowMinutes: toPositiveInt(merged.windowMinutes, "linkedin.windowMinutes", {
      min: 1,
      max: 43200
    }),
    maxResultsPerKeyword: toPositiveInt(
      merged.maxResultsPerKeyword,
      "linkedin.maxResultsPerKeyword",
      { min: 1, max: 1000 }
    ),
    minScore: toPositiveInt(merged.minScore, "linkedin.minScore", { min: 0, max: 100 }),
    concurrency: toPositiveInt(merged.concurrency, "linkedin.concurrency", {
      min: 1,
      max: 5
    }),
    usdPer1000
  };
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

  config.linkedin = normalizeLinkedIn(config.linkedin);

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
  const facebookTotal = config.sources.groups.length + config.sources.pages.length;
  const linkedinEnabled =
    config.linkedin?.enabled && (config.linkedin.keywords?.length ?? 0) > 0;
  if (facebookTotal === 0 && !linkedinEnabled) {
    throw new Error(
      "No sources configured. Add public group or page URLs under sources.groups / sources.pages, or enable LinkedIn post search under linkedin.enabled."
    );
  }
}
