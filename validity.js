const express = require("express");
const router = express.Router();

/**
 * POST /api/validity
 * Body example:
 * {
 *   "skill": "Speaking",
 *   "levelFramework": "CLB",
 *   "level": "5",
 *   "purpose": "Summative",
 *   "instructionsText": "...",   // or extractedText
 *   "rubricText": "..."
 * }
 */
router.post("/", async (req, res) => {
  try {
    const {
      skill,
      levelFramework,
      level,
      purpose,
      instructionsText,
      extractedText,
      rubricText,
    } = req.body || {};

    const text = extractedText || instructionsText || "";
    if (!text.trim()) {
      return res.status(400).json({ ok: false, error: "Missing extractedText/instructionsText" });
    }

    // If you want OpenAI on/off quickly:
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    // If no API key, still return a helpful response (so endpoint works)
    if (!apiKey) {
      return res.json({
        ok: true,
        warning: "OPENAI_API_KEY not set on server. Returning fallback report.",
        report: {
          summary: "No AI analysis (missing API key).",
          quickChecks: [
            "Instructions received ✅",
            "Rubric received " + (rubricText ? "✅" : "⚠️"),
          ],
          suggestedFixes: [
            "Set OPENAI_API_KEY in Render Environment.",
          ],
        },
      });
    }

    const system = `
You are an ESL assessment validity checker. 
Return STRICT JSON only. No markdown. No extra commentary.

You will evaluate:
- Alignment between instructions and rubric
- CLB/CEFR appropriateness given skill + level
- Clarity, task validity, fairness, accessibility

Return this JSON shape:
{
  "summary": string,
  "alignmentScore": number, 
  "issues": [{ "type": string, "severity": "low"|"medium"|"high", "detail": string }],
  "suggestedImprovements": [string],
  "accessibilityNotes": [string]
}
`.trim();

    const user = `
Skill: ${skill || "Unknown"}
Framework: ${levelFramework || "Unknown"}
Level: ${level || "Unknown"}
Purpose: ${purpose || "Unknown"}

INSTRUCTIONS:
${text}

RUBRIC:
${rubricText || "(none provided)"}
`.trim();

    // Call OpenAI Chat Completions via fetch (works on Node 18+)
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return res.status(500).json({
        ok: false,
        error: "OpenAI request failed",
        status: response.status,
        details: errText.slice(0, 1000),
      });
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || "";

    // Try to parse strict JSON
    let report;
    try {
      report = JSON.parse(content);
    } catch {
      // If the model ever returns extra text, recover gracefully
      report = {
        summary: "AI returned non-JSON output. See raw.",
        alignmentScore: 0,
        issues: [{ type: "format", severity: "high", detail: "Model did not return valid JSON." }],
        suggestedImprovements: [],
        accessibilityNotes: [],
        raw: content,
      };
    }

    return res.json({ ok: true, report });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

module.exports = router;
