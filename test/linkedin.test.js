import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig, assertSources } from "../src/config.js";
import { normalizeLinkedInItem, parseRelativeTime } from "../src/normalize.js";
import { filterPosts } from "../src/filter.js";
import { duplicateFingerprint, isNearDuplicate } from "../src/duplicates.js";
import {
  buildLinkedInInput,
  estimateMaxRunCostUsd,
  linkedinQueries
} from "../src/apify.js";
import { LeadStore } from "../server/store.js";
import { saveSettings, getSettings } from "../server/settings.js";

const NOW = Date.parse("2026-11-07T12:00:00.000Z");

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function storeLead(id, overrides = {}) {
  const postedAtMs = overrides.postedAtMs ?? NOW - 5 * 60 * 1000;
  return {
    id,
    postedAt: new Date(postedAtMs).toISOString(),
    postedAtMs,
    score: 9,
    services: ["web"],
    author: "Acme",
    authorUrl: "",
    authorPic: "",
    sourceName: "Test source",
    sourceUrl: "https://www.facebook.com/groups/test",
    sourceKind: "groups",
    postUrl: `https://example.com/${id}`,
    text: "We need a web developer to build a website for our business. Please send a quote.",
    engagement: { likes: 0, comments: 0, shares: 0, views: 0 },
    ...overrides
  };
}

