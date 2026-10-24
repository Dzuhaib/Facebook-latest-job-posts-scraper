import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../server/app.js";
import { LeadStore } from "../server/store.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const silent = { log() {}, error() {} };

let tmpDir;
let server;
let base;
let store;
let previousToken;

async function getJson(pathname, options) {
  const response = await fetch(`${base}${pathname}`, options);
  const data = await response.json();
  return { response, data };
}

async function waitForScan() {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const { data } = await getJson("/api/scan/status");
    if (!data.running) return data;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("demo scan did not finish");
}

before(async () => {
  previousToken = process.env.APIFY_TOKEN;
  delete process.env.APIFY_TOKEN;

  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fb-leads-ui-"));
  fs.writeFileSync(
    path.join(tmpDir, "config.json"),
    JSON.stringify({ sources: { groups: [], pages: [] } }, null, 2)
  );

  store = new LeadStore(path.join(tmpDir, "data", "leads.json"));
  const { app } = createApp({
    cwd: tmpDir,
    store,
    publicDir: path.join(projectRoot, "public"),
    logger: silent
  });

  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (previousToken === undefined) delete process.env.APIFY_TOKEN;
  else process.env.APIFY_TOKEN = previousToken;

  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("serves the dashboard", async () => {
  const response = await fetch(`${base}/`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /FB Fresh Leads|Fresh Leads/);
  assert.match(html, /id="settingsDialog"/);
});

test("starts empty and paginates after a demo scan", async () => {
  const empty = await getJson("/api/leads?page=1&pageSize=5");
  assert.equal(empty.response.status, 200);
  assert.equal(empty.data.total, 0);
  assert.deepEqual(empty.data.items, []);

  const start = await getJson("/api/demo", { method: "POST", body: "{}" });
  assert.equal(start.response.status, 202);
  assert.equal(start.data.started, true);

  const status = await waitForScan();
  assert.equal(status.error, null);
  assert.ok(status.result);
  assert.ok(status.result.added >= 6);

  const page1 = await getJson("/api/leads?page=1&pageSize=5&sort=newest");
  assert.equal(page1.data.total, 6);
  assert.equal(page1.data.items.length, 5);
  assert.equal(page1.data.totalPages, 2);
  assert.equal(page1.data.hasPrev, false);
  assert.equal(page1.data.hasNext, true);

  const lead = page1.data.items[0];
  assert.ok(lead.author);
  assert.ok(lead.postedAt);
  assert.ok(Number.isFinite(lead.postedAtMs));
  assert.equal(lead.contacted, false);
  assert.ok(Array.isArray(lead.services));
  assert.ok(lead.score >= 4);
  assert.equal(lead.demo, true);

  const page2 = await getJson("/api/leads?page=2&pageSize=5");
  assert.equal(page2.data.items.length, 1);
  assert.equal(page2.data.hasPrev, true);
  assert.equal(page2.data.hasNext, false);
});

test("filters by contact status, service and search text", async () => {
  const all = await getJson("/api/leads?pageSize=100");
  const lead = all.data.items[0];

  const marked = await getJson(`/api/leads/${encodeURIComponent(lead.id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contacted: true })
  });
  assert.equal(marked.response.status, 200);
  assert.equal(marked.data.lead.contacted, true);
  assert.ok(marked.data.lead.contactedAt);

  const contacted = await getJson("/api/leads?status=contacted");
  assert.equal(contacted.data.total, 1);
  assert.equal(contacted.data.items[0].id, lead.id);

  const fresh = await getJson("/api/leads?status=new");
  assert.equal(fresh.data.total, 5);

  const seo = await getJson("/api/leads?service=seo");
  assert.ok(seo.data.total >= 1);
  assert.ok(seo.data.items.every((item) => item.services.includes("seo")));

  const multi = await getJson("/api/leads?services=seo,web");
  assert.ok(multi.data.total >= seo.data.total);
  assert.ok(
    multi.data.items.every(
      (item) => item.services.includes("seo") || item.services.includes("web")
    )
  );

  const search = await getJson("/api/leads?q=zapier");
  assert.equal(search.data.total, 1);

  const undo = await getJson(`/api/leads/${encodeURIComponent(lead.id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contacted: false })
  });
  assert.equal(undo.data.lead.contacted, false);
  assert.equal(undo.data.lead.contactedAt, null);
});

test("returns stats and scan status", async () => {
  const stats = await getJson("/api/stats");
  assert.equal(stats.response.status, 200);
  assert.equal(stats.data.total, 6);
  assert.equal(stats.data.new, 6);
  assert.equal(stats.data.contacted, 0);
  assert.ok(stats.data.lastScanAt);
  assert.equal(stats.data.scan.running, false);
});

test("removes demo leads without touching real leads", async () => {
  const realId = "real-test-lead";
  store.upsertMany([
    {
      id: realId,
      postedAt: new Date().toISOString(),
      postedAtMs: Date.now(),
      score: 8,
      services: ["web"],
      author: "Real Lead",
      sourceName: "Real group",
      sourceUrl: "https://www.facebook.com/groups/real",
      postUrl: "https://www.facebook.com/groups/real/permalink/real-test-lead",
      text: "Need a website",
      engagement: { likes: 0, comments: 0, shares: 0, views: 0 }
    }
  ]);

  const before = await getJson("/api/stats");
  assert.ok(before.data.demo >= 6);

  const removed = await getJson("/api/leads/demo", { method: "DELETE" });
  assert.equal(removed.response.status, 200);
  assert.ok(removed.data.removed >= 6);

  const stats = await getJson("/api/stats");
  assert.equal(stats.data.demo, 0);
  assert.equal(stats.data.total, 1);

  const leads = await getJson("/api/leads?pageSize=100");
  assert.deepEqual(leads.data.items.map((item) => item.id), [realId]);
});

test("removes duplicate leads through the API", async () => {
  const text = "We need a web developer to build a WordPress site for our business.";
  const nowIso = new Date().toISOString();
  const duplicate = {
    postedAt: nowIso,
    postedAtMs: Date.now(),
    score: 6,
    services: ["web"],
    author: "Duplicate Author",
    authorUrl: "https://www.facebook.com/duplicate-author",
    authorPic: "",
    sourceName: "Duplicate group",
    sourceUrl: "https://www.facebook.com/groups/duplicate",
    sourceKind: "groups",
    text,
    engagement: { likes: 1, comments: 1, shares: 0, views: 0 },
    contacted: false,
    contactedAt: null,
    demo: false,
    firstSeenAt: nowIso,
    lastSeenAt: nowIso
  };

  store.leads.set("dup-a", {
    ...duplicate,
    id: "dup-a",
    postUrl: "https://www.facebook.com/groups/duplicate/permalink/dup-a"
  });
  store.leads.set("dup-b", {
    ...duplicate,
    id: "dup-b",
    score: 9,
    contacted: true,
    contactedAt: nowIso,
    postUrl: "https://www.facebook.com/groups/duplicate/permalink/dup-b"
  });

  const before = await getJson("/api/stats");
  assert.equal(before.data.duplicates, 1);

  const removed = await getJson("/api/leads/duplicates", { method: "DELETE" });
  assert.equal(removed.response.status, 200);
  assert.deepEqual(removed.data, { removed: 1, groups: 1 });

  const leads = await getJson("/api/leads?pageSize=100");
  const matching = leads.data.items.filter((item) => item.text === text);
  assert.equal(matching.length, 1);
  assert.equal(matching[0].contacted, true);

  const after = await getJson("/api/stats");
  assert.equal(after.data.duplicates, 0);
});

test("reads and saves settings", async () => {
  const current = await getJson("/api/settings");
  assert.equal(current.response.status, 200);
  assert.equal(current.data.windowMinutes, 10);
  assert.equal(current.data.tokenSet, false);

  const saved = await getJson("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      windowMinutes: 7,
      minScore: 5,
      maxResultsPerSource: 25,
      groups: ["https://www.facebook.com/groups/test"],
      pages: [],
      skills: ["video editing", "Video Editing", "shopify"]
    })
  });

  assert.equal(saved.response.status, 200);
  assert.equal(saved.data.windowMinutes, 7);
  assert.equal(saved.data.minScore, 5);
  assert.equal(saved.data.maxResultsPerSource, 25);
  assert.deepEqual(saved.data.groups, ["https://www.facebook.com/groups/test"]);
  assert.deepEqual(saved.data.skills, ["video editing", "shopify"]);

  const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, "config.json"), "utf8"));
  assert.equal(onDisk.windowMinutes, 7);
  assert.deepEqual(onDisk.sources.groups, ["https://www.facebook.com/groups/test"]);
  assert.deepEqual(onDisk.intent.extra.skills, ["video editing", "shopify"]);

  const stats = await getJson("/api/stats");
  assert.deepEqual(stats.data.skills, ["video editing", "shopify"]);

  const windowOnly = await getJson("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ windowMinutes: 12 })
  });
  assert.equal(windowOnly.response.status, 200);
  assert.deepEqual(windowOnly.data.skills, ["video editing", "shopify"]);
  assert.equal(windowOnly.data.windowMinutes, 12);
});

