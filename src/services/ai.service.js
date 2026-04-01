const OpenAI = require("openai");
const { CATEGORY_ENUM } = require("../models/Scholarship");

let openaiClient = null;

const buildPrompt = (query, keywordHints = []) => {
  const categories = CATEGORY_ENUM.join(", ");
  const hints = keywordHints.length
    ? keywordHints.slice(0, 80).join(", ")
    : "none";
  return `
You convert scholarship search text into JSON filters.
Return ONLY valid JSON. No markdown and no extra text.

Allowed keys:
- categories: array of category names from [${categories}]
- amountRanges: array of strings in "min-max" format (example: "0-1000")
- includeVaries: boolean
- deadlineStart: string YYYY-MM-DD or null
- deadlineEnd: string YYYY-MM-DD or null
- keywords: array of short keyword strings

Rules:
- Keep keys minimal and relevant to the user query.
- If a field is unknown, use null for date fields and [] for arrays.
- Never invent scholarship names.
- Prefer keywords from this known scholarship keyword bank when relevant:
${hints}

User query:
${query}
`;
};

const parseJsonSafely = (raw) => {
  try {
    return JSON.parse(raw);
  } catch (_error) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1));
    }
    throw new Error("AI response was not valid JSON");
  }
};

const todayIsoDate = () => new Date().toISOString().slice(0, 10);
const STOPWORDS = new Set([
  "show",
  "me",
  "the",
  "a",
  "an",
  "scholarship",
  "scholarships",
  "which",
  "that",
  "is",
  "are",
  "for",
  "to",
  "with",
  "and",
  "or",
  "in",
  "on",
  "of",
  "related",
  "find",
  "need",
  "want",
  "active",
  "expired",
  "not",
  "under",
  "over",
  "above",
  "below",
  "at",
  "least",
  "most",
  "amount",
]);

const CATEGORY_PATTERNS = [
  { category: "Business", pattern: /b(u|oo)?s+i+n+e?s?s?|finance|management|entrepreneur/i },
  { category: "STEM", pattern: /stem|engineering|computer|science|technology|math/i },
  { category: "Health and Medicine", pattern: /health|medicine|medical|nursing|pharmacy/i },
  { category: "Education", pattern: /education|teaching|teacher|pedagogy/i },
  { category: "Humanities", pattern: /humanities|history|philosophy|literature|language/i },
  { category: "Social Sciences", pattern: /social science|psychology|sociology|political/i },
  { category: "Arts and Design", pattern: /art|design|creative|music|fine arts/i },
  { category: "General", pattern: /general|all fields|any major/i },
];

const normalizeCategory = (value) => {
  const text = String(value || "").toLowerCase().trim();
  if (!text) return null;
  const direct = CATEGORY_ENUM.find((item) => item.toLowerCase() === text);
  if (direct) return direct;

  for (const config of CATEGORY_PATTERNS) {
    if (config.pattern.test(text)) return config.category;
  }
  return null;
};

const extractKeywordsFromText = (text) => {
  const tokens = String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
  return [...new Set(tokens)].slice(0, 4);
};

