const express = require("express");
const {
  signup,
  login,
  adminLogin,
  logout,
  getMe,
  verifyEmail,
  resendVerification,
} = require("../controllers/auth.controller");
const { protect } = require("../middleware/auth.middleware");

const router = express.Router();

router.post("/signup", signup);
router.post("/register", signup);
router.post("/login", login);
router.post("/admin/login", adminLogin);
router.post("/logout", protect, logout);
router.get("/me", protect, getMe);
router.get("/verify-email", verifyEmail);
router.post("/resend-verification", resendVerification);

module.exports = router;
