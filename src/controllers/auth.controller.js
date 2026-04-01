const User = require("../models/User");
const generateToken = require("../utils/generateToken");

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const signup = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");
    const phone = String(req.body.phone || "").trim();

    if (!email || !password || !phone) {
      return res
        .status(400)
        .json({ message: "Email, password, and phone are required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: "Email is already registered" });
    }

    const user = await User.create({ email, password, phone });
    const token = generateToken({ id: user._id, role: user.role });

    return res.status(201).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = generateToken({ id: user._id, role: user.role });
    return res.status(200).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const logout = async (_req, res) => {
  return res.status(200).json({ message: "Logged out successfully" });
};

const getMe = async (req, res) => {
  return res.status(200).json({ user: req.user });
};

module.exports = {
  signup,
  login,
  logout,
  getMe,
};
