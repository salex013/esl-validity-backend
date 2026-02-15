const express = require("express");
const router = express.Router();

const { callGroq } = require("./llm");

function liteFix({ instructionsText = "", rubricText = "" }) {
  const improvedInstructions =
    instructionsText.trim()
      ? instructionsText.trim() + "\n\n(Quick fix tip: Add time limit + required elements + submission format.)"
      : "Add: time limit, topic, steps, required elements, and submission format.";

  const improvedRubric =
    rubricText.trim()
      ? rubricText.trim() + "\n\n(Quick fix tip: Add 3–5 criteria + 3 levels with observable descriptors.)"
      : "Create a rubric with 3–5 criteria (clarity, organization, vocabulary, accuracy, task completion) and 3 levels (Approaches/Meets/Exceeds).";

  return {
    mode: "lite",
    improvedInstructions,
    improvedRubric
  };
}

function buildFixPrompt({ instructionsText, rubricText }) {
  const system = `
You are an expert ESL assessment editor.
Return ONLY JSON (no markdown).

Schema:
{
  "mode":"groq",
  "model":"string",
  "improvedInstructions":"string",
  "improvedRubric":"string",
  "notes":["..."]
}

Rules:
- Keep language teacher-friendly.
- Make rubric criteria observable and level-appropriate.
- Keep it concise.
`;

  const user = `
Improve this assessment:

Instructions:
${instructionsText || "(none)"}

Rubric:
${rubricText || "(none)"}

Make the instructions clearer + more complete.
Make the rubric more measurable (criteria + performance descriptors).
`;

  return [
    { role: "system", content: system.trim() },
    { role: "user", content: user.trim() }
  ];
}

/**
 * POST /api/autofix
 * Also works via alias POST /api/fix (handled in server.js)
 *
 * Optional query:
 *  - ?mode=groq | lite | auto
 */
router.post("/", async (req, res) => {
  try {
    const { instructionsText, rubricText } = req.body || {};
    const modeQuery = (req.query.mode || "").toLowerCase();
    const mode = modeQuery || "auto";

    if (mode === "lite") {
      return res.json({ ok: true, fix: liteFix({ instructionsText, rubricText }) });
    }

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      return res.json({ ok: true, fix: liteFix({ instructionsText, rubricText }) });
    }

    const messages = buildFixPrompt({ instructionsText, rubricText });
    let content = await callGroq({
      apiKey: groqKey,
      model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
      temperature: 0.2,
      messages
    });

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      const start = content.indexOf("{");
      const end = content.lastIndexOf("}");
      parsed = JSON.parse(content.slice(start, end + 1));
    }

    parsed.mode = "groq";
    parsed.model = parsed.model || (process.env.GROQ_MODEL || "llama-3.1-8b-instant");

    return res.json({ ok: true, fix: parsed });
  } catch (err) {
    // fallback instead of failing
    return res.json({
      ok: true,
      fix: {
        ...liteFix(req.body || {}),
        note: "Groq failed; returned lite fallback."
      }
    });
  }
});

module.exports = router;
