import test from "node:test";
import assert from "node:assert/strict";
import { filterPosts, isFresh, ageMinutes } from "../src/filter.js";
import { SeenStore } from "../src/state.js";

const NOW = Date.parse("2026-10-24T12:00:00.000Z");

function makePost({ id = "p1", minutesAgo = 5, text = "Need a website", score = 10 } = {}) {
  return {
    id,
    postedAtMs: NOW - minutesAgo * 60000,
    postedAt: new Date(NOW - minutesAgo * 60000).toISOString(),
    text,
    postUrl: `https://facebook.com/${id}`,
    author: "Tester",
    sourceName: "Test Group",
    sourceUrl: "https://facebook.com/groups/test",
    sourceKind: "groups",
    likes: 1,
    comments: 2,
    shares: 3,
    views: 0,
    score
  };
}

const config = {
  windowMinutes: 10,
  minScore: 4,
  intent: { extra: {} }
};

test("isFresh accepts posts inside the window", () => {
  assert.equal(isFresh(makePost({ minutesAgo: 9.5 }), { windowMinutes: 10, now: NOW }), true);
  assert.equal(isFresh(makePost({ minutesAgo: 10.01 }), { windowMinutes: 10, now: NOW }), false);
  assert.equal(isFresh(makePost({ minutesAgo: 240 }), { windowMinutes: 10, now: NOW }), false);
});

test("isFresh rejects posts without a timestamp", () => {
  assert.equal(isFresh({ postedAtMs: null }, { windowMinutes: 10, now: NOW }), false);
});

test("isFresh rejects far-future timestamps", () => {
  assert.equal(isFresh(makePost({ minutesAgo: -10 }), { windowMinutes: 10, now: NOW }), false);
  assert.equal(isFresh(makePost({ minutesAgo: -2 }), { windowMinutes: 10, now: NOW }), true);
});

test("ageMinutes never goes negative", () => {
  assert.equal(ageMinutes(NOW - 3 * 60000, NOW), 3);
  assert.equal(ageMinutes(NOW + 60000, NOW), 0);
});

test("keeps only fresh, relevant, unseen posts", () => {
  const posts = [
    makePost({ id: "fresh-lead", minutesAgo: 3 }),
    makePost({ id: "old-lead", minutesAgo: 240 }),
    makePost({ id: "fresh-irrelevant", minutesAgo: 4, text: "Good morning everyone" }),
    makePost({ id: "no-time", minutesAgo: 1 })
  ];
  posts[3].postedAtMs = null;

  const { leads, stats, freshIds } = filterPosts(posts, { config, now: NOW });

  assert.deepEqual(leads.map((lead) => lead.id), ["fresh-lead"]);
  assert.deepEqual(freshIds, ["fresh-lead", "fresh-irrelevant"]);
  assert.equal(stats.examined, 4);
  assert.equal(stats.outsideWindow, 1);
  assert.equal(stats.skippedNoTimestamp, 1);
  assert.equal(stats.irrelevant, 1);
});

test("skips posts already seen", () => {
  const seen = new SeenStore(null);
  seen.add("fresh-lead");

  const { leads, stats } = filterPosts([makePost({ id: "fresh-lead" })], {
    config,
    now: NOW,
    seen
  });

  assert.equal(leads.length, 0);
  assert.equal(stats.duplicate, 1);
});

test("sorts leads by score then recency", () => {
  const posts = [
    makePost({ id: "low", minutesAgo: 1 }),
    makePost({ id: "high", minutesAgo: 9 })
  ];
  const { leads } = filterPosts(posts, { config, now: NOW });
  assert.equal(leads[0].id, "low");
  assert.equal(leads[1].id, "high");

  const mixed = [
    makePost({ id: "older-low", minutesAgo: 8, text: "Need a website" }),
    makePost({ id: "newer-higher", minutesAgo: 7, text: "We need a website, SEO, and automation. Budget." })
  ];
  const result = filterPosts(mixed, { config, now: NOW });
  assert.equal(result.leads[0].id, "newer-higher");
});
