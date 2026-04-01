const dotenv = require("dotenv");
const app = require("../src/app");
const connectDB = require("../src/config/db");
const ensureAdmin = require("../src/seed/ensureAdmin");

dotenv.config();

let initialized = false;

const initialize = async () => {
  if (initialized) return;
  await connectDB();
  await ensureAdmin();
  initialized = true;
};

module.exports = async (req, res) => {
  try {
    await initialize();
    return app(req, res);
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Server initialization failed",
    });
  }
};
