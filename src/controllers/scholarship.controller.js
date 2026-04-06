const Scholarship = require("../models/Scholarship");
const { GRADE_LEVEL_ENUM, CATEGORY_ENUM } = Scholarship;

const DEFAULT_CATEGORY = "General";

const normalizeCategory = (value) => {
  const s = String(value || "").trim();
  return CATEGORY_ENUM.includes(s) ? s : DEFAULT_CATEGORY;
};

/** null when unset; valid number when set */
const normalizeMinGpaForStorage = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (Number.isNaN(n) || n < 0 || n > 5) return null;
  return n;
};

/** States: blank or ALL → ALL; otherwise trimmed list */
const normalizeEligibleStates = (value) => {
  const raw = String(value ?? "ALL").trim();
  if (!raw || /^ALL$/i.test(raw)) return "ALL";
  return raw;
};

const parseAwardValue = (awardAmount) => {
  const normalized = String(awardAmount || "").toLowerCase();
  if (normalized.includes("varies")) {
    return null;
  }
  const numeric = Number(normalized.replace(/[^0-9.]/g, ""));
  return Number.isNaN(numeric) ? null : numeric;
};

const parseAmountRanges = (value) => {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : String(value).split(",");
  return raw.map((v) => String(v).trim()).filter(Boolean);
};

const parseNumericRangeToken = (token) => {
  const lowered = token.toLowerCase().replace(/\s+/g, " ").trim();
  if (!lowered) return null;

  if (lowered === "varies" || lowered.includes("amount varies")) {
    return { varies: true };
  }

  const minMaxMatch = lowered.match(/^(\d+)\s*-\s*(\d+)$/);
  if (minMaxMatch) {
    return {
      min: Number(minMaxMatch[1]),
      max: Number(minMaxMatch[2]),
    };
  }

  const plusMatch = lowered.match(/^(\d+)\+$/);
  if (plusMatch) {
    return {
      min: Number(plusMatch[1]),
      max: Number.MAX_SAFE_INTEGER,
    };
  }

  const aboveMatch = lowered.match(/(?:above|over|greater than|at least|>=)\s*\$?\s*(\d+)/);
  if (aboveMatch) {
    return {
      min: Number(aboveMatch[1]),
      max: Number.MAX_SAFE_INTEGER,
    };
  }

  const belowMatch = lowered.match(/(?:below|under|less than|at most|<=)\s*\$?\s*(\d+)/);
  if (belowMatch) {
    return {
      min: 0,
      max: Number(belowMatch[1]),
    };
  }

  const exactMatch = lowered.match(
    /(?:exact|exactly|equal to|equals|is)\s*\$?\s*(\d+)/
  );
  if (exactMatch) {
    const value = Number(exactMatch[1]);
    return {
      min: value,
      max: value,
    };
  }

  return null;
};

const sanitizeGradeLevels = (raw) => {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(GRADE_LEVEL_ENUM);
  return [...new Set(raw.filter((g) => typeof g === "string" && allowed.has(g)))];
};

const ALLOWED_FIELDS = [
  "name",
  "link",
  "awardAmount",
  "deadline",
  "category",
  "featured",
  "isActive",
  "description",
  "eligibleMajors",
  "minGpaRequired",
  "eligibleStates",
  "specialEligibility",
  "gradeLevels",
  "essayRequired",
  "citizenshipRequirement",
  "organizationName",
  "awardFrequency",
  "numberOfAwards",
];

const pickAllowed = (body) => {
  const out = {};
  ALLOWED_FIELDS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      out[key] = body[key];
    }
  });
  return out;
};

const validateScholarshipPayload = (payload) => {
  const errors = [];

  if (!String(payload.name || "").trim()) errors.push("Scholarship name is required");
  if (!String(payload.link || "").trim()) errors.push("Apply URL is required");
  if (!String(payload.awardAmount || "").trim()) errors.push("Award amount is required");
  if (!payload.deadline) errors.push("Deadline is required");
  if (!String(payload.description || "").trim()) {
    errors.push("Brief description is required");
  }

  const gpa = payload.minGpaRequired;
  if (gpa !== undefined && gpa !== null && String(gpa).trim() !== "") {
    const n = Number(gpa);
    if (Number.isNaN(n) || n < 0 || n > 5) {
      errors.push("Minimum GPA must be a number between 0 and 5");
    }
  }

  const grades = sanitizeGradeLevels(payload.gradeLevels);
  return { errors, gradeLevels: grades };
};

