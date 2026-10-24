import fs from "node:fs";
import path from "node:path";

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 20000;

export class SeenStore {
  constructor(filePath = null, options = {}) {
    this.filePath = filePath;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.ids = new Map();
    this.loaded = false;
  }

  load() {
    if (this.loaded) return this;
    this.loaded = true;
    if (!this.filePath || !fs.existsSync(this.filePath)) return this;

    try {
      const data = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      for (const [id, ts] of Object.entries(data.ids ?? {})) {
        if (Number.isFinite(Number(ts))) this.ids.set(id, Number(ts));
      }
    } catch {
      this.ids = new Map();
    }
    return this;
  }

  has(id) {
    return this.ids.has(String(id));
  }

  add(id, at = Date.now()) {
    this.ids.set(String(id), at);
  }

  prune(now = Date.now()) {
    const cutoff = now - this.ttlMs;
    for (const [id, ts] of this.ids) {
      if (ts < cutoff) this.ids.delete(id);
    }

    if (this.ids.size > this.maxEntries) {
      const sorted = [...this.ids.entries()].sort((a, b) => b[1] - a[1]);
      this.ids = new Map(sorted.slice(0, this.maxEntries));
    }
  }

  save() {
    if (!this.filePath) return;
    this.prune();
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const payload = {
      version: 1,
      updatedAt: new Date().toISOString(),
      ids: Object.fromEntries(this.ids)
    };
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload), "utf8");
    fs.renameSync(tmp, this.filePath);
  }
}

export function createSeenStore(cwd, { enabled = true } = {}) {
  if (!enabled) return new SeenStore(null);
  return new SeenStore(path.join(cwd, ".state", "seen.json")).load();
}
