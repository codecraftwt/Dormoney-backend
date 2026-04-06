const mongoose = require("mongoose");

const CATEGORY_ENUM = [
  "Arts and Design",
  "Business",
  "Education",
  "General",
  "Health and Medicine",
  "Humanities",
  "Social Sciences",
  "STEM",
  "Other",
];

const GRADE_LEVEL_ENUM = ["high_school", "undergraduate", "graduate"];

const AWARD_FREQUENCY_ENUM = ["", "one_time", "renewable"];

const scholarshipSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    link: {
      type: String,
      required: true,
      trim: true,
    },
    awardAmount: {
      type: String,
      required: true,
      trim: true,
    },
    awardAmountValue: {
      type: Number,
      default: null,
    },
    deadline: {
      type: Date,
      required: true,
    },
    category: {
      type: String,
      enum: CATEGORY_ENUM,
      required: true,
    },
    featured: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    eligibleMajors: {
      type: String,
      trim: true,
      default: "",
    },
    minGpaRequired: {
      type: Number,
      default: null,
    },
    /** "ALL" or comma-separated state codes, e.g. "CA,TX,NY" */
    eligibleStates: {
      type: String,
      trim: true,
      default: "ALL",
    },
    specialEligibility: {
      type: String,
      trim: true,
      default: "",
    },
    gradeLevels: {
      type: [String],
      enum: GRADE_LEVEL_ENUM,
      default: [],
    },
    essayRequired: {
      type: Boolean,
      default: false,
    },
    citizenshipRequirement: {
      type: String,
      trim: true,
      default: "",
    },
    organizationName: {
      type: String,
      trim: true,
      default: "",
    },
    awardFrequency: {
      type: String,
      enum: AWARD_FREQUENCY_ENUM,
      default: "",
    },
    numberOfAwards: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Scholarship", scholarshipSchema);
module.exports.CATEGORY_ENUM = CATEGORY_ENUM;
module.exports.GRADE_LEVEL_ENUM = GRADE_LEVEL_ENUM;
module.exports.AWARD_FREQUENCY_ENUM = AWARD_FREQUENCY_ENUM;