test("LinkedIn post config is disabled by default and can be the only source", () => {
  const dir = tempDir("fb-leads-linkedin-config-");
  try {
    const config = loadConfig({ cwd: dir });
    assert.equal(config.linkedin.enabled, false);
    assert.equal(config.linkedin.actorId, "harvestapi/linkedin-post-search");
    assert.equal(config.linkedin.windowMinutes, 1440);
    assert.equal(config.linkedin.maxResultsPerKeyword, 30);
    assert.equal(config.linkedin.usdPer1000, 2);
    assert.ok(config.linkedin.keywords.length > 0);
    assert.equal("locations" in config.linkedin, false);
    assert.throws(() => assertSources(config), /No sources configured/);

    fs.writeFileSync(
      path.join(dir, "config.json"),
      JSON.stringify({ linkedin: { enabled: true } }),
      "utf8"
    );
    const enabled = loadConfig({ cwd: dir });
    assert.equal(enabled.linkedin.enabled, true);
    assert.doesNotThrow(() => assertSources(enabled));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("migrates legacy LinkedIn job settings to post search", () => {
  const dir = tempDir("fb-leads-linkedin-migration-");
  try {
    fs.writeFileSync(
      path.join(dir, "config.json"),
      JSON.stringify({
        linkedin: {
          enabled: true,
          actorId: "curious_coder/linkedin-jobs-scraper",
          keywords: ["web developer", "hiring video editor"],
          locations: ["Remote"],
          datePosted: "pastWeek",
          maxResultsPerKeyword: 50,
          minScore: 5,
          scrapeCompany: true,
          under10Applicants: true,
          concurrency: 2,
          usdPer1000: 1
        }
      }),
      "utf8"
    );

    const config = loadConfig({ cwd: dir });
    assert.equal(config.linkedin.actorId, "harvestapi/linkedin-post-search");
    assert.deepEqual(config.linkedin.keywords, [
      "need web developer",
      "hiring video editor"
    ]);
    assert.equal(config.linkedin.usdPer1000, 2);
    assert.equal(config.linkedin.maxResultsPerKeyword, 50);
    assert.equal(config.linkedin.datePosted, "pastWeek");
    assert.equal("locations" in config.linkedin, false);
    assert.equal("scrapeCompany" in config.linkedin, false);
    assert.equal("under10Applicants" in config.linkedin, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("LinkedIn post config rejects invalid values", () => {
  const dir = tempDir("fb-leads-linkedin-config-");
  try {
    fs.writeFileSync(
      path.join(dir, "config.json"),
      JSON.stringify({ linkedin: { enabled: true, keywords: [] } }),
      "utf8"
    );
    assert.throws(() => loadConfig({ cwd: dir }), /at least one search query/);

    fs.writeFileSync(
      path.join(dir, "config.json"),
      JSON.stringify({ linkedin: { datePosted: "yesterday" } }),
      "utf8"
    );
    assert.throws(() => loadConfig({ cwd: dir }), /datePosted/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("builds LinkedIn post search input from config", () => {
  const config = {
    linkedin: {
      maxResultsPerKeyword: 30,
      datePosted: "past24Hours"
    }
  };

  assert.deepEqual(buildLinkedInInput("hiring web developer", config), {
    searchQueries: ["hiring web developer"],
    maxPosts: 30,
    postedLimit: "24h",
    sortBy: "date",
    contentType: "all",
    scrapeReactions: false,
    scrapeComments: false
  });

  assert.equal(
    buildLinkedInInput("need seo help", {
      linkedin: { ...config.linkedin, datePosted: "pastWeek", maxResultsPerKeyword: 12 }
    }).postedLimit,
    "week"
  );

  assert.deepEqual(
    linkedinQueries({
      linkedin: { keywords: [" Web  developer ", "web developer", "", "SEO help"] }
    }),
    ["Web developer", "SEO help"]
  );
});

test("normalizes a LinkedIn post into the shared lead shape", () => {
  const postedAt = new Date(NOW - 2 * 60 * 60 * 1000).toISOString();
  const post = normalizeLinkedInItem(
    {
      type: "post",
      id: "urn:li:activity:123",
      linkedinUrl: "https://www.linkedin.com/posts/jane_activity-123",
      content: "<p>We are <b>hiring</b> a web developer to build a website.</p>",
      author: {
        name: "Jane Doe",
        linkedinUrl: "https://www.linkedin.com/in/jane",
        avatar: { url: "https://media.example.com/jane.jpg" }
      },
      postedAt: { date: postedAt, postedAgoText: "2 hours ago" },
      engagement: { likes: 5, comments: 2, shares: 1, views: 100 },
      searchUrl: "https://www.linkedin.com/search/results/content/?keywords=web"
    },
    { now: NOW }
  );

  assert.equal(post.id, "linkedin:urn:li:activity:123");
  assert.equal(post.platform, "linkedin");
  assert.equal(post.sourceKind, "linkedin-posts");
  assert.equal(post.sourceName, "LinkedIn Posts");
  assert.equal(post.author, "Jane Doe");
  assert.equal(post.authorUrl, "https://www.linkedin.com/in/jane");
  assert.equal(post.authorPic, "https://media.example.com/jane.jpg");
  assert.equal(post.postedAtMs, NOW - 2 * 60 * 60 * 1000);
  assert.match(post.text, /hiring a web developer/);
  assert.equal(post.likes, 5);
  assert.equal(post.comments, 2);
  assert.equal(post.shares, 1);
  assert.equal(post.views, 100);
  assert.equal("job" in post, false);
});

test("ignores LinkedIn job listings and error rows", () => {
  const base = {
    type: "post",
    id: "urn:li:activity:1",
    linkedinUrl: "https://www.linkedin.com/posts/jane_activity-1",
    content: "We need a web developer.",
    postedAt: { date: new Date(NOW).toISOString() }
  };

  assert.equal(normalizeLinkedInItem({ ...base, type: "job" }, { now: NOW }), null);
  assert.equal(
    normalizeLinkedInItem(
      { ...base, linkedinUrl: "https://www.linkedin.com/jobs/view/123" },
      { now: NOW }
    ),
    null
  );
  assert.equal(
    normalizeLinkedInItem({ ...base, error: "search failed" }, { now: NOW }),
    null
  );
});

test("parses LinkedIn relative timestamps", () => {
  assert.equal(parseRelativeTime("30 minutes ago", NOW), NOW - 30 * 60 * 1000);
  assert.equal(parseRelativeTime("2 weeks ago", NOW), NOW - 14 * 24 * 60 * 60 * 1000);
  assert.equal(parseRelativeTime("Yesterday", NOW), NOW - 24 * 60 * 60 * 1000);
  assert.equal(parseRelativeTime("not a date", NOW), null);
});

test("filters Facebook and LinkedIn posts with separate windows and stats", () => {
  const config = {
    windowMinutes: 10,
    minScore: 4,
    intent: { extra: {} },
    linkedin: {
      enabled: true,
      keywords: ["hiring web developer", "looking for wordpress developer"],
      datePosted: "past24Hours",
      windowMinutes: 1440,
      maxResultsPerKeyword: 30,
      minScore: 4,
      concurrency: 2,
      usdPer1000: 2
    }
  };

  const facebook = {
    id: "fb-1",
    platform: "facebook",
    postedAtMs: NOW - 5 * 60 * 1000,
    postedAt: new Date(NOW - 5 * 60 * 1000).toISOString(),
    text: "We need a web developer to build a website for our business. Please send a quote.",
    author: "Buyer",
    sourceName: "Group",
    sourceUrl: "https://www.facebook.com/groups/test",
    sourceKind: "groups",
    postUrl: "https://www.facebook.com/groups/test/1",
    likes: 0,
    comments: 0,
    shares: 0,
    views: 0
  };

  const linkedin = {
    id: "linkedin:1",
    platform: "linkedin",
    postedAtMs: NOW - 2 * 60 * 60 * 1000,
    postedAt: new Date(NOW - 2 * 60 * 60 * 1000).toISOString(),
    text: "We are hiring a web developer to build a website for our business. Please send a quote.",
    author: "Acme",
    sourceName: "LinkedIn Posts",
    sourceUrl: "https://www.linkedin.com/search/results/content/",
    sourceKind: "linkedin-posts",
    postUrl: "https://www.linkedin.com/posts/acme_activity-1",
    likes: 3,
    comments: 1,
    shares: 0,
    views: 50
  };

  const oldFacebook = {
    ...facebook,
    id: "fb-old",
    postedAtMs: NOW - 60 * 60 * 1000,
    postedAt: new Date(NOW - 60 * 60 * 1000).toISOString()
  };

  const oldLinkedin = {
    ...linkedin,
    id: "linkedin:old",
    postedAtMs: NOW - 25 * 60 * 60 * 1000,
    postedAt: new Date(NOW - 25 * 60 * 60 * 1000).toISOString()
  };

  const irrelevantPost = {
    ...linkedin,
    id: "linkedin:irrelevant",
    text: "Had a great lunch with the team today. Grateful for this group.",
    postUrl: "https://www.linkedin.com/posts/acme_activity-2"
  };

  const { leads, stats } = filterPosts(
    [facebook, linkedin, oldFacebook, oldLinkedin, irrelevantPost],
    { config, now: NOW }
  );

  assert.equal(leads.length, 2);
  assert.deepEqual(
    leads.map((lead) => lead.id).sort(),
    ["fb-1", "linkedin:1"]
  );
  assert.equal(stats.byPlatform.facebook.leads, 1);
  assert.equal(stats.byPlatform.linkedin.leads, 1);
  assert.equal(stats.byPlatform.facebook.outsideWindow, 1);
  assert.equal(stats.byPlatform.linkedin.outsideWindow, 1);
  assert.equal(stats.byPlatform.linkedin.irrelevant, 1);
  assert.equal("job" in leads.find((lead) => lead.platform === "linkedin"), false);
});

test("duplicates never cross platforms", () => {
  const facebook = {
    id: "same",
    platform: "facebook",
    author: "Acme",
    text: "We need a web developer to build a website for our business. Please send a quote."
  };
  const linkedin = { ...facebook, id: "linkedin:same", platform: "linkedin" };

  assert.notEqual(duplicateFingerprint(facebook), duplicateFingerprint(linkedin));
  assert.equal(isNearDuplicate(facebook, linkedin), false);
  assert.equal(isNearDuplicate(facebook, { ...linkedin, id: "same" }), false);
});

test("cost estimate includes LinkedIn query limits", () => {
  const config = {
    windowMinutes: 10,
    maxResultsPerSource: 30,
    sources: { groups: [], pages: [], disabled: [], limits: {}, concurrency: 1 },
    linkedin: {
      enabled: true,
      keywords: ["hiring web developer", "looking for web developer"],
      maxResultsPerKeyword: 100,
      usdPer1000: 1
    }
  };

  assert.equal(estimateMaxRunCostUsd(config), 0.2);
  assert.equal(
    estimateMaxRunCostUsd({ ...config, linkedin: { ...config.linkedin, enabled: false } }),
    0
  );
});

test("store filters, counts and revalidates LinkedIn posts", () => {
  const dir = tempDir("fb-leads-linkedin-store-");
  try {
    const store = new LeadStore(path.join(dir, "data", "leads.json"));
    const facebook = storeLead("fb-1");
    const linkedin = storeLead("linkedin:1", {
      platform: "linkedin",
      postedAtMs: NOW - 2 * 60 * 60 * 1000,
      postedAt: new Date(NOW - 2 * 60 * 60 * 1000).toISOString(),
      author: "Acme",
      sourceName: "LinkedIn Posts",
      sourceUrl: "https://www.linkedin.com/search/results/content/",
      sourceKind: "linkedin-posts",
      postUrl: "https://www.linkedin.com/posts/acme_activity-1",
      text: "We are hiring a web developer to build a website for our business. Please send a quote."
    });

    assert.deepEqual(store.upsertMany([facebook, linkedin]), { added: 2, updated: 0 });
    assert.equal(store.query({ platform: "linkedin" }).total, 1);
    assert.equal(store.query({ platform: "facebook" }).total, 1);
    assert.equal(store.stats().platforms.linkedin, 1);
    assert.equal(store.stats().platforms.facebook, 1);
    assert.equal("job" in store.query({ platform: "linkedin" }).items[0], false);

    const config = {
      minScore: 4,
      intent: { extra: {} },
      linkedin: { keywords: ["hiring web developer"], minScore: 4 }
    };
    const result = store.revalidate({ config });
    assert.equal(result.removed, 0);
    assert.ok(store.get("linkedin:1"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("settings API saves and validates LinkedIn post options", () => {
  const dir = tempDir("fb-leads-linkedin-settings-");
  try {
    const settings = saveSettings(dir, {
      linkedin: {
        enabled: true,
        keywords: ["hiring web developer", "need seo help"],
        datePosted: "pastWeek",
        maxResultsPerKeyword: 25,
        windowMinutes: 720,
        minScore: 5,
        concurrency: 3
      }
    });

    assert.equal(settings.linkedin.enabled, true);
    assert.deepEqual(settings.linkedin.keywords, [
      "hiring web developer",
      "need seo help"
    ]);
    assert.equal(settings.linkedin.datePosted, "pastWeek");
    assert.equal(settings.linkedin.maxResultsPerKeyword, 25);
    assert.equal(settings.linkedin.windowMinutes, 720);
    assert.equal(settings.linkedin.minScore, 5);
    assert.equal(settings.linkedin.concurrency, 3);
    assert.equal("locations" in settings.linkedin, false);
    assert.equal("scrapeCompany" in settings.linkedin, false);
    assert.equal("under10Applicants" in settings.linkedin, false);
    assert.equal(getSettings(dir).linkedin.enabled, true);

    assert.throws(
      () => saveSettings(dir, { linkedin: { enabled: true, keywords: [] } }),
      /at least one LinkedIn search query/
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
