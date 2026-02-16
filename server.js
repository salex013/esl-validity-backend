// src/server.js

require("dotenv").config();

const express = require("express");
const cors = require("cors");

const admin = require("./middleware/admin.js");

const app = express();

app.use(cors());
app.use(express.json({ limit: "15mb" }));

// --- Health check (matches what you were seeing) ---
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    name: "ESL Validity Tool Backend",
    timestamp: new Date().toISOString(),
    groqConfigured: !!process.env.GROQ_API_KEY,
    adminConfigured: !!process.env.ADMIN_KEY,
  });
});

// --- Example protected endpoint (history) ---
app.get("/api/history", admin, async (req, res) => {
  // If your project stores history elsewhere, swap this section out.
  // For now, return a safe placeholder so the route works.
  res.json({
    ok: true,
    items: [],
    message:
      "History endpoint is protected and working. Plug in your real storage here.",
  });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
