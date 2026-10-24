import { scorePost } from "./intent.js";
import { duplicateFingerprint } from "./duplicates.js";

const FUTURE_SKEW_MS = 5 * 60 * 1000;

export function ageMinutes(postedAtMs, now = Date.now()) {
  if (!Number.isFinite(postedAtMs)) return null;
  return Math.max(0, Math.round(((now - postedAtMs) / 60000) * 10) / 10);
}

export function isFresh(post, { windowMinutes, now = Date.now() } = {}) {
  if (!Number.isFinite(post.postedAtMs)) return false;
  const age = now - post.postedAtMs;
  if (age < -FUTURE_SKEW_MS) return false;
  return age <= windowMinutes * 60 * 1000;
}

export function filterPosts(
  posts,
  { config, now = Date.now(), seen = null }
) {
  const stats = {
    examined: 0,
    skippedNoTimestamp: 0,
    outsideWindow: 0,
    duplicate: 0,
    irrelevant: 0,
    leads: 0
  };

  const leads = [];
  const freshIds = [];
  const fingerprints = new Set();

  for (const post of posts) {
    stats.examined += 1;

    if (!Number.isFinite(post.postedAtMs)) {
      stats.skippedNoTimestamp += 1;
      continue;
    }

    if (!isFresh(post, { windowMinutes: config.windowMinutes, now })) {
      stats.outsideWindow += 1;
      continue;
    }

    freshIds.push(post.id);

    if (seen?.has(post.id)) {
      stats.duplicate += 1;
      continue;
    }

    const intent = scorePost(post.text, {
      extra: config.intent?.extra,
      minScore: config.minScore
    });

    const age = ageMinutes(post.postedAtMs, now);
    if (age !== null && age > config.windowMinutes) {
      stats.outsideWindow += 1;
      continue;
    }

    if (!intent.isLead) {
      stats.irrelevant += 1;
      continue;
    }

    const fingerprint = duplicateFingerprint(post);
    if (fingerprint && fingerprints.has(fingerprint)) {
      stats.duplicate += 1;
      continue;
    }
    if (fingerprint) fingerprints.add(fingerprint);

    leads.push({
      id: post.id,
      postedAt: post.postedAt,
      postedAtMs: post.postedAtMs,
      ageMinutes: age,
      score: intent.score,
      services: intent.services,
      matched: intent.matched,
      author: post.author,
      sourceName: post.sourceName,
      sourceUrl: post.sourceUrl,
      sourceKind: post.sourceKind,
      postUrl: post.postUrl,
      text: post.text,
      engagement: {
        likes: post.likes,
        comments: post.comments,
        shares: post.shares,
        views: post.views
      }
    });
  }

  leads.sort((a, b) => b.score - a.score || b.postedAtMs - a.postedAtMs);
  stats.leads = leads.length;

  return { leads, freshIds, stats };
}
