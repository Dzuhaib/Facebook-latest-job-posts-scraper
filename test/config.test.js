import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../src/config.js";

function tempProject(config = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fb-leads-"));
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify(config), "utf8");
  return dir;
}

test("loads defaults and resolves the output directory", () => {
  const dir = tempProject();
  const config = loadConfig({ cwd: dir });
  assert.equal(config.windowMinutes, 10);
  assert.equal(config.maxResultsPerSource, 30);
  assert.equal(config.minScore, 4);
  assert.equal(config.output.dir, path.join(dir, "output"));
});

test("normalizes and deduplicates source URLs", () => {
  const dir = tempProject({
    sources: {
      groups: [
        "https://www.facebook.com/groups/a",
        "https://www.facebook.com/groups/a",
        { url: "https://www.facebook.com/groups/b" }
      ]
    }
  });
  const config = loadConfig({ cwd: dir });
  assert.deepEqual(config.sources.groups, [
    "https://www.facebook.com/groups/a",
    "https://www.facebook.com/groups/b"
  ]);
});

test("rejects sources that are not full URLs", () => {
  const dir = tempProject({ sources: { groups: ["facebook.com/groups/a"] } });
  assert.throws(() => loadConfig({ cwd: dir }), /full URLs/);
});

test("rejects an out-of-range window", () => {
  const dir = tempProject({ windowMinutes: 0 });
  assert.throws(() => loadConfig({ cwd: dir }), /windowMinutes/);
});

test("CLI values override config values", () => {
  const dir = tempProject({ windowMinutes: 10, minScore: 4 });
  const config = loadConfig({ cwd: dir, argv: { window: "5", minScore: "6" } });
  assert.equal(config.windowMinutes, 5);
  assert.equal(config.minScore, 6);
});

test("environment variables override config values", () => {
  const dir = tempProject({ windowMinutes: 10 });
  const previous = process.env.FB_WINDOW_MINUTES;
  process.env.FB_WINDOW_MINUTES = "7";
  try {
    const config = loadConfig({ cwd: dir });
    assert.equal(config.windowMinutes, 7);
  } finally {
    if (previous === undefined) delete process.env.FB_WINDOW_MINUTES;
    else process.env.FB_WINDOW_MINUTES = previous;
  }
});
