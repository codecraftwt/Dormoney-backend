const User = require("../models/User");
const generateToken = require("../utils/generateToken");
const crypto = require("crypto");

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();
const normalizePhone = (phone) => String(phone || "").replace(/\D/g, "").slice(0, 10);
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isValidPassword = (password) => password.length >= 8 && /\d/.test(password);
const accountTypeLabel = (value) => (value === "parent" ? "parent" : "student");

const userResponse = (user) => ({
  id: user._id,
  email: user.email,
  phone: user.phone,
  role: user.role,
  sms_opt_in: Boolean(user.sms_opt_in),
  sms_consent_timestamp: user.sms_consent_timestamp || null,
  account_type: user.account_type || "student",
  email_verified: Boolean(user.email_verified),
  first_name: user.first_name || "",
  state: user.state || "",
  grade_level: user.grade_level || "",
  gpa_range: user.gpa_range || "",
  fields_of_study: user.fields_of_study || [],
  background_tags: user.background_tags || [],
  involvement_tags: user.involvement_tags || [],
  college_start: user.college_start || "",
  biggest_challenge: user.biggest_challenge || "",
  onboarding_complete: Boolean(user.onboarding_complete),
  onboarding_current_step: user.onboarding_current_step || 1,
  onboarding_completed_at: user.onboarding_completed_at || null,
});

const sendVerificationEmailAsync = (email, verificationUrl) => {
  setTimeout(() => {
    // MVP transport: app logs link for manual/captured delivery when no provider is configured.
    console.log(`Verification email queued for ${email}: ${verificationUrl}`);
  }, 0);
};

const signup = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");
    const phone = normalizePhone(req.body.phone);
    const sms_opt_in = req.body.sms_opt_in !== false;
    const account_type = accountTypeLabel(req.body.account_type);

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Please enter a valid email address" });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({
        message: "Password must be at least 8 characters and include at least 1 number",
      });
    }
    if (phone.length !== 10) {
      return res.status(400).json({ message: "Please enter a valid 10-digit mobile number" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: "Email is already registered" });
    }

    const user = new User({
      email,
      password_hash: password,
      phone,
      sms_opt_in,
      sms_consent_timestamp: new Date(),
      account_type,
      email_verified: false,
      onboarding_current_step: 1,
    });
    const rawVerificationToken = user.createEmailVerificationToken();
    await user.save();
    const verificationUrlBase =
      process.env.CLIENT_URL || process.env.CLIENT_URLS?.split(",")[0]?.trim() || "";
    const verificationUrl = `${verificationUrlBase.replace(/\/+$/, "")}/verify-email?token=${rawVerificationToken}`;
    sendVerificationEmailAsync(email, verificationUrl);
    const token = generateToken({ id: user._id, role: user.role });

    return res.status(201).json({
      token,
      user: userResponse(user),
    });
  } catch (error) {
    return next(error);
  }
};

const findUserAndVerifyPassword = async (email, password) => {
  const user = await User.findOne({ email }).select("+password +password_hash");
  if (!user) {
    return null;
  }
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    return null;
  }
  return user;
};

const login = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await findUserAndVerifyPassword(email, password);
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (user.role === "admin") {
      return res.status(403).json({
        message: "Administrator accounts must sign in via the admin portal.",
      });
    }

    const token = generateToken({ id: user._id, role: user.role });
    return res.status(200).json({
      token,
      user: userResponse(user),
    });
  } catch (error) {
    return next(error);
  }
};

const adminLogin = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await findUserAndVerifyPassword(email, password);
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (user.role !== "admin") {
      return res.status(403).json({
        message: "This account is not an administrator.",
      });
    }

    const token = generateToken({ id: user._id, role: user.role });
    return res.status(200).json({
      token,
      user: userResponse(user),
    });
  } catch (error) {
    return next(error);
  }
};

const logout = async (_req, res) => {
  return res.status(200).json({ message: "Logged out successfully" });
};

const getMe = async (req, res) => {
  return res.status(200).json({ user: userResponse(req.user) });
};

const verifyEmail = async (req, res, next) => {
  try {
    const rawToken = String(req.query.token || "").trim();
    if (!rawToken) {
      return res.status(400).json({ message: "Verification token is required" });
    }

    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
    const user = await User.findOne({
      email_verification_token: hashedToken,
      email_verification_expires_at: { $gt: new Date() },
    }).select("-password -password_hash");

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired verification token" });
    }

    user.email_verified = true;
    user.email_verification_token = "";
    user.email_verification_expires_at = null;
    await user.save();

    return res.status(200).json({ message: "Email verified successfully" });
  } catch (error) {
    return next(error);
  }
};

const resendVerification = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email }).select("+email_verification_token");
    if (!user) {
      return res.status(404).json({ message: "No account found for this email" });
    }
    if (user.email_verified) {
      return res.status(400).json({ message: "Email is already verified" });
    }

    const rawVerificationToken = user.createEmailVerificationToken();
    await user.save();
    const verificationUrlBase =
      process.env.CLIENT_URL || process.env.CLIENT_URLS?.split(",")[0]?.trim() || "";
    const verificationUrl = `${verificationUrlBase.replace(/\/+$/, "")}/verify-email?token=${rawVerificationToken}`;
    sendVerificationEmailAsync(email, verificationUrl);

    return res.status(200).json({ message: "Verification email sent" });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  signup,
  login,
  adminLogin,
  logout,
  getMe,
  verifyEmail,
  resendVerification,
};
