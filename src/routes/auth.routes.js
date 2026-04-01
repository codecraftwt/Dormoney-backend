const express = require("express");
const {
  signup,
  login,
  adminLogin,
  logout,
  getMe,
} = require("../controllers/auth.controller");
const { protect } = require("../middleware/auth.middleware");

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/admin/login", adminLogin);
router.post("/logout", protect, logout);
router.get("/me", protect, getMe);

module.exports = router;
