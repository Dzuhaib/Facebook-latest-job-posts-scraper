import test from "node:test";
import assert from "node:assert/strict";
import { normalizeItem, normalizeItems } from "../src/normalize.js";

test("normalizes a Facebook page post", () => {
  const post = normalizeItem(
    {
      postId: "1315686150601111",
      url: "https://www.facebook.com/cern/posts/1",
      time: "2026-01-20T13:00:05.000Z",
      timestamp: 1768914005,
      text: "Hello world",
      pageName: "cern",
      facebookUrl: "https://www.facebook.com/cern",
      inputUrl: "https://www.facebook.com/cern",
      user: { name: "CERN" },
      likes: 146,
      comments: 3,
      shares: 27,
      viewsCount: 1000
    },
    "pages"
  );

  assert.equal(post.id, "1315686150601111");
  assert.equal(post.postedAtMs, 1768914005000);
  assert.equal(post.author, "CERN");
  assert.equal(post.sourceName, "cern");
  assert.equal(post.likes, 146);
  assert.equal(post.comments, 3);
  assert.equal(post.shares, 27);
  assert.equal(post.views, 1000);
});

test("normalizes a Facebook group post", () => {
  const post = normalizeItem(
    {
      legacyId: "1223750702961359",
      url: "https://www.facebook.com/groups/x/permalink/1223750702961359/",
      time: "2025-12-10T04:37:15.000Z",
      text: "Need Web products data scraper",
      groupTitle: "Web Scraping World",
      user: { name: "Alex" },
      likesCount: 12,
      commentsCount: 34,
      sharesCount: 0,
      inputUrl: "https://www.facebook.com/groups/x"
    },
    "groups"
  );

  assert.equal(post.id, "1223750702961359");
  assert.equal(post.postedAt, "2025-12-10T04:37:15.000Z");
  assert.equal(post.author, "Alex");
  assert.equal(post.sourceName, "Web Scraping World");
  assert.equal(post.likes, 12);
  assert.equal(post.comments, 34);
});

test("accepts millisecond timestamps", () => {
  const post = normalizeItem(
    { postId: "ms", text: "x", url: "https://facebook.com/ms", timestamp: 1768914005000 },
    "pages"
  );
  assert.equal(post.postedAtMs, 1768914005000);
});

test("missing time yields a null timestamp", () => {
  const post = normalizeItem({ postId: "1", text: "hi", url: "https://facebook.com/1" }, "groups");
  assert.equal(post.postedAtMs, null);
  assert.equal(post.postedAt, null);
});

test("drops empty items and keeps valid ones", () => {
  const items = normalizeItems([null, {}, { postId: "2", text: "x" }], "groups");
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "2");
});

test("ignores actor error records", () => {
  const items = normalizeItems(
    [
      {
        url: "https://www.facebook.com/groups/private",
        error: "no_items",
        errorDescription: "Empty or private data for provided input"
      },
      {
        legacyId: "3",
        url: "https://www.facebook.com/groups/public/permalink/3",
        time: "2025-12-10T04:37:15.000Z",
        text: "Need a website"
      }
    ],
    "groups"
  );

  assert.equal(items.length, 1);
  assert.equal(items[0].id, "3");
});

test("falls back to shared post text and time", () => {
  const post = normalizeItem(
    {
      legacyId: "4",
      url: "https://www.facebook.com/groups/x/permalink/4",
      text: "",
      user: { name: "Sharer", id: "999" },
      sharedPost: {
        text: "Need an SEO expert for our store",
        time: "2025-12-10T04:37:15.000Z"
      }
    },
    "groups"
  );

  assert.equal(post.text, "Need an SEO expert for our store");
  assert.equal(post.author, "Sharer");
  assert.equal(post.postedAt, "2025-12-10T04:37:15.000Z");
  assert.equal(post.authorUrl, "https://www.facebook.com/999");
});
