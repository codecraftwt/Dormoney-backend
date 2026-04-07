const express = require("express");
const { protect } = require("../middleware/auth.middleware");
const { getProfile, updateProfile } = require("../controllers/user.controller");

const router = express.Router();

router.get("/profile", protect, getProfile);
router.patch("/profile", protect, updateProfile);

module.exports = router;
