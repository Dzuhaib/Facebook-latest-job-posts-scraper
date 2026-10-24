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

function toMs(item) {
  const raw = Number(item.timestamp);
  if (Number.isFinite(raw) && raw > 0) {
    return raw > 1e12 ? raw : raw * 1000;
  }
  if (typeof item.time === "number" && Number.isFinite(item.time) && item.time > 0) {
    return item.time > 1e12 ? item.time : item.time * 1000;
  }
  if (typeof item.time === "string") {
    const ms = Date.parse(item.time);
    if (Number.isFinite(ms)) return ms;
  }
  if (typeof item.date === "string") {
    const ms = Date.parse(item.date);
    if (Number.isFinite(ms)) return ms;
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
