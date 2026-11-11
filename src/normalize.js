function firstNumber(...values) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return 0;
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function fromNumeric(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return raw > 1e12 ? raw : raw * 1000;
}

function fromText(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function parseRelativeTime(value, now = Date.now()) {
  const text = String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (/\b(?:just now|moments? ago|today)\b/.test(text)) return now;
  if (/\byesterday\b/.test(text)) return now - DAY_MS;

  const match = /(\d+)\s*(minute|hour|day|week|month|year)s?\s+ago/.exec(text);
  if (match) {
    const amount = Number(match[1]);
    const unit = match[2];
    const scale = {
      minute: MINUTE_MS,
      hour: HOUR_MS,
      day: DAY_MS,
      week: 7 * DAY_MS,
      month: 30 * DAY_MS,
      year: 365 * DAY_MS
    }[unit];
    return now - amount * scale;
  }

  const short = /(\d+)\s*(m|h|d|w|mo|y)\b/.exec(text);
  if (short) {
    const amount = Number(short[1]);
    const scale = {
      m: MINUTE_MS,
      h: HOUR_MS,
      d: DAY_MS,
      w: 7 * DAY_MS,
      mo: 30 * DAY_MS,
      y: 365 * DAY_MS
    }[short[2]];
    return now - amount * scale;
  }

  return null;
}

function stripHtml(value) {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

function toMs(item) {
  const candidates = [
    item.timestamp,
    item.time,
    item.date,
    item.creation_time,
    item.created_time,
    item.createdAt
  ];

  for (const value of candidates) {
    const numeric = fromNumeric(value);
    if (numeric !== null) return numeric;
    const parsed = fromText(value);
    if (parsed !== null) return parsed;
  }

  if (item.sharedPost) {
    return toMs(item.sharedPost);
  }
  return null;
}

export function normalizeItem(item, sourceKind) {
  if (!item || typeof item !== "object") return null;
  if (item.error) return null;

  const user = item.user ?? item.sharedPost?.user ?? null;
  const text = firstText(
    item.text,
    item.caption,
    item.message,
    item.sharedPost?.text,
    item.sharedPost?.caption,
    item.sharedPost?.message
  );
  const postedAtMs = toMs(item);
  const postUrl = item.url ?? item.postUrl ?? item.topLevelUrl ?? "";
  const id =
    item.postId ??
    item.legacyId ??
    item.id ??
    postUrl ??
    "";

  if (!id && !postUrl) return null;

  const author =
    user?.name ??
    item.authorName ??
    item.pageName ??
    item.groupTitle ??
    "Unknown";
  const sourceName =
    item.groupTitle ?? item.pageName ?? user?.name ?? item.facebookUrl ?? "Unknown";
  const sourceUrl = item.inputUrl ?? item.facebookUrl ?? item.groupUrl ?? "";

  let authorUrl =
    user?.profileUrl ?? user?.url ?? item.authorUrl ?? "";
  if (!authorUrl && user?.id) {
    authorUrl = `https://www.facebook.com/${user.id}`;
  }
  const authorPic = user?.profilePic ?? item.profilePicture ?? "";

  return {
    id: String(id),
    platform: "facebook",
    postedAtMs,
    postedAt: postedAtMs ? new Date(postedAtMs).toISOString() : null,
    text,
    postUrl: String(postUrl),
    author: String(author),
    authorUrl: String(authorUrl),
    authorPic: String(authorPic),
    sourceName: String(sourceName),
    sourceUrl: String(sourceUrl),
    sourceKind,
    likes: firstNumber(item.likes, item.likesCount, item.reactionLikeCount),
    comments: firstNumber(item.comments, item.commentsCount),
    shares: firstNumber(item.shares, item.sharesCount),
    views: firstNumber(item.viewsCount, item.videoViewCount)
  };
}

export function normalizeItems(items, sourceKind) {
  return (Array.isArray(items) ? items : [])
    .map((item) => normalizeItem(item, sourceKind))
    .filter((item) => item !== null);
}

const MAX_LINKEDIN_TEXT = 6000;

function linkedinPostedAtMs(item, now) {
  const posted = item.postedAt;
  const candidates = [];

  if (posted && typeof posted === "object") {
    candidates.push(
      posted.timestamp,
      posted.date,
      posted.postedAgoText,
      posted.postedAgoShort
    );
  } else {
    candidates.push(posted);
  }

  candidates.push(
    item.postedAtTimestamp,
    item.postedAtISO,
    item.publishedAt,
    item.createdAt
  );

  for (const value of candidates) {
    const numeric = fromNumeric(value);
    if (numeric !== null) return numeric;
    const parsed = fromText(value);
    if (parsed !== null) return parsed;
    const relative = parseRelativeTime(value, now);
    if (relative !== null) return relative;
  }

  return null;
}

export function normalizeLinkedInItem(item, { now = Date.now() } = {}) {
  if (!item || typeof item !== "object") return null;
  if (item.error) return null;

  const postUrl = firstText(item.linkedinUrl, item.url, item.postUrl);
  const type = String(item.type ?? "").toLowerCase();
  if (type === "job" || /\/jobs\/view\//i.test(postUrl)) return null;

  const rawId = firstText(item.id, item.postId, item.activityId, postUrl);
  if (!rawId) return null;

  const text = firstText(
    stripHtml(item.content),
    stripHtml(item.text),
    stripHtml(item.commentary),
    stripHtml(item.postText),
    stripHtml(item.repostContent)
  ).slice(0, MAX_LINKEDIN_TEXT);
  if (!text) return null;

  const authorInfo = item.author && typeof item.author === "object" ? item.author : {};
  const author = firstText(
    authorInfo.name,
    item.authorName,
    item.authorFullName,
    "LinkedIn member"
  );
  const authorUrl = firstText(
    authorInfo.linkedinUrl,
    authorInfo.url,
    item.authorProfileUrl,
    ""
  );
  const authorPic = firstText(
    authorInfo.avatar?.url,
    item.authorAvatar,
    item.authorProfilePic,
    ""
  );
  const postedAtMs = linkedinPostedAtMs(item, now);

  const engagement = item.engagement && typeof item.engagement === "object"
    ? item.engagement
    : {};
  const social =
    item.socialContent && typeof item.socialContent === "object"
      ? item.socialContent
      : {};

  return {
    id: `linkedin:${rawId}`,
    platform: "linkedin",
    postedAtMs,
    postedAt: postedAtMs ? new Date(postedAtMs).toISOString() : null,
    text,
    postUrl: String(postUrl),
    author: String(author),
    authorUrl: String(authorUrl),
    authorPic: String(authorPic),
    sourceName: "LinkedIn Posts",
    sourceUrl: String(
      firstText(
        item.searchUrl,
        item.inputUrl,
        postUrl,
        "https://www.linkedin.com/search/results/content/"
      )
    ),
    sourceKind: "linkedin-posts",
    likes: firstNumber(engagement.likes, item.likes, social.likes),
    comments: firstNumber(engagement.comments, item.comments, social.comments),
    shares: firstNumber(engagement.shares, item.shares, social.shares),
    views: firstNumber(engagement.views, item.views, social.views)
  };
}

export function normalizeLinkedInItems(items, { now = Date.now() } = {}) {
  return (Array.isArray(items) ? items : [])
    .map((item) => normalizeLinkedInItem(item, { now }))
    .filter((item) => item !== null);
}

