import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { normalizeItem } from "../src/normalize.js";
import { scorePost } from "../src/intent.js";
import { isNearDuplicate } from "../src/duplicates.js";
import { writeReports } from "../src/report.js";
import { loadConfig } from "../src/config.js";
import { estimateMaxRunCostUsd, ACTORS } from "../src/apify.js";
import { notifyNewLeads } from "../src/notify.js";
import { createApp } from "../server/app.js";
import { LeadStore } from "../server/store.js";

const GOOD_TEXT =
  "We need a web developer to build a WordPress website for our business. Our budget is ready.";
const GOOD_TEXT_2 =
  "We are looking for an SEO specialist to improve our Google rankings. Paid project.";
const SELLER_TEXT =
  "I am a professional website developer with 5 years of experience. DM me for pricing.";

function lead(id, overrides = {}) {
  const postedAtMs = overrides.postedAtMs ?? Date.now();
  return {
    id,
    postedAt: new Date(postedAtMs).toISOString(),
    postedAtMs,
    score: 6,
    services: ["web"],
    author: `Author ${id}`,
    authorUrl: `https://www.facebook.com/${id}`,
    authorPic: "",
    sourceName: "Improvement group",
    sourceUrl: "https://www.facebook.com/groups/improvements",
    sourceKind: "groups",
    postUrl: `https://www.facebook.com/groups/improvements/permalink/${id}`,
    text: GOOD_TEXT,
    engagement: { likes: 1, comments: 1, shares: 0, views: 5 },
    ...overrides
  };
}

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("scores newer service categories and Roman Urdu requests", () => {
  const buyers = [
    "Video editor needed for a YouTube channel, paid.",
    "Looking for a logo designer for our new brand.",
    "Need a UI/UX designer to redesign our app.",
    "We want to build a mobile app and need a developer.",
    "Mujhe website banwani hai, budget hai. Contact karein."
  ];

  for (const text of buyers) {
    const result = scorePost(text, { minScore: 4 });
    assert.equal(result.isLead, true, `expected a lead: ${text}`);
    assert.ok(result.services.length > 0, `expected services: ${text}`);
  }
});

test("rejects sellers, learners, advice questions and announcements", () => {
  const nonLeads = [
    "I am a student and I sell websites, DM me",
    "How do I learn web development? I need a website.",
    "What is the budget for a website project?",
    "Our team of experts builds websites for clients.",
    "Our new website is live! Check out our portfolio."
  ];

  for (const text of nonLeads) {
    assert.equal(scorePost(text, { minScore: 4 }).isLead, false, `unexpected lead: ${text}`);
  }
});

test("parses ISO timestamps in Apify items", () => {
  const post = normalizeItem(
    {
      legacyId: "iso-1",
      url: "https://www.facebook.com/groups/iso/permalink/iso-1",
      timestamp: "2026-03-04T05:06:07.000Z",
      text: "Need a website",
      user: { name: "Test User" }
    },
    "groups"
  );

  assert.equal(post.postedAtMs, Date.parse("2026-03-04T05:06:07.000Z"));
});

test("detects near-duplicate reposts from the same author", () => {
  const original = {
    id: "near-a",
    author: "Repeat Poster",
    text: "We need a web developer to build a WordPress website for our business, please DM us."
  };
  const repost = {
    id: "near-b",
    author: "repeat poster",
    text: "we need a web developer to build a wordpress website for our business please dm us"
  };
  const otherAuthor = { ...repost, id: "near-c", author: "Someone Else" };
  const tooShort = { id: "near-d", author: "Repeat Poster", text: "Need a site" };

  assert.equal(isNearDuplicate(original, repost), true);
  assert.equal(isNearDuplicate(original, otherAuthor), false);
  assert.equal(isNearDuplicate(original, tooShort), false);
});

