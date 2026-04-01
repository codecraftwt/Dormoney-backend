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
- featured: boolean or null
- isActive: boolean or null
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
const MONTH_INDEX = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sept: 8,
  sep: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

const toIsoDate = (year, monthIndex, day) => {
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || !Number.isInteger(day)) {
    return null;
  }
  const date = new Date(Date.UTC(year, monthIndex, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== monthIndex ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
};

const parseDateFromText = (text, now = new Date()) => {
  const q = String(text || "").toLowerCase().trim();
  if (!q) return null;

  const isoMatch = q.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    return toIsoDate(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  }

  const slashMatch = q.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (slashMatch) {
    const left = Number(slashMatch[1]);
    const right = Number(slashMatch[2]);
    const year = Number(slashMatch[3]);
    // Prefer DD/MM/YYYY, then fallback to MM/DD/YYYY.
    return toIsoDate(year, right - 1, left) || toIsoDate(year, left - 1, right);
  }

  const monthDayYear = q.match(
    /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s+(\d{4})\b/
  );
  if (monthDayYear) {
    const monthIndex = MONTH_INDEX[monthDayYear[1]];
    return toIsoDate(Number(monthDayYear[3]), monthIndex, Number(monthDayYear[2]));
  }

  const dayMonthYear = q.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)(?:,)?\s+(\d{4})\b/
  );
  if (dayMonthYear) {
    const monthIndex = MONTH_INDEX[dayMonthYear[2]];
    return toIsoDate(Number(dayMonthYear[3]), monthIndex, Number(dayMonthYear[1]));
  }

  return null;
};

const parseMonthYearFromText = (text, now = new Date()) => {
  const q = String(text || "").toLowerCase().trim();
  const monthYearMatch = q.match(
    /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)(?:\s+(\d{4}))?\b/
  );
  if (!monthYearMatch) return null;
  const monthIndex = MONTH_INDEX[monthYearMatch[1]];
  const year = monthYearMatch[2] ? Number(monthYearMatch[2]) : now.getFullYear();
  return { monthIndex, year };
};

const getMonthDateRange = ({ monthIndex, year }) => {
  const start = toIsoDate(year, monthIndex, 1);
  const endDate = new Date(Date.UTC(year, monthIndex + 1, 0));
  const end = endDate.toISOString().slice(0, 10);
  return { start, end };
};

