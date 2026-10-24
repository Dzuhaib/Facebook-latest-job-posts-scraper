import test from "node:test";
import assert from "node:assert/strict";
import { buildInput, estimateMaxRunCostUsd, runOne, ACTORS } from "../src/apify.js";

const config = {
  windowMinutes: 10,
  maxResultsPerSource: 30,
  sources: {
    groups: ["https://www.facebook.com/groups/a", "https://www.facebook.com/groups/b"],
    pages: ["https://www.facebook.com/somepage"]
  }
};

test("group input enforces the 10 minute server-side window", () => {
  const input = buildInput("groups", config.sources.groups, config);
  assert.equal(input.onlyPostsNewerThan, "10 minutes");
  assert.equal(input.viewOption, "CHRONOLOGICAL");
  assert.equal(input.resultsLimit, 30);
  assert.deepEqual(input.startUrls, [
    { url: "https://www.facebook.com/groups/a" },
    { url: "https://www.facebook.com/groups/b" }
  ]);
});

test("page input enforces the same window", () => {
  const input = buildInput("pages", config.sources.pages, config);
  assert.equal(input.onlyPostsNewerThan, "10 minutes");
  assert.equal(input.captionText, false);
  assert.equal(input.resultsLimit, 30);
});

test("window value follows config", () => {
  const input = buildInput("groups", config.sources.groups, {
    ...config,
    windowMinutes: 3
  });
  assert.equal(input.onlyPostsNewerThan, "3 minutes");
});

test("cost estimate uses actor pricing", () => {
  const cost = estimateMaxRunCostUsd(config);
  const expected =
    (2 * 30 * ACTORS.groups.usdPer1000) / 1000 +
    (1 * 30 * ACTORS.pages.usdPer1000) / 1000;
  assert.ok(Math.abs(cost - expected) < 1e-9);
  assert.ok(cost > 0);
});

test("separates real posts from actor source errors", async () => {
  const logs = [];
  const client = {
    actor() {
      return {
        call: async () => ({
          id: "run-1",
          status: "SUCCEEDED",
          defaultDatasetId: "dataset-1"
        })
      };
    },
    dataset() {
      return {
        listItems: async () => ({
          items: [
            {
              url: "https://www.facebook.com/groups/private",
              error: "no_items",
              errorDescription: "Empty or private data for provided input"
            },
            {
              legacyId: "42",
              url: "https://www.facebook.com/groups/public/permalink/42",
              time: "2026-01-01T00:00:00.000Z",
              text: "Need a website"
            }
          ]
        })
      };
    }
  };

  const result = await runOne(
    client,
    "groups",
    ["https://www.facebook.com/groups/private"],
    config,
    (message) => logs.push(message)
  );

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].legacyId, "42");
  assert.equal(result.failures.length, 1);
  assert.ok(logs.some((line) => line.includes("1 source(s) returned no posts")));
  assert.ok(logs.some((line) => line.includes("Empty or private data")));
  assert.ok(logs.some((line) => line.includes("1 raw post(s) returned")));
});
