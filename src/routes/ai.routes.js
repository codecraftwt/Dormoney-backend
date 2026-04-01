const express = require("express");
const { aiSearch } = require("../controllers/ai.controller");
const { protect } = require("../middleware/auth.middleware");

const router = express.Router();

router.post("/search", protect, aiSearch);

module.exports = router;
