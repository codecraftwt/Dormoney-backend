const dotenv = require("dotenv");
const app = require("./app");
const connectDB = require("./config/db");
const ensureAdmin = require("./seed/ensureAdmin");
const cors = require("cors");
dotenv.config();

const PORT = process.env.PORT || 5000;
const corsOptions = {
  origin: process.env.CLIENT_URL,
  credentials: true,
};
app.use(cors(corsOptions));

const startServer = async () => {
  app.use(cors(corsOptions));
  await connectDB();
  await ensureAdmin();
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
};

startServer();
