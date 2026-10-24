import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LeadStore } from "../server/store.js";

let tmpDir;
let file;

function lead(id, overrides = {}) {
  const postedAtMs = overrides.postedAtMs ?? Date.parse("2026-01-01T12:00:00Z");
  return {
    id,
    postedAt: new Date(postedAtMs).toISOString(),
    postedAtMs,
    score: 5,
    services: ["web"],
    author: `Author ${id}`,
    authorUrl: `https://www.facebook.com/${id}`,
    authorPic: "",
    sourceName: "Test group",
    sourceUrl: "https://www.facebook.com/groups/test",
    sourceKind: "groups",
    postUrl: `https://www.facebook.com/groups/test/permalink/${id}`,
    text: `Need a website ${id}`,
    engagement: { likes: 1, comments: 2, shares: 3, views: 4 },
    ...overrides
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fb-leads-store-"));
  file = path.join(tmpDir, "data", "leads.json");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("upserts leads and preserves contact state across rescans", () => {
  const store = new LeadStore(file);

  assert.deepEqual(store.upsertMany([lead("a"), lead("b")]), { added: 2, updated: 0 });
  assert.equal(store.get("a").contacted, false);

  store.update("a", { contacted: true });
  assert.equal(store.get("a").contactedAt !== null, true);

  assert.deepEqual(store.upsertMany([lead("a", { score: 9, text: "Updated" })]), {
    added: 0,
    updated: 1
  });

  const updated = store.get("a");
  assert.equal(updated.score, 9);
  assert.equal(updated.text, "Updated");
  assert.equal(updated.contacted, true);
  assert.equal(updated.contactedAt !== null, true);
});

test("persists leads, last scan time and contact state", () => {
  const store = new LeadStore(file);
  store.upsertMany([lead("a")]);
  store.update("a", { contacted: true });
  store.setLastScanAt("2026-01-02T03:04:05.000Z");

  const reloaded = new LeadStore(file);
  assert.equal(reloaded.get("a").contacted, true);
  assert.equal(reloaded.lastScanAt, "2026-01-02T03:04:05.000Z");
  assert.equal(reloaded.stats().total, 1);
});

test("drops invalid leads", () => {
  const store = new LeadStore(file);
  const result = store.upsertMany([
    null,
    { id: "" },
    { id: "no-time", postedAtMs: "nope" },
    lead("ok")
  ]);
  assert.deepEqual(result, { added: 1, updated: 0 });
  assert.equal(store.stats().total, 1);
});

test("filters, searches, sorts and paginates", () => {
  const store = new LeadStore(file);
  store.upsertMany([
    lead("a", { postedAtMs: Date.parse("2026-01-01T12:00:00Z"), score: 4, services: ["web"], text: "Need a WordPress site" }),
    lead("b", { postedAtMs: Date.parse("2026-01-01T12:01:00Z"), score: 8, services: ["seo"], text: "Need an SEO audit" }),
    lead("c", { postedAtMs: Date.parse("2026-01-01T12:02:00Z"), score: 6, services: ["automation"], text: "Need a Zapier automation" }),
    lead("d", { postedAtMs: Date.parse("2026-01-01T12:03:00Z"), score: 10, services: ["web", "seo"], text: "Need a website and SEO" })
  ]);
  store.update("b", { contacted: true });

  assert.equal(store.query({ status: "new" }).total, 3);
  assert.equal(store.query({ status: "contacted" }).total, 1);
  assert.equal(store.query({ service: "seo" }).total, 2);
  assert.equal(store.query({ services: "web,seo" }).total, 3);
  assert.equal(store.query({ services: ["web", "seo"] }).total, 3);
  assert.equal(store.query({ services: "web,all" }).total, 2);
  assert.equal(store.query({ q: "zapier" }).total, 1);
  assert.equal(store.query({ q: "author c" }).total, 1);

  assert.deepEqual(
    store.query({ sort: "score" }).items.map((item) => item.id),
    ["d", "b", "c", "a"]
  );
  assert.deepEqual(
    store.query({ sort: "oldest" }).items.map((item) => item.id),
    ["a", "b", "c", "d"]
  );

  const first = store.query({ page: 1, pageSize: 2 });
  assert.equal(first.items.length, 2);
  assert.equal(first.totalPages, 2);
  assert.equal(first.hasPrev, false);
  assert.equal(first.hasNext, true);

  const second = store.query({ page: 2, pageSize: 2 });
  assert.equal(second.items.length, 2);
  assert.equal(second.hasPrev, true);

  const clamped = store.query({ page: 99, pageSize: 9999 });
  assert.equal(clamped.page, 1);
  assert.equal(clamped.pageSize, 100);
});

test("stats count services and contact state", () => {
  const store = new LeadStore(file);
  store.upsertMany([
    lead("a", { services: ["web", "seo"] }),
    lead("b", { services: ["automation"] }),
    lead("c", { services: ["seo"] })
  ]);
  store.update("c", { contacted: true });

  const stats = store.stats();
  assert.equal(stats.total, 3);
  assert.equal(stats.new, 2);
  assert.equal(stats.contacted, 1);
  assert.deepEqual(stats.services, { automation: 1, web: 1, seo: 2 });
});

test("filters by max age and custom service names", () => {
  const store = new LeadStore(file);
  const now = Date.parse("2026-01-01T12:10:00Z");
  store.upsertMany([
    lead("old", {
      postedAtMs: Date.parse("2026-01-01T12:00:00Z"),
      services: ["video editing"]
    }),
    lead("mid", {
      postedAtMs: Date.parse("2026-01-01T12:05:00Z"),
      services: ["Video Editing"]
    }),
    lead("new", {
      postedAtMs: Date.parse("2026-01-01T12:09:00Z"),
      services: ["web"]
    })
  ]);

  const recent = store.query({ maxAgeMinutes: 5 }, now);
  assert.deepEqual(recent.items.map((item) => item.id), ["new", "mid"]);

  const custom = store.query({ service: "video editing" }, now);
  assert.deepEqual(custom.items.map((item) => item.id), ["mid", "old"]);
  assert.equal(store.stats(now).services["Video Editing"], 1);
});

test("removes only demo leads", () => {
  const store = new LeadStore(file);
  store.upsertMany([
    lead("real", { demo: false }),
    lead("demo", { demo: true })
  ]);

  assert.equal(store.stats().demo, 1);
  assert.equal(store.removeDemo(), 1);
  assert.equal(store.get("demo"), null);
  assert.equal(store.get("real").id, "real");
  assert.equal(store.stats().demo, 0);
});

test("marks legacy fixture ids as demo on load", () => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ leads: [lead("1001")] }));

  const store = new LeadStore(file);
  assert.equal(store.get("1001").demo, true);
  assert.equal(store.stats().demo, 1);
});

test("prunes to the newest leads", () => {
  const store = new LeadStore(file, { maxLeads: 2 });
  store.upsertMany([
    lead("old", { postedAtMs: Date.parse("2026-01-01T10:00:00Z") }),
    lead("mid", { postedAtMs: Date.parse("2026-01-01T11:00:00Z") }),
    lead("new", { postedAtMs: Date.parse("2026-01-01T12:00:00Z") })
  ]);

  assert.equal(store.stats().total, 2);
  assert.equal(store.get("old"), null);
  assert.equal(store.get("new").id, "new");
});

test("returns null when updating a missing lead", () => {
  const store = new LeadStore(file);
  assert.equal(store.update("missing", { contacted: true }), null);
});
