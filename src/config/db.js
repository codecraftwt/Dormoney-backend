const mongoose = require("mongoose");
const dns = require("node:dns");

const connectWithUri = async (uri) => {
  return mongoose.connect(uri);
};

const connectDB = async () => {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    console.error("MongoDB connection failed: MONGO_URI is not set");
    process.exit(1);
  }

  try {
    const conn = await connectWithUri(uri);
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    const isSrvDnsError =
      typeof error?.message === "string" &&
      error.message.includes("querySrv ECONNREFUSED");

    if (isSrvDnsError) {
      try {
        // Fallback for networks that block default SRV DNS resolution.
        dns.setServers(["8.8.8.8", "1.1.1.1"]);
        const conn = await connectWithUri(uri);
        console.log(`MongoDB connected: ${conn.connection.host}`);
        return;
      } catch (retryError) {
        console.error("MongoDB connection failed:", retryError.message);
        process.exit(1);
      }
    }

    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