const buildScholarshipQuery = (filters = {}) => {
  const query = {};
  const andConditions = [];

  const hasExplicitIsActive = typeof filters.isActive === "boolean";
  if (hasExplicitIsActive) {
    query.isActive = filters.isActive;
  } else if (filters.activeOnly === true || filters.activeOnly === "true") {
    query.isActive = true;
  }

  if (typeof filters.featured === "boolean") {
    query.featured = filters.featured;
  } else if (filters.featuredOnly === true || filters.featuredOnly === "true") {
    query.featured = true;
  }

  if (filters.categories && filters.categories.length) {
    query.category = { $in: filters.categories };
  }

  if (filters.deadlineStart || filters.deadlineEnd) {
    query.deadline = {};
    if (filters.deadlineStart) {
      query.deadline.$gte = new Date(filters.deadlineStart);
    }
    if (filters.deadlineEnd) {
      query.deadline.$lte = new Date(filters.deadlineEnd);
    }
  }

  const amountRanges = parseAmountRanges(filters.amountRanges);
  if (amountRanges.length) {
    const amountOr = [];

    amountRanges.forEach((range) => {
      const parsedRange = parseNumericRangeToken(range);
      if (!parsedRange) {
        return;
      }

      if (parsedRange.varies) {
        amountOr.push({ awardAmountValue: null });
        return;
      }

      amountOr.push({
        awardAmountValue: { $gte: parsedRange.min, $lte: parsedRange.max },
      });
    });

    if (amountOr.length) andConditions.push({ $or: amountOr });
  }

  if (filters.keywords && filters.keywords.length) {
    andConditions.push({
      $or: filters.keywords.map((keyword) => ({
        $or: [
          { name: { $regex: keyword, $options: "i" } },
          { category: { $regex: keyword, $options: "i" } },
          { description: { $regex: keyword, $options: "i" } },
          { eligibleMajors: { $regex: keyword, $options: "i" } },
          { specialEligibility: { $regex: keyword, $options: "i" } },
          { organizationName: { $regex: keyword, $options: "i" } },
          { citizenshipRequirement: { $regex: keyword, $options: "i" } },
        ],
      })),
    });
  }

  if (andConditions.length === 1) {
    Object.assign(query, andConditions[0]);
  } else if (andConditions.length > 1) {
    query.$and = andConditions;
  }

  return query;
};

const listScholarships = async (req, res, next) => {
  try {
    const query = buildScholarshipQuery({
      activeOnly: req.query.activeOnly,
      categories: req.query.categories
        ? String(req.query.categories)
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        : [],
      deadlineStart: req.query.deadlineStart,
      deadlineEnd: req.query.deadlineEnd,
      amountRanges: req.query.amountRanges,
      keywords: req.query.keywords
        ? String(req.query.keywords)
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        : [],
    });

    const scholarships = await Scholarship.find(query).sort({
      featured: -1,
      deadline: 1,
      createdAt: -1,
    });

    return res.status(200).json({ scholarships });
  } catch (error) {
    return next(error);
  }
};