test("rejects invalid scan windows before starting", async () => {
  for (const windowMinutes of [0, 1441, 1.5, "abc"]) {
    const { response } = await getJson("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ windowMinutes })
    });
    assert.equal(response.status, 400);
  }

  const status = await getJson("/api/scan/status");
  assert.equal(status.data.running, false);
});

test("validates settings and saves the token to .env", async () => {
  const badWindow = await getJson("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ windowMinutes: 0 })
  });
  assert.equal(badWindow.response.status, 400);

  const badUrl = await getJson("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ groups: ["facebook.com/groups/x"] })
  });
  assert.equal(badUrl.response.status, 400);

  const token = "apify_api_12345678901234567890";
  const saved = await getJson("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token })
  });

  assert.equal(saved.response.status, 200);
  assert.equal(saved.data.tokenSet, true);
  assert.ok(saved.data.tokenPreview.includes("..."));

  const env = fs.readFileSync(path.join(tmpDir, ".env"), "utf8");
  assert.match(env, new RegExp(`APIFY_TOKEN=${token}`));
  assert.equal(process.env.APIFY_TOKEN, token);

  const leaked = JSON.stringify(saved.data);
  assert.equal(leaked.includes(token), false);
});

test("rejects malformed contact updates", async () => {
  const bad = await getJson("/api/leads/1001", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contacted: "yes" })
  });
  assert.equal(bad.response.status, 400);

  const missing = await getJson("/api/leads/does-not-exist", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contacted: true })
  });
  assert.equal(missing.response.status, 404);
});
