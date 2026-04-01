const dotenv = require("dotenv");
const app = require("./app");
const connectDB = require("./config/db");
const ensureAdmin = require("./seed/ensureAdmin");

dotenv.config();

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();
  await ensureAdmin();
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
};

startServer();
