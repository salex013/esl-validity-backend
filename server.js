import express from "express";
import cors from "cors";

const app = express();

// --- basics ---
app.use(cors());
app.use(express.json({ limit: "4mb" }));

// --- admin auth (header + env var) ---
function getAdminKeyFromRequest(req) {
  return (
    req.get("x-admin-key") ||
    req.get("X-Admin-Key") ||
    req.headers["x-admin-key"] ||
    ""
  )
    .toString()
    .trim();
}

function getExpectedAdminKey() {
  return (process.env.ADMIN_KEY || "").toString().trim();
}

function requireAdmin(req, res, next) {
  const expected = getExpectedAdminKey();

  if (!expected) {
    return res.status(500).json({
      ok: false,
      error: "ADMIN_KEY is not set on the server (Render Environment).",
    });
  }

  const provided = getAdminKeyFromRequest(req);

  if (!provided || provided !== expected) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  return next();
}

// --- helpers ---
function safeString(x) {
  if (x === null || x === undefined) return "";
  return String(x);
}

function extractJSON(text) {
  // If model returns fenced JSON, try to extract it
  const t = safeString(text).trim();

  // Try direct parse first
  try {
    return JSON.parse(t);
  } catch {}

  // Try ```json ... ```
  const fenced = t.match(/```json\s*([\s\S]*?)\s*```/i) || t.match(/```\s*([\s\S]*?)\s*```/);
  if (fenced && fenced[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {}
  }

  // Try first {...} block
  const obj = t.match(/\{[\s\S]*\}/);
  if (obj) {
    try {
      return JSON.parse(obj[0]);
    } catch {}
  }

  return null;
}

async function groqChat({ system, user, temperature = 0.2 }) {
  const apiKey = (process.env.GROQ_API_KEY || "").toString().trim();
  if (!apiKey) throw new Error("GROQ_API_KEY is not set on the server (Render Environment).");

  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.1-70b-versatile",
      temperature,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Groq API error ${resp.status}: ${errText || resp.statusText}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content ?? "";
  return safeString(content);
}

// --- routes ---
app.get("/", (req, res) => {
  res.json({
    ok: true,
    name: "ESL Validity Tool Backend",
    timestamp: new Date().toISOString(),
    adminConfigured: Boolean(getExpectedAdminKey()),
    groqConfigured: Boolean(process.env.GROQ_API_KEY),
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    adminConfigured: Boolean(getExpectedAdminKey()),
    groqConfigured: Boolean(process.env.GROQ_API_KEY),
  });
});

app.get("/api/admin/ping", requireAdmin, (req, res) => {
  res.json({ ok: true, admin: true, timestamp: new Date().toISOString() });
});

// Helpful: list available routes (admin only)
app.get("/api/routes", requireAdmin, (req, res) => {
  const routes = [];
  app._router?.stack?.forEach((layer) => {
    if (layer?.route?.path) {
      const methods = Object.keys(layer.route.methods || {})
        .filter((m) => layer.route.methods[m])
        .map((m) => m.toUpperCase());
      routes.push({ path: layer.route.path, methods });
    }
  });
  res.json({ ok: true, routes });
});

// POST /api/analyze (admin protected)
app.post("/api/analyze", requireAdmin, async (req, res) => {
  try {
    const {
      framework = "CLB",
      level = "",
      skill = "",
      purpose = "",
      assessmentText = "",
      rubricText = "",
    } = req.body || {};

    if (!safeString(assessmentText).trim() && !safeString(rubricText).trim()) {
      return res.status(400).json({
        ok: false,
        error: "Provide assessmentText and/or rubricText to analyze.",
      });
    }

    const system = `
You are an assessment and language testing specialist (ESL/EAP).
Return STRICT JSON only. No markdown, no extra text.
Your job: evaluate validity, reliability, fairness, authenticity, practicality, washback.
Then propose concrete improvements and provide improved versions (clean and professional).

JSON schema:
{
  "summary": string,
  "scores": {
    "validity": number (0-5),
    "reliability": number (0-5),
    "fairness": number (0-5),
    "authenticity": number (0-5),
    "practicality": number (0-5),
    "washback": number (0-5)
  },
  "issues": [{ "area": string, "problem": string, "why_it_matters": string }],
  "quick_fixes": [string],
  "improved_assessment": string,
  "improved_rubric": string
}
`;

    const user = `
Context:
- Framework: ${framework}
- Level: ${level}
- Skill: ${skill}
- Purpose: ${purpose}

Assessment text:
${safeString(assessmentText)}

Rubric text:
${safeString(rubricText)}
`;

    const out = await groqChat({ system, user, temperature: 0.2 });
    const json = extractJSON(out);

    if (!json) {
      return res.status(500).json({
        ok: false,
        error: "Model did not return valid JSON.",
        raw: out.slice(0, 2000),
      });
    }

    return res.json({ ok: true, result: json });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// POST /api/generate (admin protected)
app.post("/api/generate", requireAdmin, async (req, res) => {
  try {
    const {
      framework = "CLB",
      level = "",
      skill = "",
      purpose = "",
      assessmentType = "",
      description = "",
      learningOutcomes = "",
    } = req.body || {};

    if (!safeString(skill).trim() || !safeString(level).trim()) {
      return res.status(400).json({ ok: false, error: "Provide at least skill and level." });
    }

    const system = `
You are an ESL/EAP assessment designer.
Return STRICT JSON only. No markdown.
Generate: (1) student-facing instructions, (2) teacher notes, (3) a professional rubric formatted for easy copy/paste into a table.

JSON schema:
{
  "title": string,
  "student_instructions": string,
  "teacher_notes": string,
  "rubric_table": {
    "columns": [string],
    "rows": [
      { "criterion": string, "descriptors": [string] }
    ]
  }
}
`;

    const user = `
Build an assessment package.

Framework: ${framework}
Level: ${level}
Skill: ${skill}
Purpose: ${purpose}
Assessment type: ${assessmentType}
Description/prompt: ${description}
Learning outcomes: ${learningOutcomes}

Rubric should use clear performance bands and descriptors aligned to the framework/level.
`;

    const out = await groqChat({ system, user, temperature: 0.35 });
    const json = extractJSON(out);

    if (!json) {
      return res.status(500).json({
        ok: false,
        error: "Model did not return valid JSON.",
        raw: out.slice(0, 2000),
      });
    }

    return res.json({ ok: true, result: json });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// --- 404 catch ---
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Route not found" });
});

// --- error handler ---
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ ok: false, error: "Internal server error" });
});

// --- start ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log("ADMIN_KEY set:", Boolean(process.env.ADMIN_KEY));
  console.log("GROQ_API_KEY set:", Boolean(process.env.GROQ_API_KEY));
});
