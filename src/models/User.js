const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      select: false,
      default: "",
    },
    password_hash: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    sms_opt_in: {
      type: Boolean,
      default: true,
    },
    sms_consent_timestamp: {
      type: Date,
      default: Date.now,
    },
    account_type: {
      type: String,
      enum: ["student", "parent"],
      default: "student",
    },
    email_verified: {
      type: Boolean,
      default: false,
    },
    email_verification_token: {
      type: String,
      select: false,
      default: "",
    },
    email_verification_expires_at: {
      type: Date,
      default: null,
    },
    first_name: {
      type: String,
      trim: true,
      default: "",
    },
    state: {
      type: String,
      trim: true,
      default: "",
    },
    grade_level: {
      type: String,
      trim: true,
      default: "",
    },
    gpa_range: {
      type: String,
      trim: true,
      default: "",
    },
    fields_of_study: {
      type: [String],
      default: [],
    },
    background_tags: {
      type: [String],
      default: [],
    },
    involvement_tags: {
      type: [String],
      default: [],
    },
    college_start: {
      type: String,
      trim: true,
      default: "",
    },
    biggest_challenge: {
      type: String,
      trim: true,
      default: "",
    },
    onboarding_complete: {
      type: Boolean,
      default: false,
    },
    onboarding_current_step: {
      type: Number,
      default: 1,
      min: 1,
      max: 4,
    },
    onboarding_completed_at: {
      type: Date,
      default: null,
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

userSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password_hash") && !this.isModified("password")) {
    return next();
  }
  const sourcePassword = this.isModified("password_hash")
    ? this.password_hash
    : this.password;
  const salt = await bcrypt.genSalt(10);
  const hashed = await bcrypt.hash(sourcePassword, salt);
  this.password_hash = hashed;
  this.password = hashed;
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidatePassword) {
  const hashed = this.password_hash || this.password || "";
  return bcrypt.compare(candidatePassword, hashed);
};

userSchema.methods.createEmailVerificationToken = function createEmailVerificationToken() {
  const rawToken = crypto.randomBytes(32).toString("hex");
  this.email_verification_token = crypto
    .createHash("sha256")
    .update(rawToken)
    .digest("hex");
  this.email_verification_expires_at = new Date(Date.now() + 1000 * 60 * 60 * 24);
  return rawToken;
};

module.exports = mongoose.model("User", userSchema);