const createScholarship = async (req, res, next) => {
  try {
    const body = pickAllowed(req.body);
    const { errors, gradeLevels } = validateScholarshipPayload({
      ...body,
      gradeLevels: sanitizeGradeLevels(body.gradeLevels),
    });

    if (errors.length) {
      return res.status(400).json({ message: errors[0], errors });
    }

    const eligibleStates = normalizeEligibleStates(body.eligibleStates);
    const minGpaStored = normalizeMinGpaForStorage(body.minGpaRequired);

    const scholarship = await Scholarship.create({
      name: String(body.name).trim(),
      link: String(body.link).trim(),
      awardAmount: String(body.awardAmount).trim(),
      awardAmountValue: parseAwardValue(body.awardAmount),
      deadline: body.deadline,
      category: normalizeCategory(body.category),
      featured: Boolean(body.featured),
      isActive: typeof body.isActive === "boolean" ? body.isActive : true,
      description: String(body.description).trim(),
      eligibleMajors: String(body.eligibleMajors ?? "").trim(),
      minGpaRequired: minGpaStored,
      eligibleStates,
      specialEligibility: String(body.specialEligibility ?? "").trim(),
      gradeLevels,
      essayRequired: typeof body.essayRequired === "boolean" ? body.essayRequired : false,
      citizenshipRequirement: String(body.citizenshipRequirement ?? "").trim(),
      organizationName: String(body.organizationName || "").trim(),
      awardFrequency: body.awardFrequency || "",
      numberOfAwards: String(body.numberOfAwards || "").trim(),
    });

    return res.status(201).json({ scholarship });
  } catch (error) {
    return next(error);
  }
};

const updateScholarship = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await Scholarship.findById(id);
    if (!existing) {
      return res.status(404).json({ message: "Scholarship not found" });
    }

    const body = pickAllowed(req.body);
    const merged = { ...existing.toObject(), ...body };
    if (body.gradeLevels !== undefined) {
      merged.gradeLevels = sanitizeGradeLevels(body.gradeLevels);
    }

    const { errors, gradeLevels } = validateScholarshipPayload({
      name: merged.name,
      link: merged.link,
      awardAmount: merged.awardAmount,
      deadline: merged.deadline,
      description: merged.description,
      minGpaRequired: merged.minGpaRequired,
      gradeLevels: merged.gradeLevels,
    });

    if (errors.length) {
      return res.status(400).json({ message: errors[0], errors });
    }

    const eligibleStates = normalizeEligibleStates(merged.eligibleStates);

    existing.name = String(merged.name).trim();
    existing.link = String(merged.link).trim();
    existing.awardAmount = String(merged.awardAmount).trim();
    existing.awardAmountValue = parseAwardValue(merged.awardAmount);
    existing.deadline = merged.deadline;
    existing.category = normalizeCategory(merged.category);
    existing.featured = Boolean(merged.featured);
    existing.isActive = Boolean(merged.isActive);
    existing.description = String(merged.description).trim();
    existing.eligibleMajors = String(merged.eligibleMajors ?? "").trim();
    existing.minGpaRequired = normalizeMinGpaForStorage(merged.minGpaRequired);
    existing.eligibleStates = eligibleStates;
    existing.specialEligibility = String(merged.specialEligibility ?? "").trim();
    existing.gradeLevels = gradeLevels;
    existing.essayRequired = typeof merged.essayRequired === "boolean" ? merged.essayRequired : false;
    existing.citizenshipRequirement = String(merged.citizenshipRequirement ?? "").trim();
    existing.organizationName = String(merged.organizationName || "").trim();
    existing.awardFrequency = merged.awardFrequency || "";
    existing.numberOfAwards = String(merged.numberOfAwards || "").trim();

    await existing.save();

    return res.status(200).json({ scholarship: existing });
  } catch (error) {
    return next(error);
  }
};

const deleteScholarship = async (req, res, next) => {
  try {
    const { id } = req.params;
    const scholarship = await Scholarship.findByIdAndDelete(id);

    if (!scholarship) {
      return res.status(404).json({ message: "Scholarship not found" });
    }

    return res.status(200).json({ message: "Scholarship deleted" });
  } catch (error) {
    return next(error);
  }
};

const toggleScholarshipStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const scholarship = await Scholarship.findById(id);

    if (!scholarship) {
      return res.status(404).json({ message: "Scholarship not found" });
    }

    scholarship.isActive = !scholarship.isActive;
    await scholarship.save();

    return res.status(200).json({ scholarship });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listScholarships,
  createScholarship,
  updateScholarship,
  deleteScholarship,
  toggleScholarshipStatus,
  buildScholarshipQuery,
};
