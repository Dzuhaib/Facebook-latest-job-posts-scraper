import { scorePost } from "./intent.js";
import { duplicateFingerprint, isNearDuplicate } from "./duplicates.js";

const FUTURE_SKEW_MS = 5 * 60 * 1000;

function platformOf(post) {
  return post?.platform === "linkedin" ? "linkedin" : "facebook";
}

function emptyPlatformStats() {
  return {
    examined: 0,
    skippedNoTimestamp: 0,
    outsideWindow: 0,
    duplicate: 0,
    irrelevant: 0,
    leads: 0
  };
}

function windowFor(platform, config) {
  if (platform === "linkedin") {
    const value = Number(config.linkedin?.windowMinutes);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return config.windowMinutes;
}

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
    leads: 0,
    byPlatform: {
      facebook: emptyPlatformStats(),
      linkedin: emptyPlatformStats()
    }
  };

  const leads = [];
  const freshIds = [];
  const fingerprints = new Set();
  const byAuthor = new Map();

  for (const post of posts) {
    const platform = platformOf(post);
    const platformStats = stats.byPlatform[platform];
    const windowMinutes = windowFor(platform, config);

    stats.examined += 1;
    platformStats.examined += 1;

    if (!Number.isFinite(post.postedAtMs)) {
      stats.skippedNoTimestamp += 1;
      platformStats.skippedNoTimestamp += 1;
      continue;
    }

    if (!isFresh(post, { windowMinutes, now })) {
      stats.outsideWindow += 1;
      platformStats.outsideWindow += 1;
      continue;
    }

    freshIds.push(post.id);

    if (seen?.has(post.id)) {
      stats.duplicate += 1;
      platformStats.duplicate += 1;
      continue;
    }

    const minScore =
      platform === "linkedin"
        ? config.linkedin?.minScore ?? config.minScore
        : config.minScore;
    const intent = scorePost(post.text, {
      extra: config.intent?.extra,
      minScore
    });

    const age = ageMinutes(post.postedAtMs, now);
    if (age !== null && age > windowMinutes) {
      stats.outsideWindow += 1;
      platformStats.outsideWindow += 1;
      continue;
    }

    if (!intent.isLead) {
      stats.irrelevant += 1;
      platformStats.irrelevant += 1;
      continue;
    }

    const fingerprint = duplicateFingerprint(post);
    if (fingerprint && fingerprints.has(fingerprint)) {
      stats.duplicate += 1;
      platformStats.duplicate += 1;
      continue;
    }

    const authorKey = `${platform}|${String(post.author ?? "").trim().toLowerCase()}`;
    const authorPosts = byAuthor.get(authorKey) ?? [];
    const nearDuplicate = authorPosts.some((existing) => isNearDuplicate(existing, post));
    if (nearDuplicate) {
      stats.duplicate += 1;
      platformStats.duplicate += 1;
      continue;
    }

    if (fingerprint) fingerprints.add(fingerprint);
    authorPosts.push(post);
    byAuthor.set(authorKey, authorPosts);

    leads.push({
      id: post.id,
      platform,
      postedAt: post.postedAt,
      postedAtMs: post.postedAtMs,
      ageMinutes: age,
      score: intent.score,
      services: intent.services,
      matched: intent.matched,
      breakdown: intent.breakdown,
      author: post.author,
      authorUrl: post.authorUrl,
      authorPic: post.authorPic,
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
    platformStats.leads += 1;
  }

  leads.sort((a, b) => b.score - a.score || b.postedAtMs - a.postedAtMs);
  stats.leads = leads.length;

  return { leads, freshIds, stats };
}
