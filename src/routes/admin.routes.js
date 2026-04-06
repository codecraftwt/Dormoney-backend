const express = require("express");
const { protect, requireAdmin } = require("../middleware/auth.middleware");
const {
  getStats,
  createUser,
  listUsers,
  updateUserRole,
  getSettings,
  updateSettings,
} = require("../controllers/admin.controller");

const router = express.Router();

router.use(protect, requireAdmin);

router.get("/stats", getStats);
router.post("/users", createUser);
router.get("/users", listUsers);
router.patch("/users/:id/role", updateUserRole);
router.get("/settings", getSettings);
router.put("/settings", updateSettings);

module.exports = router;