test("sanitizes CSV cells that could run as formulas", () => {
  const dir = tempDir("fb-leads-report-");
  try {
    const config = {
      windowMinutes: 10,
      minScore: 4,
      sources: { groups: [], pages: [] },
      output: { dir, keepJsonl: false }
    };
    const stats = { examined: 1, outsideWindow: 0, duplicate: 0, irrelevant: 0 };

    writeReports({
      config,
      leads: [lead("csv-1", { author: "=cmd|' /C calc'!A0", text: "@SUM(1+1)" })],
      stats
    });

    const csv = fs.readFileSync(path.join(dir, "latest.csv"), "utf8");
    assert.ok(csv.includes("'=cmd"));
    assert.ok(csv.includes("'@SUM"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("validates new configuration keys", () => {
  const dir = tempDir("fb-leads-config-");
  try {
    fs.writeFileSync(
      path.join(dir, "config.json"),
      JSON.stringify({
        retentionHours: 6,
        sources: {
          groups: ["https://www.facebook.com/groups/a"],
          pages: [],
          disabled: ["https://www.facebook.com/groups/b"],
          limits: { "https://www.facebook.com/groups/a": 12 },
          concurrency: 2
        }
      }),
      "utf8"
    );

    const config = loadConfig({ cwd: dir });
    assert.equal(config.retentionHours, 6);
    assert.equal(config.sources.concurrency, 2);
    assert.equal(config.sources.limits["https://www.facebook.com/groups/a"], 12);
    assert.deepEqual(config.sources.disabled, ["https://www.facebook.com/groups/b"]);

    fs.writeFileSync(
      path.join(dir, "config.json"),
      JSON.stringify({ sources: { groups: [], pages: [], limits: { "not-a-url": 5 } } }),
      "utf8"
    );
    assert.throws(() => loadConfig({ cwd: dir }), /invalid URL key/);

    fs.writeFileSync(
      path.join(dir, "config.json"),
      JSON.stringify({ sources: { groups: [], pages: [], concurrency: 50 } }),
      "utf8"
    );
    assert.throws(() => loadConfig({ cwd: dir }), /concurrency/);

    fs.writeFileSync(
      path.join(dir, "config.json"),
      JSON.stringify({ retentionHours: -1 }),
      "utf8"
    );
    assert.throws(() => loadConfig({ cwd: dir }), /retentionHours/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("cost estimate honors disabled sources and per-source limits", () => {
  const config = {
    windowMinutes: 10,
    maxResultsPerSource: 30,
    sources: {
      groups: ["https://www.facebook.com/groups/a", "https://www.facebook.com/groups/b"],
      pages: ["https://www.facebook.com/page"],
      disabled: ["https://www.facebook.com/groups/b"],
      limits: { "https://www.facebook.com/groups/a": 50 },
      concurrency: 3
    }
  };

  const cost = estimateMaxRunCostUsd(config);
  const expected =
    (50 * ACTORS.groups.usdPer1000 + 30 * ACTORS.pages.usdPer1000) / 1000;
  assert.ok(Math.abs(cost - expected) < 1e-9);
});

test("re-validates saved leads and drops posts that no longer qualify", () => {
  const dir = tempDir("fb-leads-revalidate-");
  try {
    const store = new LeadStore(path.join(dir, "data", "leads.json"));
    store.upsertMany([
      lead("still-good", { text: GOOD_TEXT }),
      lead("now-seller", { text: SELLER_TEXT, score: 9 })
    ]);

    const result = store.revalidate({ config: { minScore: 4 } });
    assert.equal(result.removed, 1);
    assert.equal(store.get("now-seller"), null);

    const kept = store.get("still-good");
    assert.ok(kept);
    assert.ok(kept.matched);
    assert.ok(kept.breakdown);
    assert.ok(kept.services.length > 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("removes and blocks a lead, persisting the block", () => {
  const dir = tempDir("fb-leads-block-");
  try {
    const file = path.join(dir, "data", "leads.json");
    const store = new LeadStore(file);
    store.upsertMany([lead("block-me", { author: "Spam Author", text: GOOD_TEXT })]);

    assert.deepEqual(store.remove("block-me", { block: "author" }), {
      removed: "block-me",
      blocked: "author"
    });
    assert.equal(store.get("block-me"), null);

    const skipped = store.upsertMany([
      lead("block-me-2", { author: "SPAM author", text: GOOD_TEXT_2 })
    ]);
    assert.deepEqual(skipped, { added: 0, updated: 0 });
    assert.equal(store.leads.size, 0);

    const reloaded = new LeadStore(file);
    assert.equal(reloaded.stats().blocked.authors, 1);
    assert.equal(reloaded.isBlocked({ id: "anything", author: "Spam Author" }), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("merges fuzzy reposts during upsert", () => {
  const dir = tempDir("fb-leads-fuzzy-");
  try {
    const store = new LeadStore(path.join(dir, "data", "leads.json"));
    const first = "We need a web developer to build a WordPress website for our business.";
    const second = "We need a web developer to build a WordPress website for our business";

    assert.deepEqual(
      store.upsertMany([lead("fuzzy-a", { author: "Fuzzy Author", text: first })]),
      { added: 1, updated: 0 }
    );
    assert.deepEqual(
      store.upsertMany([lead("fuzzy-b", { author: "fuzzy author", text: second })]),
      { added: 0, updated: 1 }
    );
    assert.equal(store.leads.size, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("retention prunes only old leads", () => {
  const dir = tempDir("fb-leads-retention-");
  try {
    const store = new LeadStore(path.join(dir, "data", "leads.json"), {
      retentionHours: 1
    });
    const now = Date.now();
    store.upsertMany([
      lead("old", {
        postedAtMs: now - 2 * 60 * 60 * 1000,
        author: "Old Author",
        text: GOOD_TEXT
      }),
      lead("fresh", {
        postedAtMs: now - 10 * 60 * 1000,
        author: "Fresh Author",
        text: GOOD_TEXT_2
      })
    ]);

    assert.equal(store.get("old"), null);
    assert.ok(store.get("fresh"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("sends new leads to a configured webhook", async () => {
  const received = [];
  const receiver = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      received.push(JSON.parse(body));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{}");
    });
  });

  await new Promise((resolve) => receiver.listen(0, "127.0.0.1", resolve));
  const port = receiver.address().port;
  const saved = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
    DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL,
    NOTIFY_WEBHOOK_URL: process.env.NOTIFY_WEBHOOK_URL
  };
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
  delete process.env.DISCORD_WEBHOOK_URL;
  process.env.NOTIFY_WEBHOOK_URL = `http://127.0.0.1:${port}/hook`;

  try {
    const result = await notifyNewLeads([
      lead("notify-1", { score: 8, services: ["web"] })
    ]);
    assert.equal(result.sent, 1);
    assert.equal(received.length, 1);
    assert.equal(received[0].event, "new_leads");
    assert.equal(received[0].leads[0].id, "notify-1");

    const demo = await notifyNewLeads([lead("demo-1", { demo: true })]);
    assert.equal(demo.skipped, true);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await new Promise((resolve) => receiver.close(resolve));
  }
});

let tmpDir;
let server;
let base;
let store;

before(async () => {
  tmpDir = tempDir("fb-leads-api-");
  fs.writeFileSync(
    path.join(tmpDir, "config.json"),
    JSON.stringify({ sources: { groups: [], pages: [] } }, null, 2)
  );

  store = new LeadStore(path.join(tmpDir, "data", "leads.json"));
  const { app } = createApp({
    cwd: tmpDir,
    store,
    publicDir: path.join(process.cwd(), "public"),
    logger: { log() {}, error() {} }
  });

  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function request(pathname, options) {
  const response = await fetch(`${base}${pathname}`, options);
  const data = await response.json();
  return { response, data };
}

test("delete endpoint removes and blocks a lead", async () => {
  store.upsertMany([lead("delete-me", { author: "Blocked Author", text: GOOD_TEXT })]);

  const bad = await request("/api/leads/delete-me?block=everything", { method: "DELETE" });
  assert.equal(bad.response.status, 400);

  const missing = await request("/api/leads/missing?block=author", { method: "DELETE" });
  assert.equal(missing.response.status, 404);

  const removed = await request("/api/leads/delete-me?block=author", { method: "DELETE" });
  assert.equal(removed.response.status, 200);
  assert.deepEqual(removed.data, { removed: "delete-me", blocked: "author" });

  const leads = await request("/api/leads?pageSize=100");
  assert.equal(leads.data.total, 0);

  const stats = await request("/api/stats");
  assert.equal(stats.data.blocked.authors, 1);
});
