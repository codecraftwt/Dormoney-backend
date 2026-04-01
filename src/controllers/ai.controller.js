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
    Boolean(filters?.deadlineEnd);

  if (hasStructuredFilters) return true;

  const normalizedHints = keywordHints.map((value) => String(value).toLowerCase());
  const normalizedKeywords = (filters?.keywords || []).map((value) =>
    String(value).toLowerCase()
  );

  return normalizedKeywords.some((keyword) =>
    normalizedHints.some((hint) => hint.includes(keyword) || keyword.includes(hint))
  );
};

const aiSearch = async (req, res, next) => {
  try {
    const queryText = String(req.body.query || "").trim();
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
      if (!hasRecognizedSearchIntent(fallbackFilters, keywordHints)) {
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
      const fallbackScholarships = await Scholarship.find(fallbackQuery).sort({
        featured: -1,
        deadline: 1,
        createdAt: -1,
      });
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
    if (!hasRecognizedSearchIntent(aiFilters, keywordHints)) {
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

    const scholarships = await Scholarship.find(query).sort({
      featured: -1,
      deadline: 1,
      createdAt: -1,
    });

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
