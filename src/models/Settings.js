const mongoose = require("mongoose");

/**
 * Singleton-style app settings stored in MongoDB (Railway: set MONGO_URI).
 * Secrets (OPENAI_API_KEY, JWT_SECRET) stay in environment variables, not here.
 */
const settingsSchema = new mongoose.Schema(
  {
    siteName: {
      type: String,
      default: "Dormoney",
      trim: true,
    },
    supportEmail: {
      type: String,
      default: "",
      trim: true,
    },
    supportPhone: {
      type: String,
      default: "",
      trim: true,
    },
    /** When false, AI search uses rule-based fallback only (no OpenAI calls). */
    aiSearchEnabled: {
      type: Boolean,
      default: true,
    },
    /** Optional text appended to the AI system prompt for org-specific rules. */
    aiSystemContext: {
      type: String,
      default: "",
      trim: true,
      maxlength: 8000,
    },
    /** Default max scholarships returned per AI search (capped 1–100). */
    aiMaxResultLimit: {
      type: Number,
      default: 25,
      min: 1,
      max: 100,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Settings", settingsSchema);
