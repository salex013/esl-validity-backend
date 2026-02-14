const express = require("express");
const OpenAI = require("openai");

const router = express.Router();

// POST "/" so it works for BOTH:
// - /api/validity/
// - /api/report/
router.post("/", async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ ok: false, error: "Missing OPENAI_API_KEY" });
    }

    const client = new OpenAI({ apiKey });

    const {
      skill,
      levelFramework,
      level,
      purpose,
      instructionsText,
      rubricText,
      extractedText, // allow either name
    } = req.body || {};

    const instructions = extractedText || instructionsText || "";

    if (!skill || !levelFramework || !level || !purpose || !instructions || !rubricText) {
      return res.status(400).json({
        ok: false,
        error:
          "Missing required fields. Required: skill, levelFramework, level, purpose, instructionsText (or extractedText), rubricText",
      });
    }

    const prompt = `
You are an ESL assessment validity checker.

Return STRICT JSON with keys:
{
  "summary": string,
  "alignment": {
    "skillMatch": "strong|partial|weak",
    "levelMatch": "strong|partial|weak",
    "purposeMatch": "strong|partial|weak",
    "rubricMatch": "strong|partial|weak"
  },
  "issues": [{"severity":"high|medium|low","issue":string,"whyItMatters":string,"fixSuggestion":string}],
  "quickFixes": [string],
  "revisedInstructions": string
}

Context:
Skill: ${skill}
Framework: ${levelFramework}
Level: ${level}
Purpose: ${purpose}

Instructions:
${instructions}

Rubric:
${rubricText}
`.trim();

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: "You output ONLY valid JSON. No markdown. No commentary." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    });

    const text = completion.choices?.[0]?.message?.content || "";

    // Try to parse JSON safely
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return res.status(502).json({
        ok: false,
        error: "OpenAI returned non-JSON output",
        raw: text,
      });
    }

    return res.json({ ok: true, report: data });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || "Server error",
    });
  }
});

module.exports = router;
