// server.js (ROOT) — CommonJS entrypoint for Render: `node server.js`

require("dotenv").config();

const express = require("express");
const cors = require("cors");

const { callGroq, liteValidity } = require("./llm");

// --------------------
// App setup
// --------------------
const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// --------------------
// Simple admin auth (supports BOTH headers)
// - x-admin-key: <key>
// - Authorization: Bearer <key>
// --------------------
function getAdminKeyFromReq(req) {
  const x = req.get("x-admin-key");
  if (x) return x.trim();

  const auth = req.get("authorization");
  if (!auth) return "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

function adminOnly(req, res, next) {
  const expected = (process.env.ADMIN_KEY || "").trim();
  if (!expected) {
    return res.status(500).json({ ok: false, error: "ADMIN_KEY is not set on the server." });
  }
  const provided = getAdminKeyFromReq(req);

  // constant-ish compare (good enough for this use case)
  if (provided.length !== expected.length) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  if (mismatch !== 0) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  next();
}

// --------------------
// In-memory history (safe + simple for Render free tier)
// --------------------
const HISTORY = [];
const HISTORY_MAX = 200;

function addHistory(entry) {
  HISTORY.unshift(entry);
  if (HISTORY.length > HISTORY_MAX) HISTORY.length = HISTORY_MAX;
}

// --------------------
// Helpers
// --------------------
function nowIso() {
  return new Date().toISOString();
}

function requireFields(body, fields) {
  const missing = [];
  for (const f of fields) {
    if (body[f] === undefined || body[f] === null || String(body[f]).trim() === "") missing.push(f);
  }
  return missing;
}

function buildGroqMessages(payload) {
  const {
    skill,
    levelFramework,
    level,
    purpose,
    instructionsText,
    rubricText
  } = payload;

  return [
    {
      role: "system",
      content:
        "You are an ESL/EAP Assessment Designer and Validator. Return STRICT JSON only (no markdown)."
    },
    {
      role: "user",
      content:
        [
          "Validate the assessment for alignment, clarity, measurability, fairness/accessibility, and rubric quality.",
          "Return JSON with this shape:",
          `{`,
          `  "summary": string,`,
          `  "strengths": string[],`,
          `  "issues": string[],`,
          `  "suggestions": string[],`,
          `  "scores": { "clarity": 1|2|3|4, "alignment": 1|2|3|4, "measurability": 1|2|3|4, "fairness_accessibility": 1|2|3|4 },`,
          `  "overall": { "band": 1|2|3|4, "label": "Approaches"|"Meets"|"Exceeds" },`,
          `  "riskLevel": "low"|"medium"|"high"`,
          `}`,
          "",
          `Skill: ${skill}`,
          `Framework: ${levelFramework}`,
          `Level: ${level}`,
          `Purpose: ${purpose}`,
          "",
          `Instructions: ${instructionsText}`,
          "",
          `Rubric: ${rubricText}`
        ].join("\n")
    }
  ];
}

function safeJsonParse(maybeJsonText) {
  // Try strict parse first
  try {
    return JSON.parse(maybeJsonText);
  } catch (_) {}

  // Try to extract the first {...} block (in case model added extra text)
  const start = maybeJsonText.indexOf("{");
  const end = maybeJsonText.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const slice = maybeJsonText.slice(start, end + 1);
    try {
      return JSON.parse(slice);
    } catch (_) {}
  }

  return null;
}

// --------------------
// Routes
// --------------------
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    name: "ESL Validity Tool Backend",
    timestamp: nowIso(),
    groqConfigured: !!process.env.GROQ_API_KEY,
    liteAvailable: true
  });
});

app.get("/api/routes", (req, res) => {
  res.json({
    routes: [
      "GET  /api/health",
      "GET  /api/routes",
      "GET  /api/status",
      "POST /api/report",
      "GET  /api/history?limit=20 (admin)",
    ]
  });
});

app.get("/api/status", (req, res) => {
  res.json({
    ok: true,
    timestamp: nowIso(),
    env: {
      hasAdminKey: !!process.env.ADMIN_KEY,
      hasGroqKey: !!process.env.GROQ_API_KEY
    },
    defaults: {
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      temperature: process.env.GROQ_TEMP ? Number(process.env.GROQ_TEMP) : 0.2
    }
  });
});

/**
 * POST /api/report
 * Body:
 * {
 *   skill, levelFramework, level, purpose,
 *   instructionsText, rubricText,
 *   model?, temperature?
 * }
 *
 * Query:
 *   ?mode=lite   -> uses liteValidity()
 *   (default)    -> uses Groq if configured; otherwise lite fallback
 */
app.post("/api/report", async (req, res) => {
  try {
    const payload = req.body || {};

    const missing = requireFields(payload, [
      "skill",
      "levelFramework",
      "level",
      "purpose",
      "instructionsText",
      "rubricText"
    ]);
    if (missing.length) {
      return res.status(400).json({ ok: false, error: `Missing: ${missing.join(", ")}` });
    }

    const mode = (req.query.mode || "").toString().toLowerCase().trim();

    // Always allow explicit lite mode
    if (mode === "lite") {
      const report = liteValidity(payload);
      addHistory({ id: cryptoRandomId(), ts: nowIso(), mode: "lite", input: summarizeInput(payload), report });
      return res.json({ ok: true, report });
    }

    // If Groq not configured, fallback to lite
    const apiKey = (process.env.GROQ_API_KEY || "").trim();
    if (!apiKey) {
      const report = liteValidity(payload);
      addHistory({ id: cryptoRandomId(), ts: nowIso(), mode: "lite", input: summarizeInput(payload), report });
      return res.json({
        ok: true,
        report: {
          ...report,
          summary: "Groq not configured on server; returned lite checks."
        }
      });
    }

    const model = (payload.model || process.env.GROQ_MODEL || "llama-3.3-70b-versatile").trim();
    const temperature =
      payload.temperature !== undefined
        ? Number(payload.temperature)
        : process.env.GROQ_TEMP
          ? Number(process.env.GROQ_TEMP)
          : 0.2;

    // Use your llm.js helper to call Groq
    const messages = buildGroqMessages(payload);
    const content = await callGroq({ apiKey, messages, model, temperature });

    const parsed = safeJsonParse(content);
    let report;

    if (parsed && typeof parsed === "object") {
      report = {
        mode: "groq",
        model,
        ...parsed
      };
    } else {
      // If model output isn't parseable JSON, fallback to lite + include raw
      const lite = liteValidity(payload);
      report = {
        ...lite,
        mode: "lite",
        summary: "Groq returned non-JSON output; returned lite checks instead.",
        groqRaw: String(content || "").slice(0, 4000)
      };
    }

    addHistory({ id: cryptoRandomId(), ts: nowIso(), mode: report.mode, model, input: summarizeInput(payload), report });
    return res.json({ ok: true, report });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || "Server error"
    });
  }
});

app.get("/api/history", adminOnly, (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit || 20)));
  res.json({ ok: true, count: Math.min(limit, HISTORY.length), items: HISTORY.slice(0, limit) });
});

// --------------------
// Start
// --------------------
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// --------------------
// Small utilities
// --------------------
function cryptoRandomId() {
  // Node 18+ has global crypto
  try {
    return crypto.randomUUID();
  } catch (_) {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function summarizeInput(p) {
  return {
    skill: p.skill,
    levelFramework: p.levelFramework,
    level: p.level,
    purpose: p.purpose
  };
}
