import { ApifyClient } from "apify-client";

export const ACTORS = {
  groups: {
    id: "apify/facebook-groups-scraper",
    label: "Facebook public groups",
    usdPer1000: 2.6
  },
  pages: {
    id: "apify/facebook-posts-scraper",
    label: "Facebook pages",
    usdPer1000: 5
  }
};

export function buildInput(kind, urls, config) {
  const newerThan = `${config.windowMinutes} minutes`;
  const startUrls = urls.map((url) => ({ url }));

  if (kind === "groups") {
    return {
      startUrls,
      resultsLimit: config.maxResultsPerSource,
      viewOption: "CHRONOLOGICAL",
      onlyPostsNewerThan: newerThan
    };
  }

  return {
    startUrls,
    resultsLimit: config.maxResultsPerSource,
    captionText: false,
    onlyPostsNewerThan: newerThan
  };
}

export async function runOne(client, kind, urls, config, log) {
  const actor = ACTORS[kind];
  const input = buildInput(kind, urls, config);

  log(`Starting ${actor.label}: ${urls.length} URL(s), limit ${config.maxResultsPerSource}/source, newer than ${config.windowMinutes}m`);

  const run = await client.actor(actor.id).call(input, { waitSecs: 900, log: null });

  if (!run?.defaultDatasetId) {
    throw new Error(`Actor ${actor.id} finished without a dataset (status: ${run?.status ?? "unknown"})`);
  }

  const runUrl = `https://console.apify.com/actors/runs/${run.id}`;
  log(`Run ${run.id} ${run.status}. ${runUrl}`);

  if (run.status !== "SUCCEEDED") {
    throw new Error(`Actor ${actor.id} run ${run.id} ended with status ${run.status}`);
  }

  const { items } = await client.dataset(run.defaultDatasetId).listItems({
    limit: config.maxResultsPerSource * urls.length + 100
  });

  const posts = items.filter((item) => !item?.error);
  const failures = items.filter((item) => item?.error);

  if (failures.length > 0) {
    log(
      `${actor.label}: ${failures.length} source(s) returned no posts (private, empty, or unavailable).`
    );
    for (const failure of failures.slice(0, 10)) {
      const source = failure.inputUrl ?? failure.url ?? "unknown source";
      const reason = failure.errorDescription ?? failure.error ?? "unknown error";
      log(`  - ${source}: ${reason}`);
    }
    if (failures.length > 10) {
      log(`  - ...and ${failures.length - 10} more source error(s)`);
    }
  }

  log(`${actor.label}: ${posts.length} raw post(s) returned`);

  return { kind, urls, run, items: posts, failures, runUrl };
}

export async function fetchSourceItems({ config, token, log = console.log }) {
  const client = new ApifyClient({ token });
  const jobs = [];

  if (config.sources.groups.length > 0) {
    jobs.push(runOne(client, "groups", config.sources.groups, config, log));
  }
  if (config.sources.pages.length > 0) {
    jobs.push(runOne(client, "pages", config.sources.pages, config, log));
  }

  const settled = await Promise.allSettled(jobs);
  const results = [];
  const errors = [];

  for (const outcome of settled) {
    if (outcome.status === "fulfilled") {
      results.push(outcome.value);
    } else {
      errors.push(outcome.reason);
      log(`Source failed: ${outcome.reason?.message ?? outcome.reason}`);
    }
  }

  if (results.length === 0 && errors.length > 0) {
    throw errors[0];
  }

  return { results, errors };
}

export function estimateMaxRunCostUsd(config) {
  let total = 0;
  for (const kind of ["groups", "pages"]) {
    const count = config.sources[kind].length;
    total += (count * config.maxResultsPerSource * ACTORS[kind].usdPer1000) / 1000;
  }
  return total;
}
