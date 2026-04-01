const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const healthRoutes = require("./routes/health.routes");
const authRoutes = require("./routes/auth.routes");
const scholarshipRoutes = require("./routes/scholarship.routes");
const aiRoutes = require("./routes/ai.routes");

const app = express();

const parseAllowedOrigins = () => {
  const rawOrigins = process.env.CLIENT_URLS || process.env.CLIENT_URL || "";
  return rawOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const allowedOrigins = parseAllowedOrigins();

app.use(
  cors({
    origin(origin, callback) {
      // Allow server-to-server and non-browser requests.
      if (!origin) return callback(null, true);

      if (allowedOrigins.length === 0) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);

      return callback(new Error("Not allowed by CORS"));
    },
  })
);
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  res.json({ message: "Dormoney API is running" });
});

app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/scholarships", scholarshipRoutes);
app.use("/api/ai", aiRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.statusCode || 500).json({
    message: err.message || "Internal server error",
  });
});

module.exports = app;
