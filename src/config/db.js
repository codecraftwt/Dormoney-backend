const mongoose = require("mongoose");
const dns = require("node:dns");

const connectWithUri = async (uri) => {
  return mongoose.connect(uri);
};

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  const uri = process.env.MONGO_URI;

  if (!uri) {
    throw new Error("MongoDB connection failed: MONGO_URI is not set");
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
        throw new Error(`MongoDB connection failed: ${retryError.message}`);
      }
    }

    throw new Error(`MongoDB connection failed: ${error.message}`);
  }
};

module.exports = connectDB;
