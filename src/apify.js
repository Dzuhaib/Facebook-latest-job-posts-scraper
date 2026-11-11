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
    usdPer1000: 7
  },
  linkedin: {
    id: "harvestapi/linkedin-post-search",
    label: "LinkedIn posts",
    usdPer1000: 2
  }
};

const DEFAULT_CONCURRENCY = 3;

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

function limitFor(config, url) {
  const value = Number(config.sources?.limits?.[url]);
  if (Number.isInteger(value) && value >= 1 && value <= 1000) return value;
  return config.maxResultsPerSource;
}

function activeSources(config, kind) {
  const disabled = new Set(
    (Array.isArray(config.sources?.disabled) ? config.sources.disabled : []).map(String)
  );
  const urls = Array.isArray(config.sources?.[kind]) ? config.sources[kind] : [];
  return urls.filter((url) => !disabled.has(url));
}

async function runWithLimit(tasks, limit) {
  const results = new Array(tasks.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < tasks.length) {
      const current = cursor;
      cursor += 1;
      try {
        results[current] = { status: "fulfilled", value: await tasks[current]() };
      } catch (reason) {
        results[current] = { status: "rejected", reason };
      }
    }
  };

  const workers = Array.from(
    { length: Math.min(Math.max(1, limit), tasks.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
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
  const tasks = [];

  for (const kind of ["groups", "pages"]) {
    for (const url of activeSources(config, kind)) {
      const perSource = { ...config, maxResultsPerSource: limitFor(config, url) };
      tasks.push(() => runOne(client, kind, [url], perSource, log));
    }
  }

  const concurrency =
    Number.isInteger(config.sources?.concurrency) && config.sources.concurrency > 0
      ? config.sources.concurrency
      : DEFAULT_CONCURRENCY;

  const settled = await runWithLimit(tasks, concurrency);
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

const POSTED_LIMITS = {
  anyTime: "any",
  past24Hours: "24h",
  pastWeek: "week",
  pastMonth: "month"
};

export function linkedinQueries(config) {
  const seen = new Set();
  const queries = [];
  for (const value of config.linkedin?.keywords ?? []) {
    const query = String(value ?? "").replace(/\s+/g, " ").trim();
    if (!query) continue;
    const key = query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    queries.push(query);
  }
  return queries;
}

export function buildLinkedInInput(query, config) {
  return {
    searchQueries: [query],
    maxPosts: config.linkedin?.maxResultsPerKeyword ?? 30,
    postedLimit: POSTED_LIMITS[config.linkedin?.datePosted] ?? "24h",
    sortBy: "date",
    contentType: "all",
    scrapeReactions: false,
    scrapeComments: false
  };
}

function isJobListing(item) {
  if (!item || typeof item !== "object") return true;
  const type = String(item.type ?? "").toLowerCase();
  if (type === "job") return true;
  return /\/jobs\/view\//i.test(String(item.linkedinUrl ?? item.url ?? ""));
}

async function runLinkedInSearch(client, query, config, log) {
  const actorId = config.linkedin?.actorId || ACTORS.linkedin.id;
  const limit = config.linkedin?.maxResultsPerKeyword ?? 30;
  const label = `"${query}"`;

  log(`Starting ${ACTORS.linkedin.label} search ${label}: limit ${limit}/query`);

  const run = await client.actor(actorId).call(buildLinkedInInput(query, config), {
    waitSecs: 900,
    log: null
  });

  if (!run?.defaultDatasetId) {
    throw new Error(`Actor ${actorId} finished without a dataset (status: ${run?.status ?? "unknown"})`);
  }

  const runUrl = `https://console.apify.com/actors/runs/${run.id}`;
  log(`Run ${run.id} ${run.status}. ${runUrl}`);

  if (run.status !== "SUCCEEDED") {
    throw new Error(`Actor ${actorId} run ${run.id} ended with status ${run.status}`);
  }

  const { items } = await client.dataset(run.defaultDatasetId).listItems({
    limit: limit + 100
  });

  const failures = items.filter((item) => item?.error);
  const posts = items.filter((item) => !item?.error && !isJobListing(item));

  if (failures.length > 0) {
    log(`${ACTORS.linkedin.label}: ${failures.length} search(es) returned an error.`);
    for (const failure of failures.slice(0, 10)) {
      const reason = failure.errorDescription ?? failure.error ?? "unknown error";
      log(`  - ${failure.inputUrl ?? label}: ${reason}`);
    }
  }

  log(`${ACTORS.linkedin.label} ${label}: ${posts.length} raw post(s) returned`);

  return {
    kind: "linkedin",
    keyword: query,
    run,
    items: posts,
    failures,
    runUrl
  };
}

export async function fetchLinkedInPosts({ config, token, log = console.log }) {
  if (!config.linkedin?.enabled) {
    return { results: [], errors: [], skipped: true };
  }

  const queries = linkedinQueries(config);
  if (queries.length === 0) {
    return { results: [], errors: [], skipped: true };
  }

  const client = new ApifyClient({ token });
  const tasks = queries.map(
    (query) => () => runLinkedInSearch(client, query, config, log)
  );

  const concurrency =
    Number.isInteger(config.linkedin?.concurrency) && config.linkedin.concurrency > 0
      ? config.linkedin.concurrency
      : 2;

  const settled = await runWithLimit(tasks, concurrency);
  const results = [];
  const errors = [];

  for (const outcome of settled) {
    if (outcome.status === "fulfilled") {
      results.push(outcome.value);
    } else {
      errors.push(outcome.reason);
      log(`LinkedIn search failed: ${outcome.reason?.message ?? outcome.reason}`);
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
    for (const url of activeSources(config, kind)) {
      total += (limitFor(config, url) * ACTORS[kind].usdPer1000) / 1000;
    }
  }

  if (config.linkedin?.enabled) {
    const per1000 = Number.isFinite(Number(config.linkedin.usdPer1000))
      ? Number(config.linkedin.usdPer1000)
      : ACTORS.linkedin.usdPer1000;
    const limit = Number(config.linkedin.maxResultsPerKeyword) || 0;
    total += (linkedinQueries(config).length * limit * per1000) / 1000;
  }

  return total;
}
