import { normalizeText } from "./intent.js";

const MIN_FINGERPRINT_TEXT = 40;

function normalizeAuthor(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function number(value) {
  return Number(value) || 0;
}

export function duplicateFingerprint(lead = {}) {
  const text = normalizeText(lead.text);
  if (text.length < MIN_FINGERPRINT_TEXT) return null;
  return `${normalizeAuthor(lead.author)}\u0000${text}`;
}

function rank(lead) {
  return [
    lead.demo ? 0 : 1,
    lead.contacted ? 1 : 0,
    number(lead.score),
    number(lead.postedAtMs),
    number(lead.engagement?.comments),
    number(lead.engagement?.likes)
  ];
}

function compareRank(a, b) {
  const left = rank(a);
  const right = rank(b);
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return right[index] - left[index];
  }
  return 0;
}

function earliest(values) {
  let result = null;
  for (const value of values) {
    const time = Date.parse(value);
    if (!Number.isFinite(time)) continue;
    if (result === null || time < result) result = time;
  }
  return result === null ? null : new Date(result).toISOString();
}

function latest(values) {
  let result = null;
  for (const value of values) {
    const time = Date.parse(value);
    if (!Number.isFinite(time)) continue;
    if (result === null || time > result) result = time;
  }
  return result === null ? null : new Date(result).toISOString();
}

function maxValue(values) {
  return Math.max(0, ...values.map(number));
}

export function mergeDuplicateGroup(group) {
  const keeper = [...group].sort(compareRank)[0];
  const contacted = group.filter((lead) => lead.contacted);
  const services = [
    ...new Set(group.flatMap((lead) => (Array.isArray(lead.services) ? lead.services : [])))
  ];

  return {
    ...keeper,
    score: maxValue(group.map((lead) => lead.score)),
    services,
    engagement: {
      likes: maxValue(group.map((lead) => lead.engagement?.likes)),
      comments: maxValue(group.map((lead) => lead.engagement?.comments)),
      shares: maxValue(group.map((lead) => lead.engagement?.shares)),
      views: maxValue(group.map((lead) => lead.engagement?.views))
    },
    contacted: contacted.length > 0,
    contactedAt: earliest(contacted.map((lead) => lead.contactedAt)),
    demo: group.every((lead) => Boolean(lead.demo)),
    firstSeenAt: earliest(group.map((lead) => lead.firstSeenAt)) ?? keeper.firstSeenAt,
    lastSeenAt: latest(group.map((lead) => lead.lastSeenAt)) ?? keeper.lastSeenAt
  };
}

export function duplicateGroups(leads = []) {
  const groups = new Map();
  for (const lead of leads) {
    const key = duplicateFingerprint(lead);
    if (!key) continue;
    const group = groups.get(key);
    if (group) group.push(lead);
    else groups.set(key, [lead]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

export function countDuplicateLeads(leads = []) {
  return duplicateGroups(leads).reduce((total, group) => total + group.length - 1, 0);
}

export function dedupeLeads(leads = []) {
  const groups = duplicateGroups(leads);
  if (groups.length === 0) return { leads: [...leads], removed: 0, groups: 0 };

  const removeIds = new Set();
  const replacements = new Map();

  for (const group of groups) {
    const merged = mergeDuplicateGroup(group);
    replacements.set(String(merged.id), merged);
    for (const lead of group) {
      if (String(lead.id) !== String(merged.id)) removeIds.add(String(lead.id));
    }
  }

  return {
    leads: leads
      .filter((lead) => !removeIds.has(String(lead.id)))
      .map((lead) => replacements.get(String(lead.id)) ?? lead),
    removed: removeIds.size,
    groups: groups.length
  };
}
