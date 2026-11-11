import path from "node:path";
import {
  fetchSourceItems,
  fetchLinkedInPosts,
  estimateMaxRunCostUsd,
  ACTORS
} from "./apify.js";
import { normalizeItems, normalizeLinkedInItems } from "./normalize.js";
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
  let linkedinSearches = 0;
  const sourceIssues = [];

  if (dryRun) {
    posts = loadDryRunPosts({ now });
    log(`DRY RUN: using ${posts.length} bundled sample posts. No Apify credits used.`);
  } else {
    const [facebookOutcome, linkedinOutcome] = await Promise.allSettled([
      fetchSourceItems({ config, token, log }),
      fetchLinkedInPosts({ config, token, log })
    ]);

    const facebook =
      facebookOutcome.status === "fulfilled"
        ? facebookOutcome.value
        : { results: [], errors: [facebookOutcome.reason] };
    const linkedin =
      linkedinOutcome.status === "fulfilled"
        ? linkedinOutcome.value
        : { results: [], errors: [linkedinOutcome.reason], skipped: false };

    const facebookFailed = facebookOutcome.status === "rejected";
    const linkedinFailed = linkedinOutcome.status === "rejected";
    if (facebookFailed && (!config.linkedin?.enabled || linkedinFailed)) {
      throw facebookOutcome.reason;
    }

    if (facebookFailed) {
      const reason = facebook.errors[0]?.message ?? String(facebook.errors[0]);
      sourceErrors += 1;
      sourceIssues.push({ source: "Facebook", reason });
      log(`Facebook fetch failed: ${reason}`);
    }
    if (linkedinFailed) {
      log(`LinkedIn fetch failed: ${linkedin.errors[0]?.message ?? linkedin.errors[0]}`);
    }

    let facebookPosts = 0;
    for (const result of facebook.results) {
      for (const failure of result.failures ?? []) {
        sourceErrors += 1;
        sourceIssues.push({
          source: failure.inputUrl ?? failure.url ?? "",
          reason: failure.errorDescription ?? failure.error ?? "No posts returned"
        });
      }
      const normalized = normalizeItems(result.items, result.kind);
      facebookPosts += normalized.length;
      posts.push(...normalized);
    }

    let linkedinPosts = 0;
    linkedinSearches = linkedin.results.length;
    for (const result of linkedin.results) {
      for (const failure of result.failures ?? []) {
        sourceErrors += 1;
        sourceIssues.push({
          source: `LinkedIn: ${result.keyword}`,
          reason: failure.errorDescription ?? failure.error ?? "No posts returned"
        });
      }
      const normalized = normalizeLinkedInItems(result.items, { now });
      linkedinPosts += normalized.length;
      posts.push(...normalized);
    }

    for (const error of linkedin.errors ?? []) {
      sourceErrors += 1;
      sourceIssues.push({
        source: "LinkedIn Posts",
        reason: error?.message ?? String(error)
      });
    }

    if (!config.linkedin?.enabled) {
      log(`Collected ${facebookPosts} Facebook post(s).`);
    } else {
      log(`Collected ${facebookPosts} Facebook post(s) and ${linkedinPosts} LinkedIn post(s).`);
    }

    if (sourceErrors > 0) {
      log(
        `${sourceErrors} source(s) returned no results. Check that each group/page is public and still active, and that LinkedIn searches succeeded.`
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
  stats.linkedinSearches = linkedinSearches;

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
  log(
    config.linkedin?.enabled
      ? "=== Facebook + LinkedIn fresh leads ==="
      : "=== Facebook fresh leads ==="
  );
  const linkedinBits = config.linkedin?.enabled
    ? ` | LinkedIn: last ${config.linkedin.windowMinutes} min, ${config.linkedin.keywords.length} quer${config.linkedin.keywords.length === 1 ? "y" : "ies"}`
    : "";
  log(
    `Window: last ${config.windowMinutes} min | min score ${config.minScore} | ${config.sources.groups.length} group(s), ${config.sources.pages.length} page(s)${linkedinBits}`
  );

  if (!dryRun) {
    const worstCase = estimateMaxRunCostUsd(config);
    const linkedinPrice = config.linkedin?.usdPer1000 ?? ACTORS.linkedin.usdPer1000;
    log(
      `Apify pricing: ~$${ACTORS.groups.usdPer1000.toFixed(2)}/1,000 group posts, ~$${ACTORS.pages.usdPer1000.toFixed(2)}/1,000 page posts, ~$${Number(linkedinPrice).toFixed(2)}/1,000 LinkedIn posts. Worst case this run: ~$${worstCase.toFixed(2)} (usually far less with the window filters).`
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
  if (config.linkedin?.enabled) {
    log(
      `By platform: Facebook ${stats.byPlatform.facebook.leads} lead(s) from ${stats.byPlatform.facebook.examined} post(s) | LinkedIn ${stats.byPlatform.linkedin.leads} post(s) from ${stats.byPlatform.linkedin.examined} post(s) across ${stats.linkedinSearches ?? 0} search(es)`
    );
  }

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
