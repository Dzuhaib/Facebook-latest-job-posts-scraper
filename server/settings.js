import fs from "node:fs";
import path from "node:path";
import { ApifyClient } from "apify-client";
import { loadConfig, loadToken } from "../src/config.js";

function readRawConfig(cwd) {
  const file = path.join(cwd, "config.json");
  if (!fs.existsSync(file)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    throw new Error(`config.json is not valid JSON: ${error.message}`);
  }
}

function intInRange(value, name, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be a whole number between ${min} and ${max}`);
  }
  return parsed;
}

function parseUrls(value, name) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error(`${name} must be a list of URLs`);

  const urls = [];
  for (const item of value) {
    const url = String(item ?? "").trim();
    if (!url) continue;
    if (!/^https?:\/\//i.test(url)) {
      throw new Error(`${name}: "${url}" is not a full URL (use https://...)`);
    }
    urls.push(url);
  }
  return [...new Set(urls)];
}

function parseList(value, name, { max = 50, maxLength = 80 } = {}) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error(`${name} must be a list`);

  const out = [];
  const seen = new Set();
  for (const item of value) {
    const clean = String(item ?? "").replace(/\s+/g, " ").trim();
    if (!clean) continue;
    if (clean.length > maxLength) {
      throw new Error(`${name}: "${clean.slice(0, 24)}..." is too long (max ${maxLength} characters)`);
    }
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= max) break;
  }
  return out;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
  }
  return Boolean(value);
}

function parseLinkedIn(value, current) {
  if (value === undefined) return current;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("linkedin must be an object");
  }

  const next = { ...current };

  if (value.enabled !== undefined) next.enabled = parseBoolean(value.enabled);
  const keywords = parseList(value.keywords, "linkedin.keywords", {
    max: 30,
    maxLength: 120
  });
  if (keywords !== undefined) next.keywords = keywords;

  if (value.datePosted !== undefined) {
    const datePosted = String(value.datePosted).trim();
    if (!["anyTime", "past24Hours", "pastWeek", "pastMonth"].includes(datePosted)) {
      throw new Error("linkedin.datePosted must be anyTime, past24Hours, pastWeek, or pastMonth");
    }
    next.datePosted = datePosted;
  }

  if (value.windowMinutes !== undefined) {
    next.windowMinutes = intInRange(value.windowMinutes, "linkedin.windowMinutes", 1, 43200);
  }
  if (value.maxResultsPerKeyword !== undefined) {
    next.maxResultsPerKeyword = intInRange(
      value.maxResultsPerKeyword,
      "linkedin.maxResultsPerKeyword",
      1,
      1000
    );
  }
  if (value.minScore !== undefined) {
    next.minScore = intInRange(value.minScore, "linkedin.minScore", 0, 100);
  }
  if (value.concurrency !== undefined) {
    next.concurrency = intInRange(value.concurrency, "linkedin.concurrency", 1, 5);
  }
  if (next.enabled && (!Array.isArray(next.keywords) || next.keywords.length === 0)) {
    throw new Error("Add at least one LinkedIn search query before enabling LinkedIn posts");
  }

  return next;
}

function parseSkills(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("skills must be a list of keywords");

  const skills = new Map();
  for (const item of value) {
    const skill = String(item ?? "").replace(/\s+/g, " ").trim();
    if (!skill) continue;
    if (skill.length > 60) {
      throw new Error(`Skill "${skill.slice(0, 24)}..." is too long (max 60 characters)`);
    }
    const key = skill.toLowerCase();
    if (!skills.has(key)) skills.set(key, skill);
    if (skills.size >= 50) break;
  }
  return [...skills.values()];
}

function maskToken(token) {
  if (!token) return "";
  if (token.length <= 12) return "saved";
  return `${token.slice(0, 11)}...${token.slice(-4)}`;
}

function validateToken(token) {
  const clean = String(token ?? "").trim();
  if (clean.includes("replace_me") || !/^[A-Za-z0-9_-]{20,}$/.test(clean)) {
    throw new Error("That does not look like an Apify API token");
  }
  return clean;
}

