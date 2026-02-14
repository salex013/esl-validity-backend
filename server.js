// server.js
"use strict";

const express = require("express");
const cors = require("cors");

// Local modules (make sure these files exist in the same folder)
const { runValidityReport } = require("./validity");
const { runAutofix } = require("./autofix");

const app = express();

// ---- Config ----
const PORT = process.env.PORT || 10000;

// Allow CORS (set FRONTEND_ORIGIN in Render for tighter security)
const allowedOrigin = process.env.FRONTEND_ORIGIN || "*";
app.use(
  cors({
    origin: allowedOrigin === "*" ? true : allowedOrigin,
  })
);

app.use(express.json({ limit: "2mb" }));

// ---- Health ----
// Support BOTH routes so you can test either:
// https://yourservice.onrender.com/api/health
// https://yourservice.onrender.com/health
app.get(["/api/health", "/health"], (req, res) => {
  res.json({
    ok: true,
    name: "ESL Validity Tool Backend",
    timestamp: new Date().toISOString(),
  });
});

// ---- Routes ----

// Run report (no file creation)
app.post("/api/validity", async (req, res) => {
  try {
    const { extractedText, rubricText, meta } = req.body || {};

    if (!extractedText || typeof extractedText !== "string") {
      return res.status(400).json({ error: "Missing extractedText (string)." });
    }
    if (!rubricText || typeof rubricText !== "string") {
      return res.status(400).json({ error: "Missing rubricText (string)." });
    }

    const report = await runValidityReport({
      extractedText,
      rubricText,
      meta: meta || {},
    });

    res.json({ ok: true, report });
  } catch (err) {
    console.error("VALIDITY ERROR:", err);
    res.status(500).json({
      ok: false,
      error: "Server error while generating report.",
      details: err?.message || String(err),
    });
  }
});

// Fix + return ZIP of updated DOCX
app.post("/api/autofix", async (req, res) => {
  try {
    const { extractedText, rubricText, meta } = req.body || {};

    if (!extractedText || typeof extractedText !== "string") {
      return res.status(400).json({ error: "Missing extractedText (string)." });
    }
    if (!rubricText || typeof rubricText !== "string") {
      return res.status(400).json({ error: "Missing rubricText (string)." });
    }

    // runAutofix should return: { filename, buffer }
    // where buffer is a Node Buffer containing the ZIP bytes
    const { filename, buffer } = await runAutofix({
      extractedText,
      rubricText,
      meta: meta || {},
    });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename || "Updated_Assessment_Pack.zip"}"`
    );

    return res.send(buffer);
  } catch (err) {
    console.error("AUTOFIX ERROR:", err);
    res.status(500).json({
      ok: false,
      error: "Server error while generating fixed documents.",
      details: err?.message || String(err),
    });
  }
});

// Nice root message (optional)
app.get("/", (req, res) => {
  res.type("text").send(
    "ESL Validity Tool Backend is running.\nTry /api/health"
  );
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Not found" });
});

// Start
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
