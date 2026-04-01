const dotenv = require("dotenv");
const connectDB = require("../config/db");
const Scholarship = require("../models/Scholarship");

dotenv.config();

const samples = [
  {
    name: "Future Engineers Scholarship",
    link: "https://example.org/future-engineers",
    awardAmount: "$5,000",
    awardAmountValue: 5000,
    deadline: new Date("2026-08-15"),
    category: "STEM",
    featured: true,
    isActive: true,
  },
  {
    name: "Business Leaders Grant",
    link: "https://example.org/business-leaders",
    awardAmount: "$2,500",
    awardAmountValue: 2500,
    deadline: new Date("2026-07-01"),
    category: "Business",
    featured: false,
    isActive: true,
  },
  {
    name: "Community Impact Scholarship",
    link: "https://example.org/community-impact",
    awardAmount: "Amount varies",
    awardAmountValue: null,
    deadline: new Date("2026-09-20"),
    category: "General",
    featured: false,
    isActive: true,
  },
  {
    name: "Healthcare Pathways Award",
    link: "https://example.org/healthcare-pathways",
    awardAmount: "$10,000",
    awardAmountValue: 10000,
    deadline: new Date("2026-10-10"),
    category: "Health and Medicine",
    featured: true,
    isActive: true,
  },
  {
    name: "Creative Arts Fellowship",
    link: "https://example.org/creative-arts",
    awardAmount: "$1,000",
    awardAmountValue: 1000,
    deadline: new Date("2026-06-30"),
    category: "Arts and Design",
    featured: false,
    isActive: true,
  },
];

const runSeed = async () => {
  try {
    await connectDB();
    await Scholarship.deleteMany({});
    await Scholarship.insertMany(samples);
    console.log("Scholarships seeded successfully");
    process.exit(0);
  } catch (error) {
    console.error("Scholarship seed failed:", error.message);
    process.exit(1);
  }
};

runSeed();
