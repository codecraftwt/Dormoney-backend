const Scholarship = require("../models/Scholarship");
const { buildScholarshipQuery } = require("./scholarship.controller");
const {
  extractFiltersWithAI,
  extractFiltersFromTextFallback,
  buildKeywordHintsFromScholarships,
} = require("../services/ai.service");

const hasRecognizedSearchIntent = (filters = {}, keywordHints = []) => {
  const hasStructuredFilters =
    Boolean(filters?.categories?.length) ||
    Boolean(filters?.amountRanges?.length) ||
    Boolean(filters?.deadlineStart) ||
    Boolean(filters?.deadlineEnd) ||
    typeof filters?.featured === "boolean" ||
    typeof filters?.isActive === "boolean";

  if (hasStructuredFilters) return true;

  const normalizedHints = keywordHints.map((value) => String(value).toLowerCase());
  const normalizedKeywords = (filters?.keywords || []).map((value) =>
    String(value).toLowerCase()
  );

  return normalizedKeywords.some((keyword) =>
    normalizedHints.some((hint) => hint.includes(keyword) || keyword.includes(hint))
  );
};

const getAwardRankingSortDirection = (queryText = "") => {
  const q = String(queryText).toLowerCase();
  const asksHighest =
    /(highest|largest|maximum|max|top)\s+(award|amount)/.test(q) ||
    /(award|amount)\s+(highest|largest|maximum|max)/.test(q);
  if (asksHighest) return -1;

  const asksLowest =
    /(lowest|smallest|minimum|min)\s+(award|amount)/.test(q) ||
    /(award|amount)\s+(lowest|smallest|minimum|min)/.test(q);
  if (asksLowest) return 1;

  return 0;
};

const getRequestedResultLimit = (queryText = "", hasAwardRankingIntent = false) => {
  const q = String(queryText).toLowerCase();
  const explicitLimitMatch = q.match(/\btop\s+(\d+)\b|\bfirst\s+(\d+)\b/);
  const explicitLimit = Number(explicitLimitMatch?.[1] || explicitLimitMatch?.[2] || 0);
  if (explicitLimit > 0) return explicitLimit;
  if (hasAwardRankingIntent) return 1;
  return 0;
};

const aiSearch = async (req, res, next) => {
  try {
    const queryText = String(req.body.query || "").trim();
    const awardSortDirection = getAwardRankingSortDirection(queryText);
    const resultLimit = getRequestedResultLimit(queryText, Boolean(awardSortDirection));
    if (!queryText) {
      return res.status(400).json({ message: "query is required" });
    }

    const scholarshipHintsSource = await Scholarship.find(
      { isActive: true },
      { name: 1, category: 1 }
    ).lean();
    const keywordHints = buildKeywordHintsFromScholarships(scholarshipHintsSource);

    if (!process.env.OPENAI_API_KEY) {
      const fallbackFilters = extractFiltersFromTextFallback(queryText, {
        keywordHints,
      });
      if (!awardSortDirection && !hasRecognizedSearchIntent(fallbackFilters, keywordHints)) {
        return res.status(200).json({
          filters: fallbackFilters,
          scholarships: [],
          message: "No matching scholarships found for this query.",
        });
      }
      const fallbackQuery = buildScholarshipQuery({
        activeOnly: true,
        ...fallbackFilters,
      });
      if (awardSortDirection) {
        const existingAmountCondition = fallbackQuery.awardAmountValue;
        fallbackQuery.awardAmountValue =
          existingAmountCondition && typeof existingAmountCondition === "object"
            ? { ...existingAmountCondition, $ne: null }
            : { $ne: null };
      }
      let fallbackScholarshipQuery = Scholarship.find(fallbackQuery).sort({
        ...(awardSortDirection ? { awardAmountValue: awardSortDirection } : {}),
        featured: -1,
        deadline: 1,
        createdAt: -1,
      });
      if (resultLimit > 0) {
        fallbackScholarshipQuery = fallbackScholarshipQuery.limit(resultLimit);
      }
      const fallbackScholarships = await fallbackScholarshipQuery;
      return res.status(200).json({
        filters: fallbackFilters,
        scholarships: fallbackScholarships,
      });
    }

    let aiFilters;
    try {
      aiFilters = await extractFiltersWithAI(queryText, { keywordHints });
    } catch (error) {
      const isQuotaError =
        error?.code === "insufficient_quota" ||
        String(error?.message || "").includes("quota");

      if (!isQuotaError) {
        throw error;
      }

      aiFilters = extractFiltersFromTextFallback(queryText, { keywordHints });
    }
    if (!awardSortDirection && !hasRecognizedSearchIntent(aiFilters, keywordHints)) {
      return res.status(200).json({
        filters: aiFilters,
        scholarships: [],
        message: "No matching scholarships found for this query.",
      });
    }

    const query = buildScholarshipQuery({
      activeOnly: true,
      ...aiFilters,
    });
    if (awardSortDirection) {
      const existingAmountCondition = query.awardAmountValue;
      query.awardAmountValue =
        existingAmountCondition && typeof existingAmountCondition === "object"
          ? { ...existingAmountCondition, $ne: null }
          : { $ne: null };
    }

    let scholarshipQuery = Scholarship.find(query).sort({
      ...(awardSortDirection ? { awardAmountValue: awardSortDirection } : {}),
      featured: -1,
      deadline: 1,
      createdAt: -1,
    });
    if (resultLimit > 0) {
      scholarshipQuery = scholarshipQuery.limit(resultLimit);
    }
    const scholarships = await scholarshipQuery;

    return res.status(200).json({
      filters: aiFilters,
      scholarships,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  aiSearch,
};
