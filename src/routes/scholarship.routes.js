const express = require("express");
const {
  listScholarships,
  createScholarship,
  updateScholarship,
  deleteScholarship,
  toggleScholarshipStatus,
} = require("../controllers/scholarship.controller");
const { protect, requireAdmin } = require("../middleware/auth.middleware");

const router = express.Router();

router.get("/", protect, listScholarships);
router.post("/", protect, requireAdmin, createScholarship);
router.put("/:id", protect, requireAdmin, updateScholarship);
router.delete("/:id", protect, requireAdmin, deleteScholarship);
router.patch("/:id/toggle-active", protect, requireAdmin, toggleScholarshipStatus);

module.exports = router;
