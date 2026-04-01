const User = require("../models/User");

const ensureAdmin = async () => {
  const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || "");

  if (!email || !password) {
    return;
  }

  const existing = await User.findOne({ email });
  if (existing) {
    if (existing.role !== "admin") {
      existing.role = "admin";
      await existing.save();
    }
    return;
  }

  await User.create({
    email,
    password,
    phone: "0000000000",
    role: "admin",
  });

  console.log(`Default admin ensured: ${email}`);
};

module.exports = ensureAdmin;
