import path from "node:path";
import { fetchSourceItems, estimateMaxRunCostUsd } from "./apify.js";
import { normalizeItems } from "./normalize.js";
import { filterPosts } from "./filter.js";
import { createSeenStore } from "./state.js";
import { writeReports, printLeads, formatAge } from "./report.js";
import { loadDryRunPosts } from "./dryrun.js";

export async function collectLeads({
  config,
  token,
  dryRun = false,
  log = console.log,
  now = Date.now(),
  seen = null
}) {
  let posts = [];
  let sourceErrors = 0;
  const sourceIssues = [];

  if (dryRun) {
    posts = loadDryRunPosts({ now });
    log(`DRY RUN: using ${posts.length} bundled sample posts. No Apify credits used.`);
  } else {
    const { results } = await fetchSourceItems({ config, token, log });
    for (const result of results) {
      for (const failure of result.failures ?? []) {
        sourceErrors += 1;
        sourceIssues.push({
          source: failure.inputUrl ?? failure.url ?? "",
          reason: failure.errorDescription ?? failure.error ?? "No posts returned"
        });
      }
      posts.push(...normalizeItems(result.items, result.kind));
    }
    if (sourceErrors > 0) {
      log(
        `${sourceErrors} source(s) returned no posts. Check that each group/page is public and still active.`
      );
    }
  }

  const { leads, freshIds, stats } = filterPosts(posts, { config, now, seen });
  if (dryRun) {
    for (const lead of leads) lead.demo = true;
  }
  stats.fresh = freshIds.length;
  stats.sourceErrors = sourceErrors;
  stats.sourceIssues = sourceIssues.slice(0, 100);

  return { leads, stats, freshIds };
}

export async function runOnce({
  config,
  token,
  dryRun = false,
  log = console.log,
  now = Date.now(),
  seen = null,
  maxDisplay = 20
}) {
  const generatedAt = new Date(now);

  log("");
  log("=== Facebook fresh leads ===");
  log(
    `Window: last ${config.windowMinutes} min | min score ${config.minScore} | ${config.sources.groups.length} group(s), ${config.sources.pages.length} page(s)`
  );

  if (!dryRun) {
    const worstCase = estimateMaxRunCostUsd(config);
    log(
      `Apify pricing: ~$2.60/1,000 group posts, ~$5.00/1,000 page posts. Worst case this run: ~$${worstCase.toFixed(2)} (usually far less with a ${config.windowMinutes}m filter).`
    );
  }

  const store = seen ?? createSeenStore(config.cwd, { enabled: !dryRun });
  const { leads, stats, freshIds } = await collectLeads({
    config,
    token,
    dryRun,
    log,
    now,
    seen: store
  });

  const reportConfig = dryRun
    ? {
        ...config,
        output: {
          ...config.output,
          dir: path.join(config.output.dir, "dry-run"),
          keepJsonl: false
        }
      }
    : config;

  const report = writeReports({
    config: reportConfig,
    leads,
    stats,
    generatedAt
  });

  if (!dryRun) {
    for (const lead of leads) store.add(lead.id, now);
    store.save();
  }

  log(
    `Summary: ${stats.examined} raw | ${stats.fresh} fresh | ${leads.length} lead(s) | ${stats.duplicate} duplicate(s) | ${stats.outsideWindow} outside window | ${stats.irrelevant} irrelevant | ${stats.sourceErrors} source error(s)`
  );

  printLeads(leads, { log, max: maxDisplay });

  log("");
  log(`Output: ${report.jsonPath}`);
  log(`CSV:    ${report.csvPath}`);
  log(`Report: ${report.mdPath}`);
  if (report.jsonlPath) log(`Append: ${report.jsonlPath}`);
  log(`Latest: ${report.latestJson}`);

  if (leads.length > 0) {
    log(
      `Newest lead age: ${formatAge(Math.min(...leads.map((lead) => lead.ageMinutes)))}.`
    );
  }

  return { leads, stats, report, freshIds };
}
