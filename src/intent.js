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

const SELLER_PATTERNS = [
  {
    name: "self-identified provider",
    pattern:
      /\b(?:i am|i'm|we are|we're)\s+(?:a|an)?\s*(?:professional|freelance|senior|expert|experienced)?\s*(?:website|web|full[- ]?stack|fullstack|frontend|front-end|backend|back-end|wordpress|shopify|woocommerce|react(?:\.js)?|next(?:\.js)?|node(?:\.js)?|php|laravel|python|mern|mean|seo|automation|ai)\s+(?:stack\s+)?(?:developer|designer|expert|specialist|freelancer|consultant)\b/i
  },
  {
    name: "first-person service offer",
    pattern:
      /\b(?:i|we)\s+(?:build|design|develop|create|make)\s+(?:[\w-]+\s+){0,2}(?:websites?|web ?apps?|web applications?|online stores?|e-?commerce stores?|landing pages?|shopify stores?|wordpress sites?)\b/i
  },
  {
    name: "first-person service offer",
    pattern:
      /\b(?:i|we)\s+(?:offer|provide|deliver)\s+(?:[\w-]+\s+){0,2}(?:web|websites?|seo|automation|digital|design|development|services?)\b/i
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
      /\b(?:i|we)\s+(?:can|will)\s+(?:build|design|develop|create|make)\s+(?:your|a|an|it|this|that|websites?|web ?apps?)\b/i
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
      /\bif you (?:need|want|are looking for|'re looking for)\b[\s\S]{0,80}\b(?:website|web|seo|automation|developer|designer)\b/i
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

export function mergeLexicon(extra = {}) {
  const services = {};
  for (const [category, words] of Object.entries(DEFAULT_LEXICON.services)) {
    services[category] = mergeList(words, extra.services?.[category]);
  }
  return {
    services,
    skills: mergeList([], extra.skills),
    need: mergeList(DEFAULT_LEXICON.need, extra.need),
    hiring: mergeList(DEFAULT_LEXICON.hiring, extra.hiring),
    intentPhrases: mergeList(DEFAULT_LEXICON.intentPhrases, extra.intentPhrases),
    negative: mergeList(DEFAULT_LEXICON.negative, extra.negative),
    noise: mergeList(DEFAULT_LEXICON.noise, extra.noise)
  };
}

function detectSeller(haystack) {
  return SELLER_PATTERNS.filter(({ pattern }) => pattern.test(haystack)).map(
    ({ name }) => name
  );
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
    seller: detectSeller(haystack)
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
    matched.need.length > 0 || matched.hiring.length > 0 || matched.intentPhrases.length > 0;

  return {
    score,
    services,
    matched,
    trigger,
    isLead:
      services.length > 0 &&
      trigger &&
      score >= minScore &&
      matched.seller.length === 0
  };
}
