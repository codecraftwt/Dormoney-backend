const User = require("../models/User");
const Scholarship = require("../models/Scholarship");
const Settings = require("../models/Settings");

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const getStats = async (_req, res, next) => {
  try {
    const [
      memberCount,
      adminCount,
      accountsTotal,
      scholarshipTotal,
      scholarshipActive,
      scholarshipInactive,
      scholarshipFeatured,
    ] = await Promise.all([
      User.countDocuments({ role: "user" }),
      User.countDocuments({ role: "admin" }),
      User.countDocuments(),
      Scholarship.countDocuments(),
      Scholarship.countDocuments({ isActive: true }),
      Scholarship.countDocuments({ isActive: false }),
      Scholarship.countDocuments({ featured: true }),
    ]);

    return res.status(200).json({
      users: {
        members: memberCount,
        admins: adminCount,
        total: accountsTotal,
      },
      scholarships: {
        total: scholarshipTotal,
        active: scholarshipActive,
        inactive: scholarshipInactive,
        featured: scholarshipFeatured,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const createUser = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");
    const phone = String(req.body.phone || "").trim();
    const role = req.body.role;

    if (!email || !password || !phone) {
      return res.status(400).json({ message: "Email, password, and phone are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }
    if (role !== "user" && role !== "admin") {
      return res.status(400).json({ message: "role must be 'user' or 'admin'" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: "Email is already registered" });
    }

    const user = await User.create({ email, password, phone, role });
    const safe = await User.findById(user._id).select("-password").lean();
    return res.status(201).json({ user: safe });
  } catch (error) {
    return next(error);
  }
};

const listUsers = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "20"), 10) || 20));
    const search = String(req.query.search || "").trim();
    const role = req.query.role;

    const query = {};
    if (role === "user" || role === "admin") {
      query.role = role;
    }
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return res.status(200).json({
      users,
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    return next(error);
  }
};

const updateUserRole = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (role !== "user" && role !== "admin") {
      return res.status(400).json({ message: "role must be 'user' or 'admin'" });
    }

    const target = await User.findById(id);
    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }

    if (target.role === "admin" && role === "user") {
      const adminCount = await User.countDocuments({ role: "admin" });
      if (adminCount <= 1) {
        return res.status(400).json({
          message: "Cannot remove the last administrator account.",
        });
      }
    }

    target.role = role;
    await target.save();

    const user = await User.findById(id).select("-password").lean();
    return res.status(200).json({ user });
  } catch (error) {
    return next(error);
  }
};

const getSettings = async (_req, res, next) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({});
    }
    return res.status(200).json({ settings });
  } catch (error) {
    return next(error);
  }
};

const updateSettings = async (req, res, next) => {
  try {
    const allowed = ["siteName", "supportEmail", "supportPhone"];
    const updates = {};
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) {
        updates[key] = String(req.body[key]).trim();
      }
    });

    const settings = await Settings.findOneAndUpdate({}, updates, {
      new: true,
      upsert: true,
      runValidators: true,
    });

    return res.status(200).json({ settings });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getStats,
  createUser,
  listUsers,
  updateUserRole,
  getSettings,
  updateSettings,
};
