import fs from "node:fs";
import path from "node:path";
import { ageMinutes } from "../src/filter.js";
import { DEMO_POST_IDS } from "../src/dryrun.js";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_LEADS = 20000;

const STATUSES = new Set(["all", "new", "contacted"]);
const SORTS = new Set(["newest", "oldest", "score"]);

function asInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function selectedServices(params) {
  const raw = [];
  if (Array.isArray(params.services)) raw.push(...params.services);
  else if (params.services !== undefined) raw.push(...String(params.services).split(","));
  if (params.service !== undefined) raw.push(String(params.service));

  return [
    ...new Set(
      raw
        .map((value) => String(value).trim().toLowerCase())
        .filter((value) => value && value !== "all")
    )
  ].slice(0, 50);
}

function isoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function toClient(lead, now) {
  return {
    id: lead.id,
    postedAt: lead.postedAt,
    postedAtMs: lead.postedAtMs,
    ageMinutes: ageMinutes(lead.postedAtMs, now),
    score: lead.score,
    services: lead.services,
    author: lead.author,
    authorUrl: lead.authorUrl,
    authorPic: lead.authorPic,
    sourceName: lead.sourceName,
    sourceUrl: lead.sourceUrl,
    sourceKind: lead.sourceKind,
    postUrl: lead.postUrl,
    text: lead.text,
    engagement: lead.engagement,
    contacted: lead.contacted,
    contactedAt: lead.contactedAt,
    demo: Boolean(lead.demo),
    firstSeenAt: lead.firstSeenAt,
    lastSeenAt: lead.lastSeenAt
  };
}

function cleanLead(lead, nowIso) {
  if (!lead || typeof lead !== "object") return null;

  const postedAtMs = Number(lead.postedAtMs);
  if (!Number.isFinite(postedAtMs)) return null;

  const id = String(lead.id ?? "").trim();
  if (!id) return null;

  return {
    id,
    postedAt: isoOrNull(lead.postedAt) ?? new Date(postedAtMs).toISOString(),
    postedAtMs,
    score: Number(lead.score) || 0,
    services: Array.isArray(lead.services) ? [...new Set(lead.services.map(String))] : [],
    author: String(lead.author ?? "Unknown"),
    authorUrl: String(lead.authorUrl ?? ""),
    authorPic: String(lead.authorPic ?? ""),
    sourceName: String(lead.sourceName ?? "Unknown"),
    sourceUrl: String(lead.sourceUrl ?? ""),
    sourceKind: String(lead.sourceKind ?? ""),
    postUrl: String(lead.postUrl ?? ""),
    text: String(lead.text ?? ""),
    engagement: {
      likes: Number(lead.engagement?.likes) || 0,
      comments: Number(lead.engagement?.comments) || 0,
      shares: Number(lead.engagement?.shares) || 0,
      views: Number(lead.engagement?.views) || 0
    },
    contacted: false,
    contactedAt: null,
    demo: Boolean(lead.demo),
    firstSeenAt: nowIso,
    lastSeenAt: nowIso
  };
}

