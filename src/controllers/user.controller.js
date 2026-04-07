const User = require("../models/User");

const ALLOWED_PATCH_FIELDS = new Set([
  "first_name",
  "state",
  "grade_level",
  "gpa_range",
  "fields_of_study",
  "background_tags",
  "involvement_tags",
  "college_start",
  "biggest_challenge",
  "onboarding_complete",
  "onboarding_current_step",
]);

const toStringArray = (value) => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((v) => String(v || "").trim()).filter(Boolean))];
};

const sanitizePatch = (body) => {
  const updates = {};
  Object.keys(body || {}).forEach((key) => {
    if (!ALLOWED_PATCH_FIELDS.has(key)) return;
    updates[key] = body[key];
  });

  if (updates.first_name !== undefined) updates.first_name = String(updates.first_name || "").trim();
  if (updates.state !== undefined) updates.state = String(updates.state || "").trim();
  if (updates.grade_level !== undefined) updates.grade_level = String(updates.grade_level || "").trim();
  if (updates.gpa_range !== undefined) updates.gpa_range = String(updates.gpa_range || "").trim();
  if (updates.college_start !== undefined) updates.college_start = String(updates.college_start || "").trim();
  if (updates.biggest_challenge !== undefined) {
    updates.biggest_challenge = String(updates.biggest_challenge || "").trim();
  }
  if (updates.fields_of_study !== undefined) updates.fields_of_study = toStringArray(updates.fields_of_study);
  if (updates.background_tags !== undefined) updates.background_tags = toStringArray(updates.background_tags);
  if (updates.involvement_tags !== undefined) updates.involvement_tags = toStringArray(updates.involvement_tags);
  if (updates.onboarding_current_step !== undefined) {
    const n = Number(updates.onboarding_current_step);
    updates.onboarding_current_step = Number.isNaN(n) ? 1 : Math.max(1, Math.min(4, n));
  }

  if (updates.onboarding_complete === true) {
    updates.onboarding_complete = true;
    updates.onboarding_current_step = 4;
    updates.onboarding_completed_at = new Date();
  }

  return updates;
};

const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select("-password -password_hash");
    return res.status(200).json({ user });
  } catch (error) {
    return next(error);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const updates = sanitizePatch(req.body);
    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
      select: "-password -password_hash",
    });
    return res.status(200).json({ user });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getProfile,
  updateProfile,
};
