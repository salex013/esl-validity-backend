const express = require("express");
const crypto = require("crypto");

const router = express.Router();

// ✅ Your admin key (requested)
// Best practice is env var; this fallback keeps you moving.
const ADMIN_KEY = process.env.ADMIN_KEY || "sara-validity-2026-super-secret";

// Groq key: set in Render as GROQ_API_KEY
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// In-memory store (resets on redeploy)
const STORE = [];

// Normalize body fields so your frontend can send either name
function normalizePayload(body = {}) {
  const instructionsText =
    body.instructionsText ||
    body.extractedText ||
    body.instructions ||
    "";

  const rubricText =
    body.rubricText ||
    body.rubric ||
    "";

  return {
    skill: body.skill || "Unknown",
    levelFramework: body.levelFramework || "CLB",
    level: body.level || "",
    purpose: body.purpose || "",
    instructionsText,
    rubricText,
  };
}

function liteValidity(payload) {
  const issues = [];
  const strengths = [];
  const suggestions = [];

  const instrLen = (payload.instructionsText || "").trim().length;
  const rubricLen = (payload.rubricText || "").trim().length;

  if (instrLen >= 40) strengths.push("Instructions provided.");
  else issues.push("Instructions are very short or missing.");

  if (rubricLen >= 40) strengths.push("Rubric provided.");
  else issues.push("Rubric is very short or missing.");

  if (!payload.skill) issues.push("Skill not specified.");
  if (!payload.level) issues.push("Level not specified.");
  if (!payload.purpose) issues.push("Purpose not specified.");

  if (issues.length) {
    suggestions.push("Add clearer success criteria (what earns a strong score).");
    suggestions.push("Include time limits, length targets, and allowed supports (notes, dictionary, etc.).");
    suggestions.push("Ensure rubric categories match the task (e.g., pronunciation for speaking).");
  } else {
    suggestions.push("Looks OK. If you want deeper feedback, use Groq mode (default).");
  }

  const riskLevel =
    issues.length >= 4 ? "high" : issues.length >= 2 ? "medium" : "low";

  return {
    mode: "lite",
    summary:
      issues.length
        ? "Basic checks found potential gaps that may affect clarity/validity."
        : "Basic checks look OK.",
    strengths,
    issues,
    suggestions,
    riskLevel,
    metadata: {
      skill: payload.skill,
      levelFramework: payload.levelFramework,
      level: payload.level,
      purpose: payload.purpose,
    },
  };
}

async function groqValidity(payload) {
  if (!GROQ_API_KEY) {
    // If Groq isn’t configured, fall back safely
    return {
      ...liteValidity(payload),
      mode: "lite",
      summary:
        "Groq is not configured (missing GROQ_API_KEY). Returning lite checks.",
    };
  }

  const model = "llama-3.1-8b-instant";

  const system = `
You are an expert ESL/EAP assessment reviewer.
Return STRICT JSON only (no markdown).
Analyze the assessment task + rubric for validity, clarity, alignment, fairness/accessibility.
Provide: summary, strengths[], issues[], suggestions[], scores (0-3) for: clarity, alignment, measurability, fairness_accessibility, overall; and riskLevel (low/medium/high).
`;

  const user = `
Skill: ${payload.skill}
Framework: ${payload.levelFramework}
Level: ${payload.level}
Purpose: ${payload.purpose}

TASK / INSTRUCTIONS:
${payload.instructionsText}

RUBRIC:
${payload.rubricText}

Return JSON with keys:
summary, strengths, issues, suggestions, scores:{clarity,alignment,measurability,fairness_accessibility,overall}, riskLevel
`;

  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: system.trim() },
        { role: "user", content: user.trim() },
      ],
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    return {
      ...liteValidity(payload),
      mode: "lite",
      summary: `Groq request failed (${resp.status}). Returning lite checks.`,
      metadata: { groqError: txt?.slice(0, 500) || "unknown" },
    };
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content || "";

  // Parse the model JSON safely
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    // If the model returned extra text, try to extract the first JSON object
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      parsed = JSON.parse(content.slice(start, end + 1));
    } else {
      return {
        ...liteValidity(payload),
        mode: "lite",
        summary: "Groq returned non-JSON. Returning lite checks.",
        metadata: { groqRaw: content.slice(0, 600) },
      };
    }
  }

  return {
    mode: "groq",
    model,
    ...parsed,
    metadata: {
      ...(parsed.metadata || {}),
      skill: payload.skill,
      levelFramework: payload.levelFramework,
      level: payload.level,
      purpose: payload.purpose,
    },
  };
}

// POST /api/validity  (and POST /api/report)
router.post("/", async (req, res) => {
  try {
    const payload = normalizePayload(req.body || {});
    const mode = (req.query.mode || req.body?.mode || "groq").toLowerCase();

    const report =
      mode === "lite" ? liteValidity(payload) : await groqValidity(payload);

    const id = crypto.randomUUID();
    STORE.unshift({
      id,
      createdAt: new Date().toISOString(),
      mode: report.mode,
      input: payload,
      report,
    });

    // Keep store small
    if (STORE.length > 50) STORE.length = 50;

    return res.json({ ok: true, id, report });
  } catch (err) {
    return res
      .status(500)
      .json({ ok: false, error: err?.message || "Unknown error" });
  }
});

// Admin history: GET /api/report/history  (or /api/validity/history)
router.get("/history", (req, res) => {
  const key = req.header("x-admin-key") || "";
  if (key !== ADMIN_KEY) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const limit = Math.max(1, Math.min(50, Number(req.query.limit || 10)));
  const items = STORE.slice(0, limit).map((x) => ({
    id: x.id,
    createdAt: x.createdAt,
    mode: x.mode,
    skill: x.input.skill,
    levelFramework: x.input.levelFramework,
    level: x.input.level,
    purpose: x.input.purpose,
  }));

  return res.json({ ok: true, items });
});

module.exports = router;
