import express from "express";
import path from "node:path";
import { LeadStore } from "./store.js";
import { getSettings, saveSettings, testToken } from "./settings.js";
import { loadConfig, loadToken, assertSources } from "../src/config.js";
import { collectLeads } from "../src/run.js";
import { notifyNewLeads } from "../src/notify.js";

function publicScanState(scan) {
  return {
    running: scan.running,
    startedAt: scan.startedAt,
    finishedAt: scan.finishedAt,
    error: scan.error,
    result: scan.result,
    demo: scan.demo,
    windowMinutes: scan.windowMinutes,
    logs: scan.logs.slice(-12)
  };
}

export function createApp({
  cwd = process.cwd(),
  store = null,
  publicDir = null,
  logger = console
} = {}) {
  const app = express();
  let startupConfig = null;
  try {
    startupConfig = loadConfig({ cwd });
  } catch {
    startupConfig = null;
  }
  const leadStore =
    store ??
    new LeadStore(path.join(cwd, "data", "leads.json"), {
      retentionHours: startupConfig?.retentionHours ?? 0
    });
  const uiDir = publicDir ?? path.join(cwd, "public");

  if (startupConfig) {
    try {
      const result = leadStore.revalidate({
        config: startupConfig,
        log: (message) => logger.log?.(`[store] ${message}`)
      });
      if (result.removed || result.updated) {
        logger.log?.(
          `[store] Re-validated saved leads: ${result.removed} removed, ${result.updated} updated`
        );
      }
    } catch {
      /* keep the dashboard usable if re-validation fails */
    }
  }

  const scan = {
    running: false,
    startedAt: null,
    finishedAt: null,
    error: null,
    result: null,
    demo: false,
    windowMinutes: null,
    logs: []
  };

  function pushLog(message) {
    const entry = { at: new Date().toISOString(), message: String(message) };
    scan.logs.push(entry);
    if (scan.logs.length > 60) scan.logs.shift();
    logger.log(`[scan] ${entry.message}`);
  }

  function startScan({ demo = false, windowMinutes = null } = {}) {
    if (scan.running) return false;

    scan.running = true;
    scan.startedAt = new Date().toISOString();
    scan.finishedAt = null;
    scan.error = null;
    scan.result = null;
    scan.demo = demo;
    scan.windowMinutes = windowMinutes;
    scan.logs = [];
    pushLog(demo ? "Starting demo scan..." : "Starting scan...");

    (async () => {
      try {
        const config = loadConfig({ cwd });
        if (Number.isInteger(windowMinutes)) {
          config.windowMinutes = windowMinutes;
        }
        scan.windowMinutes = config.windowMinutes;
        if (!demo) assertSources(config);
        const token = demo ? null : loadToken();

        const { leads, stats } = await collectLeads({
          config,
          token,
          dryRun: demo,
          log: pushLog
        });

        const existingIds = new Set([...leadStore.leads.keys()].map(String));
        const merge = leadStore.upsertMany(leads);
        leadStore.setLastScanAt(new Date().toISOString());

        let revalidation = { removed: 0, updated: 0 };
        try {
          revalidation = leadStore.revalidate({ config, log: pushLog });
        } catch {
          /* re-validation is best-effort */
        }

        scan.result = {
          ...stats,
          leads: leads.length,
          added: merge.added,
          updated: merge.updated,
          revalidation,
          demo
        };

        if (!demo) {
          const newLeads = leads.filter(
            (lead) =>
              !existingIds.has(String(lead.id)) && Boolean(leadStore.get(lead.id))
          );
          notifyNewLeads(newLeads, { config, log: pushLog }).catch(() => {});
        }
        const sourceErrors = stats.sourceErrors ?? 0;
        pushLog(
          `Done: ${merge.added} new, ${merge.updated} updated, ${sourceErrors} source error(s).`
        );
        if (leads.length === 0 && sourceErrors > 0) {
          pushLog(
            "No leads because some sources returned no results. Use public, active groups/pages, check the LinkedIn searches, and review the errors above."
          );
        }
      } catch (error) {
        scan.error = error.message;
        pushLog(`Error: ${error.message}`);
      } finally {
        scan.running = false;
        scan.finishedAt = new Date().toISOString();
      }
    })();

    return true;
  }

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use((req, res, next) => {
    const uiHost = (process.env.UI_HOST ?? "127.0.0.1").toLowerCase();
    const loopback = uiHost === "127.0.0.1" || uiHost === "localhost" || uiHost === "::1";
    if (!loopback || process.env.UI_ALLOW_ANY_HOST === "1") return next();

    const host = String(req.headers.host ?? "")
      .toLowerCase()
      .replace(/:\d+$/, "");
    const allowed = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
    if (!allowed.has(host)) {
      return res.status(403).json({ error: "Forbidden host" });
    }
    return next();
  });
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        "default-src 'self'; img-src 'self' data: https:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
    });
    next();
  });
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  app.get("/api/leads", (req, res) => {
    res.json(leadStore.query(req.query));
  });

  app.delete("/api/leads/demo", (req, res) => {
    const removed = leadStore.removeDemo();
    res.json({ removed });
  });

  app.delete("/api/leads/duplicates", (req, res) => {
    res.json(leadStore.removeDuplicates());
  });

  app.delete("/api/leads/:id", (req, res) => {
    const block = String(req.query.block ?? req.body?.block ?? "").toLowerCase();
    if (!["", "post", "author", "source"].includes(block)) {
      return res.status(400).json({ error: "block must be post, author, or source" });
    }
    const result = leadStore.remove(req.params.id, { block });
    if (!result) return res.status(404).json({ error: "Lead not found" });
    return res.json(result);
  });

  app.patch("/api/leads/:id", (req, res) => {
    const { contacted } = req.body ?? {};
    if (typeof contacted !== "boolean") {
      return res.status(400).json({ error: "contacted must be true or false" });
    }
    const lead = leadStore.update(req.params.id, { contacted });
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    return res.json({ lead });
  });

  app.get("/api/stats", (req, res) => {
    let skills = [];
    try {
      skills = getSettings(cwd).skills;
    } catch {
      /* keep stats available even if config is broken */
    }
    res.json({ ...leadStore.stats(), skills, scan: publicScanState(scan) });
  });

  app.post("/api/scan", (req, res) => {
    const rawWindow = req.body?.windowMinutes;
    let windowMinutes = null;

    if (rawWindow !== undefined && rawWindow !== null && rawWindow !== "") {
      const parsed = Number(rawWindow);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1440) {
        return res.status(400).json({
          error: "windowMinutes must be a whole number between 1 and 1440"
        });
      }
      windowMinutes = parsed;
    }

    const started = startScan({ demo: false, windowMinutes });
    res.status(started ? 202 : 409).json({
      started,
      ...(started ? {} : { error: "A scan is already running" }),
      status: publicScanState(scan)
    });
  });

  app.post("/api/demo", (req, res) => {
    const started = startScan({ demo: true });
    res.status(started ? 202 : 409).json({
      started,
      ...(started ? {} : { error: "A scan is already running" }),
      status: publicScanState(scan)
    });
  });

  app.get("/api/scan/status", (req, res) => {
    res.json(publicScanState(scan));
  });

  app.get("/api/settings", (req, res, next) => {
    try {
      res.json(getSettings(cwd));
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/settings", (req, res) => {
    try {
      res.json(saveSettings(cwd, req.body ?? {}));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/settings/test", async (req, res) => {
    try {
      const info = await testToken(cwd, req.body?.token);
      res.json({ ok: true, ...info });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.use("/api", (req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use(express.static(uiDir, { index: "index.html" }));

  app.use((req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use((error, req, res, next) => {
    logger.error?.(error);
    if (res.headersSent) return next(error);
    res.status(error.status ?? 500).json({ error: error.message ?? "Internal error" });
  });

  return { app, store: leadStore, scan };
}