const buildKeywordHintsFromScholarships = (scholarships = []) => {
  const raw = scholarships.flatMap((item) => [item?.name || "", item?.category || ""]);
  const keywords = raw
    .flatMap((text) => String(text).split(/\s+/))
    .map((token) => token.toLowerCase().replace(/[^a-z0-9]/g, "").trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
  return [...new Set(keywords)].slice(0, 120);
};

const addHintMatchedKeywords = (queryText, hintKeywords = []) => {
  const queryTokens = extractKeywordsFromText(queryText);
  if (!queryTokens.length || !hintKeywords.length) return [];
  return hintKeywords.filter((hint) =>
    queryTokens.some((token) => hint.includes(token) || token.includes(hint))
  );
};

const normalizeAmountRange = (value) => {
  const text = String(value || "").toLowerCase().trim();
  if (!text) return null;
  if (text.includes("varies")) return "varies";

  const exact = text.match(/(?:exact|exactly|equal to|equals|is)\s*\$?\s*(\d+)/);
  if (exact) return `${exact[1]}-${exact[1]}`;

  const minMax = text.match(/(\d+)\s*-\s*(\d+)/);
  if (minMax) return `${minMax[1]}-${minMax[2]}`;

  const plus = text.match(/(\d+)\+/);
  if (plus) return `${plus[1]}+`;

  const above = text.match(/(?:above|over|greater than|at least|>=)\s*\$?\s*(\d+)/);
  if (above) return `${above[1]}+`;

  const below = text.match(/(?:below|under|less than|at most|<=)\s*\$?\s*(\d+)/);
  if (below) return `0-${below[1]}`;

  return null;
};

const extractFiltersFromTextFallback = (userQuery, options = {}) => {
  const hintKeywords = Array.isArray(options.keywordHints)
    ? options.keywordHints
    : [];
  const q = String(userQuery || "").toLowerCase();
  const categories = CATEGORY_ENUM.map((item) => ({ raw: item, low: item.toLowerCase() }))
    .filter((item) => q.includes(item.low))
    .map((item) => item.raw);

  CATEGORY_PATTERNS.forEach((config) => {
    if (config.pattern.test(q)) categories.push(config.category);
  });

  const uniqueCategories = [...new Set(categories)].filter((value) =>
    CATEGORY_ENUM.includes(value)
  );

  const amountRanges = [];
  const exact = q.match(/(?:exact|exactly|equal to|equals|is)\s*\$?\s*(\d+)/);
  if (exact) amountRanges.push(`${exact[1]}-${exact[1]}`);
  const above = q.match(/(?:above|over|greater than|at least)\s*\$?\s*(\d+)/);
  if (above) amountRanges.push(`${above[1]}+`);
  const below = q.match(/(?:below|under|less than|at most)\s*\$?\s*(\d+)/);
  if (below) amountRanges.push(`0-${below[1]}`);
  if (q.includes("varies")) amountRanges.push("varies");

  let deadlineStart = null;
  let deadlineEnd = null;
  if (
    q.includes("not expired") ||
    q.includes("active") ||
    q.includes("upcoming") ||
    q.includes("open now")
  ) {
    deadlineStart = todayIsoDate();
  }
  const before = q.match(/(?:before|until|by)\s+([a-z]+\s+\d{4}|\d{4}-\d{2}-\d{2})/i);
  if (before) {
    deadlineEnd = before[1];
  }

  return {
    categories: uniqueCategories,
    amountRanges,
    deadlineStart,
    deadlineEnd,
    keywords: [
      ...new Set([
        ...extractKeywordsFromText(userQuery),
        ...addHintMatchedKeywords(userQuery, hintKeywords),
      ]),
    ].slice(0, 6),
  };
};

const normalizeAiPayload = (parsed = {}) => {
  const rawCategories = parsed.categories || parsed.category || [];
  const categories = Array.isArray(rawCategories)
    ? rawCategories
        .map((value) => normalizeCategory(value))
        .filter((value) => CATEGORY_ENUM.includes(value))
    : [normalizeCategory(rawCategories)].filter((value) =>
        CATEGORY_ENUM.includes(value)
      );

  const rawRanges =
    parsed.amountRanges || parsed.amount_range || parsed.amountRange || [];
  const amountRanges = Array.isArray(rawRanges)
    ? rawRanges.map((value) => normalizeAmountRange(value)).filter(Boolean)
    : [normalizeAmountRange(rawRanges)].filter(Boolean);

  if (parsed.includeVaries) {
    amountRanges.push("varies");
  }

  if (parsed.amount_min || parsed.minAmount) {
    amountRanges.push(`${parsed.amount_min || parsed.minAmount}+`);
  }
  if (parsed.amount_max || parsed.maxAmount) {
    amountRanges.push(`0-${parsed.amount_max || parsed.maxAmount}`);
  }

  const rawKeywords = parsed.keywords || parsed.keyword || [];
  const keywords = Array.isArray(rawKeywords)
    ? rawKeywords.map((value) => String(value).trim()).filter(Boolean)
    : [String(rawKeywords).trim()].filter(Boolean);
  const normalizedKeywords = keywords.length
    ? keywords
    : extractKeywordsFromText(
        [
          parsed.query,
          parsed.intent,
          parsed.focus,
          parsed.major,
          parsed.field,
        ]
          .filter(Boolean)
          .join(" ")
      );

  return {
    categories: [...new Set(categories)],
    amountRanges: [...new Set(amountRanges)],
    deadlineStart: parsed.deadlineStart || parsed.deadline_start || null,
    deadlineEnd: parsed.deadlineEnd || parsed.deadline_end || null,
    keywords: normalizedKeywords,
  };
};

const mergeFilters = (primary, fallback) => ({
  categories: primary.categories?.length ? primary.categories : fallback.categories,
  amountRanges: primary.amountRanges?.length
    ? primary.amountRanges
    : fallback.amountRanges,
  deadlineStart: primary.deadlineStart || fallback.deadlineStart || null,
  deadlineEnd: primary.deadlineEnd || fallback.deadlineEnd || null,
  keywords: primary.keywords?.length ? primary.keywords : fallback.keywords,
});

const extractFiltersWithAI = async (userQuery, options = {}) => {
  const keywordHints = Array.isArray(options.keywordHints)
    ? options.keywordHints
    : [];
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing");
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  const completion = await openaiClient.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "You are a strict JSON generator for scholarship search filters.",
      },
      {
        role: "user",
        content: buildPrompt(userQuery, keywordHints),
      },
    ],
  });

  const text = completion.choices?.[0]?.message?.content || "{}";
  const parsed = parseJsonSafely(text);
  const aiFilters = normalizeAiPayload(parsed);
  const fallbackFilters = extractFiltersFromTextFallback(userQuery, {
    keywordHints,
  });
  return mergeFilters(aiFilters, fallbackFilters);
};

module.exports = {
  extractFiltersWithAI,
  extractFiltersFromTextFallback,
  buildKeywordHintsFromScholarships,
  mergeFilters,
};
