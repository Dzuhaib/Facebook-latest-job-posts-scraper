import { DEFAULT_LEXICON } from "./lexicon.js";

const SERVICE_WEIGHT = 2;
const SERVICE_CAP = 6;
const NEED_WEIGHT = 2;
const NEED_CAP = 4;
const HIRING_WEIGHT = 2;
const HIRING_CAP = 4;
const PHRASE_WEIGHT = 3;
const PHRASE_CAP = 6;
const NEGATIVE_WEIGHT = 3;
const NEGATIVE_CAP = 12;
const NOISE_WEIGHT = 2;
const PROXIMITY_CHARS = 200;

const WEAK_NEED = new Set([
  "budget",
  "quote",
  "quotes",
  "proposal",
  "rfp",
  "urgent",
  "asap",
  "deadline",
  "suggestions"
]);

const SELLER_PATTERNS = [
  {
    name: "self-identified provider",
    pattern:
      /\b(?:i am|i'm|we are|we're)\s+(?:a|an)?\s*(?:professional|freelance|senior|expert|experienced)?\s*(?:website|web|full[- ]?stack|fullstack|frontend|front-end|backend|back-end|wordpress|shopify|woocommerce|react(?:\.js)?|next(?:\.js)?|node(?:\.js)?|php|laravel|python|mern|mean|seo|automation|ai|designer|developer|video|copywriter)\s+(?:stack\s+)?(?:developer|designer|expert|specialist|freelancer|consultant|editor|copywriter)\b/i
  },
  {
    name: "first-person service offer",
    pattern:
      /\b(?:i|we)\s+(?:build|design|develop|create|make)\s+(?:[\w-]+\s+){0,2}(?:websites?|web ?apps?|web applications?|online stores?|e-?commerce stores?|landing pages?|shopify stores?|wordpress sites?|logos?|video edits?|mobile apps?)\b/i
  },
  {
    name: "first-person service offer",
    pattern:
      /\b(?:i|we)\s+(?:offer|provide|deliver)\s+(?:[\w-]+\s+){0,2}(?:web|websites?|seo|automation|digital|design|development|video|writing|copywriting|services?)\b/i
  },
  {
    name: "services list",
    pattern: /\b(?:my|our)\s+services\s+(?:include|are|cover|offer)\b/i
  },
  {
    name: "why choose me",
    pattern: /\bwhy choose (?:me|us)\b/i
  },
  {
    name: "hire me",
    pattern: /\bhire me\b/i
  },
  {
    name: "pitch to build",
    pattern:
      /\b(?:i|we)\s+(?:can|will)\s+(?:build|design|develop|create|make)\s+(?:your|a|an|it|this|that|websites?|web ?apps?|logos?|mobile apps?)\b/i
  },
  {
    name: "pitch to help",
    pattern: /\b(?:i|we)\s+can\s+help\b/i
  },
  {
    name: "availability pitch",
    pattern:
      /\b(?:available for work|available for freelance|available for hire|open to work|open for projects|open for freelance|taking on new clients|accepting new clients)\b/i
  },
  {
    name: "contact pitch",
    pattern:
      /\b(?:dm|pm|message|contact|inbox|whatsapp|text|call|reach out to)\s+(?:me|us)\b(?!\s+(?:if|when|with|your)\b)/i
  },
  {
    name: "call to action",
    pattern:
      /\b(?:let'?s talk|let'?s discuss|book a call|schedule a call|let me know|send a message)\b(?!\s+(?:if|when|with|your)\b)/i
  },
  {
    name: "link in bio",
    pattern: /\blink in (?:bio|profile)\b/i
  },
  {
    name: "specialist pitch",
    pattern: /\b(?:i|we)\s+specialize\b/i
  },
  {
    name: "conditional service pitch",
    pattern:
      /\bif you (?:need|want|are looking for|'re looking for)\b[\s\S]{0,80}\b(?:website|web|seo|automation|developer|designer|logo|video)\b/i
  },
  {
    name: "services offer",
    pattern:
      /\b(?:i|we)\s+services?\s+offer\b|\bservices?\s+(?:i|we)\s+offer\b|\bservices?\s+offer\s+(?:for|to)\s+clients\b/i
  },
  {
    name: "portfolio pitch",
    pattern:
      /\b(?:i|we)\s+(?:can|will)\s+(?:share|send|show)\s+(?:my|our)\s+(?:portfolio|samples|work)\b/i
  },
  {
    name: "send a message pitch",
    pattern: /\bsend\s+(?:me|us)\s+a\s+message\b(?!\s+(?:if|when|with|your)\b)/i
  },
  {
    name: "self-promotion to clients",
    pattern:
      /\b(?:i|we)\s+(?:want|wanna|would like|plan|hope|am trying|are trying)\s+to\s+(?:start|build|offer|provide|sell|do)\b[\s\S]{0,40}\b(?:for\s+(?:clients|customers|businesses|people|others)|clients?)\b/i
  },
  {
    name: "third-person agency offer",
    pattern:
      /\b(?:our|my)\s+(?:team|company|agency|studio|firm)(?:\s+of\s+[\w\s]{0,30})?\s+(?:builds?|designs?|develops?|provides?|offers?|specializes?|handles?)\b/i
  },
  {
    name: "team of experts",
    pattern:
      /\b(?:we|i)\s+(?:are|am)\s+(?:a\s+)?(?:team|group)\s+of\b[\s\S]{0,40}\b(?:developers?|designers?|experts?|specialists?|copywriters?|editors?)\b/i
  },
  {
    name: "launch or portfolio announcement",
    pattern:
      /\b(?:our|my)\s+(?:new\s+)?(?:website|site|store|page)\s+(?:is|are)\s+(?:now\s+)?(?:live|launched|ready)\b|\bcheck out (?:our|my)\s+(?:services|portfolio|work|website|site|store)\b/i
  }
];

const NON_BUYER_PATTERNS = [
  {
    name: "learning intent",
    pattern: /\b(?:want|wanna|trying|planning|hoping|looking)\s+to\s+(?:learn|study|become)\b/i
  },
  {
    name: "advice question",
    pattern: /\b(?:is\s+it\s+worth|worth\s+it|difference\s+between|which\s+is\s+better|should\s+i\s+(?:get|use|choose|hire|pay|start|learn|go))\b/i
  },
  {
    name: "learning question",
    pattern: /\b(?:how|where)\s+(?:do|can|should)\s+i\s+(?:learn|become|start)\b/i
  },
  {
    name: "tool recommendation",
    pattern:
      /\b(?:recommend|suggest|suggestions?\s+for)\s+(?:a\s+)?(?:course|tutorial|tool|software|book|platform)\b/i
  }
];

const regexCache = new Map();

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matcherFor(phrase) {
  const key = phrase.toLowerCase().trim();
  let re = regexCache.get(key);
  if (!re) {
    re = new RegExp(
      `(?<![\\p{L}\\p{N}])${escapeRegex(key)}(?![\\p{L}\\p{N}])`,
      "iu"
    );
    regexCache.set(key, re);
  }
  return re;
}

export function normalizeText(text) {
  return String(text ?? "")
    .replace(/[\u2018\u2019\u02BC\u0060\u00B4]/g, "'")
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function uniqueMatches(haystack, phrases) {
  const hits = [];
  for (const phrase of phrases) {
    if (matcherFor(phrase).test(haystack)) {
      hits.push(phrase);
    }
  }
  return hits;
}

function mergeList(base, extra) {
  if (!Array.isArray(extra) || extra.length === 0) return base;
  const seen = new Set(base.map((word) => word.toLowerCase()));
  const merged = [...base];
  for (const word of extra) {
    const clean = String(word ?? "").trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(clean);
  }
  return merged;
}

function skillVariants(phrase) {
  const base = String(phrase ?? "").trim().toLowerCase();
  if (!base) return [];
  const variants = new Set([base]);
  const spaced = base.replace(/[/\\-]+/g, " ").replace(/\s+/g, " ").trim();
  if (spaced) variants.add(spaced);

  const add = (value) => {
    const clean = value.replace(/\s+/g, " ").trim();
    if (clean) variants.add(clean);
  };

  if (/\bediting$/.test(base)) {
    const stem = base.replace(/editing$/, "");
    add(`${stem}editor`);
    add(`${stem}editors`);
  }
  if (/\bwriting$/.test(base)) {
    const stem = base.replace(/writing$/, "");
    add(`${stem}writer`);
    add(`${stem}writers`);
  }
  if (/\bdesign$/.test(base)) {
    add(`${base}er`);
    add(`${base}ers`);
  }
  if (/\bdevelopment$/.test(base)) {
    const stem = base.replace(/development$/, "");
    add(`${stem}developer`);
    add(`${stem}developers`);
  }
  if (/\bmanagement$/.test(base)) {
    const stem = base.replace(/management$/, "");
    add(`${stem}manager`);
  }
  if (/\bing$/.test(base)) {
    const stem = base.slice(0, -3);
    if (stem.length >= 4) {
      add(`${stem}er`);
      add(`${stem}ers`);
    }
  }
  return [...variants];
}

function expandSkillList(skills) {
  const out = [];
  const seen = new Set();
  for (const skill of Array.isArray(skills) ? skills : []) {
    for (const variant of skillVariants(skill)) {
      if (seen.has(variant)) continue;
      seen.add(variant);
      out.push(variant);
      if (out.length >= 400) return out;
    }
  }
  return out;
}

export function mergeLexicon(extra = {}) {
  const services = {};
  for (const [category, words] of Object.entries(DEFAULT_LEXICON.services)) {
    services[category] = mergeList(words, extra.services?.[category]);
  }
  return {
    services,
    skills: expandSkillList(extra.skills),
    need: mergeList(DEFAULT_LEXICON.need, extra.need),
    hiring: mergeList(DEFAULT_LEXICON.hiring, extra.hiring),
    intentPhrases: mergeList(DEFAULT_LEXICON.intentPhrases, extra.intentPhrases),
    negative: mergeList(DEFAULT_LEXICON.negative, extra.negative),
    noise: mergeList(DEFAULT_LEXICON.noise, extra.noise)
  };
}

function detectPatterns(haystack, patterns) {
  return patterns
    .filter(({ pattern }) => pattern.test(haystack))
    .map(({ name }) => name);
}

function positionsOf(haystack, phrases) {
  const out = [];
  for (const phrase of phrases) {
    const index = haystack.indexOf(String(phrase).toLowerCase());
    if (index !== -1) out.push(index);
  }
  return out;
}

function withinProximity(haystack, serviceHits, triggerHits) {
  const servicePositions = positionsOf(haystack, serviceHits);
  const triggerPositions = positionsOf(haystack, triggerHits);
  if (servicePositions.length === 0 || triggerPositions.length === 0) return false;
  for (const serviceAt of servicePositions) {
    for (const triggerAt of triggerPositions) {
      if (Math.abs(serviceAt - triggerAt) <= PROXIMITY_CHARS) return true;
    }
  }
  return false;
}

export function scorePost(text, options = {}) {
  const lexicon = mergeLexicon(options.extra);
  const minScore = options.minScore ?? 4;
  const haystack = normalizeText(text);

  const matched = {
    services: {},
    skills: [],
    need: [],
    hiring: [],
    intentPhrases: [],
    negative: [],
    noise: [],
    seller: detectPatterns(haystack, SELLER_PATTERNS),
    nonBuyer: detectPatterns(haystack, NON_BUYER_PATTERNS)
  };

  let servicePoints = 0;
  for (const [category, phrases] of Object.entries(lexicon.services)) {
    const hits = uniqueMatches(haystack, phrases);
    if (hits.length > 0) {
      matched.services[category] = hits;
      servicePoints += Math.min(hits.length * SERVICE_WEIGHT, SERVICE_CAP);
    }
  }
  servicePoints = Math.min(servicePoints, SERVICE_CAP * 3);

  const serviceNames = new Set(Object.keys(matched.services).map((name) => name.toLowerCase()));
  matched.skills = uniqueMatches(haystack, lexicon.skills).filter(
    (skill) => !serviceNames.has(skill.toLowerCase())
  );
  const skillPoints = Math.min(matched.skills.length * SERVICE_WEIGHT, SERVICE_CAP);

  matched.need = uniqueMatches(haystack, lexicon.need);
  matched.hiring = uniqueMatches(haystack, lexicon.hiring);
  matched.intentPhrases = uniqueMatches(haystack, lexicon.intentPhrases);
  matched.negative = uniqueMatches(haystack, lexicon.negative);
  matched.noise = uniqueMatches(haystack, lexicon.noise);

  const strongNeed = matched.need.filter(
    (phrase) => !WEAK_NEED.has(phrase.toLowerCase())
  );

  const needPoints = Math.min(matched.need.length * NEED_WEIGHT, NEED_CAP);
  const hiringPoints = Math.min(matched.hiring.length * HIRING_WEIGHT, HIRING_CAP);
  const phrasePoints = Math.min(matched.intentPhrases.length * PHRASE_WEIGHT, PHRASE_CAP);
  const negativePoints = Math.min(
    matched.negative.length * NEGATIVE_WEIGHT,
    NEGATIVE_CAP
  );
  const noisePoints = matched.noise.length * NOISE_WEIGHT;

  const services = [
    ...new Set([...Object.keys(matched.services), ...matched.skills])
  ];
  const score =
    servicePoints +
    skillPoints +
    needPoints +
    hiringPoints +
    phrasePoints -
    negativePoints -
    noisePoints;

  const trigger =
    strongNeed.length > 0 ||
    matched.hiring.length > 0 ||
    matched.intentPhrases.length > 0;

  const serviceHits = [...Object.values(matched.services).flat(), ...matched.skills];
  const triggerHits = [
    ...strongNeed,
    ...matched.hiring,
    ...matched.intentPhrases
  ];
  const proximity = withinProximity(haystack, serviceHits, triggerHits);

  const breakdown = {
    servicePoints,
    skillPoints,
    needPoints,
    hiringPoints,
    phrasePoints,
    negativePoints,
    noisePoints
  };

  return {
    score,
    services,
    matched,
    breakdown,
    trigger,
    strongNeed,
    proximity,
    isLead:
      services.length > 0 &&
      trigger &&
      proximity &&
      score >= minScore &&
      matched.seller.length === 0 &&
      matched.nonBuyer.length === 0
  };
}