export class LeadStore {
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.maxLeads = options.maxLeads ?? MAX_LEADS;
    this.leads = new Map();
    this.lastScanAt = null;
    this.load();
  }

  load() {
    if (!this.filePath || !fs.existsSync(this.filePath)) return this;
    try {
      const data = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      this.lastScanAt = isoOrNull(data.lastScanAt);
      for (const lead of Array.isArray(data.leads) ? data.leads : []) {
        if (lead && lead.id && Number.isFinite(Number(lead.postedAtMs))) {
          this.leads.set(String(lead.id), {
            ...lead,
            contacted: Boolean(lead.contacted),
            contactedAt: isoOrNull(lead.contactedAt),
            demo: lead.demo === true || DEMO_POST_IDS.has(String(lead.id))
          });
        }
      }
    } catch {
      this.leads = new Map();
      this.lastScanAt = null;
    }
    return this;
  }

  save() {
    if (!this.filePath) return;
    this.prune();
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const payload = {
      version: 1,
      updatedAt: new Date().toISOString(),
      lastScanAt: this.lastScanAt,
      leads: [...this.leads.values()]
    };
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload), "utf8");
    fs.renameSync(tmp, this.filePath);
  }

  prune() {
    if (this.leads.size <= this.maxLeads) return;
    const sorted = [...this.leads.values()].sort(
      (a, b) => b.postedAtMs - a.postedAtMs
    );
    this.leads = new Map(sorted.slice(0, this.maxLeads).map((lead) => [lead.id, lead]));
  }

  get(id) {
    return this.leads.get(String(id)) ?? null;
  }

  upsertMany(leads, now = Date.now()) {
    const nowIso = new Date(now).toISOString();
    let added = 0;
    let updated = 0;

    for (const lead of Array.isArray(leads) ? leads : []) {
      const clean = cleanLead(lead, nowIso);
      if (!clean) continue;

      const existing = this.leads.get(clean.id);
      if (!existing) {
        this.leads.set(clean.id, clean);
        added += 1;
        continue;
      }

      this.leads.set(clean.id, {
        ...existing,
        postedAt: clean.postedAt,
        postedAtMs: clean.postedAtMs,
        score: clean.score,
        services: clean.services,
        author: clean.author,
        authorUrl: clean.authorUrl,
        authorPic: clean.authorPic,
        sourceName: clean.sourceName,
        sourceUrl: clean.sourceUrl,
        sourceKind: clean.sourceKind,
        postUrl: clean.postUrl,
        text: clean.text,
        engagement: clean.engagement,
        demo: clean.demo,
        lastSeenAt: nowIso
      });
      updated += 1;
    }

    if (added > 0 || updated > 0) this.save();
    return { added, updated };
  }

  removeDemo() {
    let removed = 0;
    for (const [id, lead] of this.leads) {
      if (lead.demo) {
        this.leads.delete(id);
        removed += 1;
      }
    }
    if (removed > 0) this.save();
    return removed;
  }

  update(id, patch = {}) {
    const key = String(id);
    const existing = this.leads.get(key);
    if (!existing) return null;

    if (typeof patch.contacted === "boolean") {
      existing.contacted = patch.contacted;
      existing.contactedAt = patch.contacted
        ? existing.contactedAt ?? new Date().toISOString()
        : null;
    }

    this.leads.set(key, existing);
    this.save();
    return toClient(existing, Date.now());
  }

  setLastScanAt(value = new Date()) {
    this.lastScanAt = isoOrNull(value) ?? new Date().toISOString();
    this.save();
  }

  stats(now = Date.now()) {
    let contacted = 0;
    let demo = 0;
    const services = {};
    let newest = null;

    for (const lead of this.leads.values()) {
      if (lead.contacted) contacted += 1;
      if (lead.demo) demo += 1;
      for (const service of lead.services) {
        services[service] = (services[service] ?? 0) + 1;
      }
      if (!newest || lead.postedAtMs > newest) newest = lead.postedAtMs;
    }

    const total = this.leads.size;
    return {
      total,
      new: total - contacted,
      contacted,
      demo,
      services,
      lastScanAt: this.lastScanAt,
      newestLeadAt: newest ? new Date(newest).toISOString() : null,
      now
    };
  }

  query(params = {}, now = Date.now()) {
    const status = STATUSES.has(params.status) ? params.status : "all";
    const services = selectedServices(params);
    const sort = SORTS.has(params.sort) ? params.sort : "newest";
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, asInt(params.pageSize, DEFAULT_PAGE_SIZE))
    );
    const requestedPage = Math.max(1, asInt(params.page, 1));
    const q = String(params.q ?? "").trim().toLowerCase().slice(0, 200);
    const maxAgeMinutes = asInt(params.maxAgeMinutes, 0);

    let items = [...this.leads.values()];

    if (status === "new") items = items.filter((lead) => !lead.contacted);
    if (status === "contacted") items = items.filter((lead) => lead.contacted);
    if (services.length > 0) {
      const needles = new Set(services);
      items = items.filter((lead) =>
        lead.services.some((item) => needles.has(String(item).toLowerCase()))
      );
    }
    if (maxAgeMinutes > 0) {
      const maxAgeMs = maxAgeMinutes * 60 * 1000;
      items = items.filter((lead) => now - lead.postedAtMs <= maxAgeMs);
    }
    if (q) {
      items = items.filter((lead) => {
        return (
          lead.text.toLowerCase().includes(q) ||
          lead.author.toLowerCase().includes(q) ||
          lead.sourceName.toLowerCase().includes(q) ||
          lead.postUrl.toLowerCase().includes(q)
        );
      });
    }

    items.sort((a, b) => {
      if (sort === "oldest") return a.postedAtMs - b.postedAtMs;
      if (sort === "score") {
        return b.score - a.score || b.postedAtMs - a.postedAtMs;
      }
      return b.postedAtMs - a.postedAtMs;
    });

    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const start = (page - 1) * pageSize;
    const slice = items.slice(start, start + pageSize).map((lead) => toClient(lead, now));

    return {
      items: slice,
      total,
      page,
      pageSize,
      totalPages,
      hasPrev: page > 1,
      hasNext: page < totalPages
    };
  }
}
