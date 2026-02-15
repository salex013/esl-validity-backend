// src/server.js
"use strict";

const express = require("express");
const cors = require("cors");

// Load env locally; harmless on Render if dotenv isn't installed or .env doesn't exist.
// (Recommended: keep dotenv installed in dependencies anyway.)
try {
  require("dotenv").config();
} catch (e) {
  // ignore
}

const { adminOnly } = require("./middleware/admin");

// If you already have these modules, keep them.
// If not, you can remove the unused ones.
const { buildReport } = require("./validity");     // <-- adjust if your project exports differently
const { extractTextFromAny } = require("./extract"); // <-- adjust if your project exports differently

const app = express();

// ---- CORS ----
const allowAll = process.env.CORS_ALLOW_ALL === "true";
const allowOrigin = process.env.CORS_ORIGIN || "*";

app.use(
  cors({
    origin: allowAll ? "*" : allowOrigin,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-admin-key"],
  })
);

app.use(express.json({ limit: "4mb" }));

// ---- Health ----
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    name: "ESL Validity Tool Backend",
    timestamp: new Date().toISOString(),
    groqConfigured: Boolean(process.env.GROQ_API_KEY),
    adminConfigured: Boolean((process.env.ADMIN_KEY || "").trim()),
  });
});

// ---- Report (AI validity check) ----
// Expected body: { instructions, rubric, ...meta }
app.post("/api/report", async (req, res) => {
  try {
    const payload = req.body || {};
    const result = await buildReport(payload); // must return JSON-safe object
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: "Report generation failed",
      detail: err?.message || String(err),
    });
  }
});

// ---- Extract text from uploaded/doc content (optional endpoint) ----
// If you’re adding “upload any document type”, you’ll likely use this endpoint.
// Expected body: { filename, mimeType, base64 } or { url }
app.post("/api/extract", async (req, res) => {
  try {
    const payload = req.body || {};
    const extracted = await extractTextFromAny(payload);
    res.json({ ok: true, extracted });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: "Extract failed",
      detail: err?.message || String(err),
    });
  }
});

// ---- Admin history (protected) ----
app.get("/api/history", adminOnly, async (req, res) => {
  // If you already store history somewhere, plug it in here.
  // For now, return empty.
  res.json({ ok: true, count: 0, items: [] });
});

// ---- Start ----
const port = Number(process.env.PORT || 10000);
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log("=> Your service is live 🚀");
});
