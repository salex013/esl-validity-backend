const express = require("express");
const router = express.Router();

const { callGroq, liteValidity } = require("./llm");

function buildValidityPrompt({ skill, levelFramework, level, purpose, instructionsText, rubricText }) {
  const system = `
You are an expert ESL/EAP assessment designer.
Return ONLY valid JSON. No markdown. No extra commentary.

You must evaluate assessment validity + alignment for adult ESL learners.
Use concise, teacher-friendly language.

Output JSON schema:
{
  "mode": "groq",
  "model": "string",
  "summary": "string",
  "strengths": ["..."],
  "issues": ["..."],
  "suggestions": ["..."],
  "scores": {
    "clarity": 1-4,
    "alignment": 1-4,
    "measurability": 1-4,
    "fairness_accessibility": 1-4
  },
  "overall": { "band": 1-4, "label": "Approaches|Meets|Exceeds" },
  "riskLevel": "low|medium|high"
}

Scoring guide (1-4):
1 = major problems, 2 = some problems, 3 = solid, 4 = excellent.
Overall label:
1-2 Approaches, 3 Meets, 4 Exceeds.
`;

  const user = `
Analyze this ESL assessment:

Skill: ${skill || "(missing)"}
Level framework: ${levelFramework || "(missing)"}
Level: ${level || "(missing)"}
Purpose: ${purpose || "(missing)"}

Instructions:
${instructionsText || "(none)"}

Rubric:
${rubricText || "(none)"}

Focus areas:
- Are instructions clear and complete?
- Does rubric match the task and level?
- Are criteria observable/measurable?
- Any fairness/accessibility issues (time, bias, language load)?
- Provide actionable improvements.
`;

  return [
    { role: "system", content: system.trim() },
    { role: "user", content: user.trim() }
  ];
}

/**
 * POST /api/validity
 * Also works via alias POST /api/report (handled in server.js)
 *
 * Optional query:
 *  - ?mode=groq | lite | auto
 */
router.post("/", async (req, res) => {
  try {
    const {
      skill,
      levelFramework,
      level,
      purpose,
      instructionsText,
      rubricText
    } = req.body || {};

    const modeQuery = (req.query.mode || "").toLowerCase();
    const mode = modeQuery || "auto";

    // Always allow forced lite mode
    if (mode === "lite") {
      return res.json({ ok: true, report: liteValidity({ skill, levelFramework, level, purpose, instructionsText, rubricText }) });
    }

    const groqKey = process.env.GROQ_API_KEY;

    // If no Groq key or mode=auto and key missing -> lite
    if (!groqKey) {
      return res.json({ ok: true, report: liteValidity({ skill, levelFramework, level, purpose, instructionsText, rubricText }) });
    }

    const messages = buildValidityPrompt({ skill, levelFramework, level, purpose, instructionsText, rubricText });

    let content = await callGroq({
      apiKey: groqKey,
      model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
      temperature: 0.2,
      messages
    });

    // Parse JSON safely (Groq should return JSON, but just in case)
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      // If it returns stray text, do a simple cleanup attempt:
      const start = content.indexOf("{");
      const end = content.lastIndexOf("}");
      if (start >= 0 && end > start) {
        parsed = JSON.parse(content.slice(start, end + 1));
      } else {
        throw new Error("Model did not return valid JSON.");
      }
    }

    // Ensure required fields + fill defaults
    parsed.mode = "groq";
    parsed.model = parsed.model || (process.env.GROQ_MODEL || "llama-3.1-8b-instant");

    return res.json({ ok: true, report: parsed });
  } catch (err) {
    // Graceful fallback to lite if Groq fails/quota/etc.
    const status = err.status || 500;
    const msg = String(err.message || "Unknown error");
    if (status === 429 || msg.includes("quota") || msg.includes("rate") || msg.includes("insufficient")) {
      return res.json({
        ok: true,
        report: {
          ...liteValidity(req.body || {}),
          note: "Groq failed (quota/rate). Returned lite fallback instead."
        }
      });
    }

    return res.status(500).json({ ok: false, error: msg });
  }
});

module.exports = router;