const sanitizeDateInput = (value) => {
  if (!value) return null;
  const parsed = parseDateFromText(String(value));
  return parsed || null;
};
const STOPWORDS = new Set([
  "show",
  "me",
  "the",
  "a",
  "an",
  "scholarship",
  "scholarships",
  "which",
  "who",
  "whose",
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
  "deadline",
  "deadlines",
  "due",
  "date",
  "before",
  "after",
  "from",
  "until",
  "by",
  "on",
  "active",
  "inactive",
  "expired",
  "featured",
  "not",
  "under",
  "over",
  "above",
  "below",
  "at",
  "least",
  "most",
  "amount",
  "award",
  "awards",
  "highest",
  "lowest",
  "maximum",
  "minimum",
  "max",
  "min",
  "top",
  "largest",
  "smallest",
  "january",
  "jan",
  "february",
  "feb",
  "march",
  "mar",
  "april",
  "apr",
  "may",
  "june",
  "jun",
  "july",
  "jul",
  "august",
  "aug",
  "september",
  "sept",
  "sep",
  "october",
  "oct",
  "november",
  "nov",
  "december",
  "dec",
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

const normalizeKeywords = (values = []) => {
  const source = Array.isArray(values) ? values : [values];
  const flattenedTokens = source
    .flatMap((value) =>
      String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
    )
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token) && !/^\d+$/.test(token));
  return [...new Set(flattenedTokens)].slice(0, 6);
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
  let featured = null;
  let isActive = null;
  if (/\bfeatured\b|\bhighlighted\b/.test(q)) {
    featured = true;
  }
  if (/\binactive\b|\bnot active\b|\bclosed\b|\bdisabled\b/.test(q)) {
    isActive = false;
  } else if (/\bactive\b|\bopen now\b/.test(q)) {
    isActive = true;
  }
  if (
    q.includes("not expired") ||
    q.includes("upcoming") ||
    q.includes("open now")
  ) {
    deadlineStart = todayIsoDate();
  }
  const exactDateText = q.match(
    /(?:deadline\s*(?:is|=)?|on|due(?:\s+date)?(?:\s+is)?)\s+([a-z0-9,\-/\s]+)/
  );
  const exactDate = parseDateFromText(exactDateText?.[1]);
  if (exactDate) {
    deadlineStart = exactDate;
    deadlineEnd = exactDate;
  }

  const beforeDateText = q.match(/(?:before|until|by)\s+([a-z0-9,\-/\s]+)/);
  if (beforeDateText) {
    const explicitDate = parseDateFromText(beforeDateText[1]);
    if (explicitDate) {
      deadlineEnd = explicitDate;
    } else {
      const monthYear = parseMonthYearFromText(beforeDateText[1]);
      if (monthYear) {
        const endOfPreviousMonth = toIsoDate(monthYear.year, monthYear.monthIndex, 1);
        if (endOfPreviousMonth) {
          const date = new Date(`${endOfPreviousMonth}T00:00:00.000Z`);
          date.setUTCDate(date.getUTCDate() - 1);
          deadlineEnd = date.toISOString().slice(0, 10);
        }
      }
    }
  }

  const afterDateText = q.match(/(?:after|from)\s+([a-z0-9,\-/\s]+)/);
  if (afterDateText) {
    const explicitDate = parseDateFromText(afterDateText[1]);
    if (explicitDate) {
      deadlineStart = explicitDate;
    } else {
      const monthYear = parseMonthYearFromText(afterDateText[1]);
      if (monthYear) {
        const nextMonth = monthYear.monthIndex === 11 ? 0 : monthYear.monthIndex + 1;
        const year = monthYear.monthIndex === 11 ? monthYear.year + 1 : monthYear.year;
        deadlineStart = toIsoDate(year, nextMonth, 1) || deadlineStart;
      }
    }
  }

  const inMonthText = q.match(/(?:in|during|within)\s+([a-z0-9,\-\s]+)/);
  if (inMonthText && !exactDate && !beforeDateText && !afterDateText) {
    const monthYear = parseMonthYearFromText(inMonthText[1]);
    if (monthYear) {
      const range = getMonthDateRange(monthYear);
      deadlineStart = range.start;
      deadlineEnd = range.end;
    }
  }

  return {
    categories: uniqueCategories,
    amountRanges,
    deadlineStart: sanitizeDateInput(deadlineStart) || deadlineStart,
    deadlineEnd: sanitizeDateInput(deadlineEnd) || deadlineEnd,
    featured,
    isActive,
    keywords: [
      ...new Set([
        ...extractKeywordsFromText(userQuery),
        ...addHintMatchedKeywords(userQuery, hintKeywords),
      ]),
    ].slice(0, 6),
  };
};

const normalizeAiPayload = (parsed = {}) => {
  const normalizeBooleanOrNull = (value) => {
    if (value === true || value === false) return value;
    if (value === null || value === undefined) return null;
    const text = String(value).toLowerCase().trim();
    if (["true", "yes", "1", "featured", "active"].includes(text)) return true;
    if (["false", "no", "0", "inactive", "not active"].includes(text)) return false;
    return null;
  };

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
  const normalizedKeywords = normalizeKeywords(rawKeywords).length
    ? normalizeKeywords(rawKeywords)
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
    deadlineStart: sanitizeDateInput(parsed.deadlineStart || parsed.deadline_start),
    deadlineEnd: sanitizeDateInput(parsed.deadlineEnd || parsed.deadline_end),
    featured: normalizeBooleanOrNull(
      parsed.featured ?? parsed.isFeatured ?? parsed.featuredOnly
    ),
    isActive: normalizeBooleanOrNull(
      parsed.isActive ?? parsed.active ?? parsed.activeOnly ?? parsed.status
    ),
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
  featured:
    typeof primary.featured === "boolean"
      ? primary.featured
      : typeof fallback.featured === "boolean"
      ? fallback.featured
      : null,
  isActive:
    typeof primary.isActive === "boolean"
      ? primary.isActive
      : typeof fallback.isActive === "boolean"
      ? fallback.isActive
      : null,
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