function writeToken(cwd, token) {
  const envPath = path.join(cwd, ".env");
  const line = `APIFY_TOKEN=${token}`;
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";

  if (/^APIFY_TOKEN=.*$/m.test(content)) {
    content = content.replace(/^APIFY_TOKEN=.*$/m, line);
  } else {
    content = `${content.replace(/\s*$/, "")}\n${line}\n`;
  }

  fs.writeFileSync(envPath, content, "utf8");
  process.env.APIFY_TOKEN = token;
}

export function getSettings(cwd) {
  const config = loadConfig({ cwd });
  const token = (process.env.APIFY_TOKEN ?? "").trim();
  const tokenSet = Boolean(token) && !token.includes("replace_me");

  return {
    tokenSet,
    tokenPreview: tokenSet ? maskToken(token) : "",
    windowMinutes: config.windowMinutes,
    minScore: config.minScore,
    maxResultsPerSource: config.maxResultsPerSource,
    retentionHours: config.retentionHours ?? 0,
    concurrency: config.sources.concurrency ?? 3,
    groups: config.sources.groups,
    pages: config.sources.pages,
    disabledSources: config.sources.disabled ?? [],
    limits: config.sources.limits ?? {},
    skills: config.intent.extra.skills ?? [],
    linkedin: config.linkedin
  };
}

export function saveSettings(cwd, input = {}) {
  const config = loadConfig({ cwd });
  const raw = readRawConfig(cwd);

  const windowMinutes = intInRange(
    input.windowMinutes ?? config.windowMinutes,
    "windowMinutes",
    1,
    1440
  );
  const minScore = intInRange(input.minScore ?? config.minScore, "minScore", 0, 100);
  const maxResultsPerSource = intInRange(
    input.maxResultsPerSource ?? config.maxResultsPerSource,
    "maxResultsPerSource",
    1,
    1000
  );

  const retentionHours = intInRange(
    input.retentionHours ?? config.retentionHours ?? 0,
    "retentionHours",
    0,
    8760
  );
  const concurrency = intInRange(
    input.concurrency ?? config.sources.concurrency ?? 3,
    "concurrency",
    1,
    10
  );

  const groups = parseUrls(input.groups, "groups") ?? config.sources.groups;
  const pages = parseUrls(input.pages, "pages") ?? config.sources.pages;
  const disabledSources =
    parseUrls(input.disabledSources, "disabledSources") ?? config.sources.disabled ?? [];
  const skills = parseSkills(input.skills) ?? config.intent.extra.skills ?? [];
  const linkedin = parseLinkedIn(input.linkedin, config.linkedin);

  const rawLinkedIn =
    raw.linkedin && typeof raw.linkedin === "object" && !Array.isArray(raw.linkedin)
      ? raw.linkedin
      : {};

  const next = {
    ...raw,
    windowMinutes,
    minScore,
    maxResultsPerSource,
    retentionHours,
    sources: {
      ...(raw.sources ?? {}),
      groups,
      pages,
      disabled: disabledSources,
      concurrency
    },
    linkedin: {
      ...rawLinkedIn,
      ...linkedin
    },
    intent: {
      ...(raw.intent ?? {}),
      extra: {
        ...(raw.intent?.extra ?? {}),
        skills
      }
    }
  };

  fs.writeFileSync(
    path.join(cwd, "config.json"),
    `${JSON.stringify(next, null, 2)}\n`,
    "utf8"
  );

  if (input.token !== undefined && String(input.token).trim() !== "") {
    writeToken(cwd, validateToken(input.token));
  }

  return getSettings(cwd);
}

export async function testToken(cwd, tokenOverride) {
  const provided = String(tokenOverride ?? "").trim();
  const token = provided ? validateToken(provided) : loadToken();
  const client = new ApifyClient({ token });
  const user = await client.user().get();

  return {
    username: user.username,
    plan: user.plan?.id ?? user.plan?.description ?? null,
    email: user.email ?? null
  };
}
