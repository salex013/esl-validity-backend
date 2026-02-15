const express = require("express");

const router = express.Router();
const GROQ_API_KEY = process.env.GROQ_API_KEY;

function normalizePayload(body = {}) {
  const extractedText =
    body.extractedText ||
    body.instructionsText ||
    "";

  const rubricText =
    body.rubricText ||
    body.rubric ||
    "";

  return {
    extractedText,
    rubricText,
    levelFramework: body.levelFramework || "CLB",
    level: body.level || "",
    skill: body.skill || "Unknown",
  };
}

function liteFix(payload) {
  const fixes = [];
  if (!payload.extractedText?.trim()) fixes.push("Add clear task instructions.");
  if (!payload.rubricText?.trim()) fixes.push("Add a rubric with measurable criteria.");
  if (payload.extractedText?.length < 60) fixes.push("Add timing/length requirements and steps.");

  return {
    mode: "lite",
    summary: "Lite fixer: basic suggestions only (no AI rewrite).",
    fixes,
    improvedInstructions: payload.extractedText || "",
    improvedRubric: payload.rubricText || "",
  };
}

async function groqFix(payload) {
  if (!GROQ_API_KEY) return liteFix(payload);

  const model = "llama-3.1-8b-instant";

  const system = `
You improve ESL assessment instructions and rubrics.
Return STRICT JSON only.
Return:
summary, improvedInstructions, improvedRubric, notes[]
Make changes aligned to the provided framework/level and skill.
`;

  const user = `
Framework: ${payload.levelFramework}
Level: ${payload.level}
Skill: ${payload.skill}

Original instructions:
${payload.extractedText}

Original rubric:
${payload.rubricText}

Return JSON with keys:
summary, improvedInstructions, improvedRubric, notes
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
    return {
      ...liteFix(payload),
      summary: `Groq request failed (${resp.status}). Returning lite fix.`,
    };
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content || "";

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      parsed = JSON.parse(content.slice(start, end + 1));
    } else {
      return {
        ...liteFix(payload),
        summary: "Groq returned non-JSON. Returning lite fix.",
      };
    }
  }

  return {
    mode: "groq",
    model,
    ...parsed,
  };
}

// POST /api/autofix  (and POST /api/fix)
router.post("/", async (req, res) => {
  try {
    const payload = normalizePayload(req.body || {});
    const mode = (req.query.mode || req.body?.mode || "groq").toLowerCase();

    const result = mode === "lite" ? liteFix(payload) : await groqFix(payload);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || "Unknown error" });
  }
});

module.exports = router;
