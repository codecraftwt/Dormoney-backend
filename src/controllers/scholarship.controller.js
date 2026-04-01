const Scholarship = require("../models/Scholarship");

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

const buildScholarshipQuery = (filters = {}) => {
  const query = {};
  const andConditions = [];

  if (filters.activeOnly === true || filters.activeOnly === "true") {
    query.isActive = true;
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
    const { name, link, awardAmount, deadline, category, featured, isActive } =
      req.body;

    if (!name || !link || !awardAmount || !deadline || !category) {
      return res.status(400).json({
        message:
          "name, link, awardAmount, deadline, and category are all required",
      });
    }

    const scholarship = await Scholarship.create({
      name: String(name).trim(),
      link: String(link).trim(),
      awardAmount: String(awardAmount).trim(),
      awardAmountValue: parseAwardValue(awardAmount),
      deadline,
      category,
      featured: Boolean(featured),
      isActive: typeof isActive === "boolean" ? isActive : true,
    });

    return res.status(201).json({ scholarship });
  } catch (error) {
    return next(error);
  }
};

const updateScholarship = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };

    if (updates.awardAmount !== undefined) {
      updates.awardAmount = String(updates.awardAmount).trim();
      updates.awardAmountValue = parseAwardValue(updates.awardAmount);
    }

    const scholarship = await Scholarship.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    if (!scholarship) {
      return res.status(404).json({ message: "Scholarship not found" });
    }

    return res.status(200).json({ scholarship });
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
