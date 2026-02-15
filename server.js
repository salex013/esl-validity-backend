// src/server.js

// Load .env locally only (Render already provides env vars)
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const express = require("express");
const cors = require("cors");

const { callGroq, liteValidity } = require("./llm");

const app = express();

// ---- Config ----
const PORT = process.env.PORT || 10000;

// Set these in Render Environment:
// GROQ_API_KEY=...
// ADMIN_KEY=...
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const ADMIN_KEY = process.env.ADMIN_KEY || "";

// ---- Middleware ----
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ---- Helpers ----
function ok(res, payload = {}) {
  return res.json({ ok: true, ...payload });
}
function fail(res, status, message, extra = {}) {
  return res.status(status).json({ ok: false, error: message, ...extra });
}

function isAdmin(req) {
  const xAdmin = req.header("x-admin-key");
  const auth = req.header("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const token = xAdmin || bearer;
  return Boolean(ADMIN_KEY && token && token === ADMIN_KEY);
}

// ---- Routes ----
app.get("/api/health", (req, res) => {
  ok(res, {
    name: "ESL Validity Tool Backend",
    timestamp: new Date().toISOString(),
    groqConfigured: Boolean(GROQ_API_KEY),
    adminConfigured: Boolean(ADMIN_KEY)
  });
});

app.get("/api/routes", (req, res) => {
  ok(res, {
    routes: [
      "GET /api/health",
      "GET /api/routes",
      "POST /api/report",
      "POST /api/report?mode=lite",
      "GET /api/history?limit=20 (admin)"
    ]
  });
});

/**
 * POST /api/report
 * Body:
 * {
 *   skill, levelFramework, level, purpose,
 *   instructionsText, rubricText,
 *   title?, criteriaFocus? (optional)
 * }
 *
 * Query:
 *   mode=lite  -> forces lite
 */
app.post("/api/report", async (req, res) => {
  const {
    skill,
    levelFramework,
    level,
    purpose,
    instructionsText,
    rubricText,
    title = "",
    criteriaFocus = "" // optional: validity/reliability/washback/etc.
  } = req.body || {};

  const mode = (req.query.mode || "").toLowerCase();
  const forceLite = mode === "lite";

  // Basic validation
  if (!skill || !levelFramework || !level || !purpose) {
    return fail(res, 400, "Missing required fields: skill, levelFramework, level, purpose.");
  }
  if (!instructionsText || !rubricText) {
    return fail(res, 400, "Missing required fields: instructionsText and rubricText.");
  }

  // If no Groq key or mode forced -> lite
  if (forceLite || !GROQ_API_KEY) {
    const report = liteValidity({ skill, levelFramework, level, purpose, instructionsText, rubricText });
    return ok(res, { report });
  }

  // Groq mode
  try {
    const system = `
You are an ESL/EAP assessment specialist.
Your job: evaluate an assessment's validity quality and provide actionable improvements.

Return STRICT JSON with keys:
mode, summary, strengths[], issues[], suggestions[], scores{clarity,alignment,measurability,fairness_accessibility}, overall{band,label}, riskLevel, metadata.

Scoring: 1 (weak) to 4 (strong).
overall.band: 1-4, label: Approaches/Meets/Exceeds.
riskLevel: low/medium/high.
    `.trim();

    const user = `
ASSESSMENT CONTEXT
Title: ${title}
Skill: ${skill}
Framework: ${levelFramework}
Level: ${level}
Purpose: ${purpose}
Focus: ${criteriaFocus}

STUDENT INSTRUCTIONS
${instructionsText}

RUBRIC
${rubricText}
    `.trim();

    const content = await callGroq({
      apiKey: GROQ_API_KEY,
      model: "llama-3.1-8b-instant",
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    });

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      // If Groq returns non-JSON, fall back to lite with a warning
      const report = liteValidity({ skill, levelFramework, level, purpose, instructionsText, rubricText });
      report.mode = "lite";
      report.summary = "Groq returned non-JSON. Returned lite checks instead.";
      return ok(res, { report });
    }

    // Ensure a minimum shape
    parsed.mode = parsed.mode || "groq";
    parsed.metadata = parsed.metadata || { skill, levelFramework, level, purpose };

    return ok(res, { report: parsed });
  } catch (err) {
    // If Groq fails for any reason, fallback to lite
    const report = liteValidity({ skill, levelFramework, level, purpose, instructionsText, rubricText });
    report.mode = "lite";
    report.summary = "Groq failed; returned lite checks instead.";
    return ok(res, { report, groqError: err?.message || "Unknown error" });
  }
});

/**
 * Admin history endpoint (simple placeholder)
 * GET /api/history?limit=5
 *
 * This version returns an empty list unless you later add persistence.
 */
app.get("/api/history", (req, res) => {
  if (!isAdmin(req)) return fail(res, 401, "Unauthorized");
  const limit = Math.max(1, Math.min(50, Number(req.query.limit || 20)));
  ok(res, { count: 0, items: [], limit });
});

// Root
app.get("/", (req, res) => {
  res.type("text").send("ESL Validity Tool Backend is running. Try /api/health");
});

// ---- Start ----
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
