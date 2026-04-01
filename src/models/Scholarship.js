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
  },
  { timestamps: true }
);

module.exports = mongoose.model("Scholarship", scholarshipSchema);
module.exports.CATEGORY_ENUM = CATEGORY_ENUM;
