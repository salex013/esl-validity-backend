const express = require("express");
const router = express.Router();

// -----------------------------
// Lite fallback (free, instant)
// -----------------------------
function liteCheck(data) {
  return {
    mode: "lite",
    summary: "Basic structural validity check completed.",
    strengths: [
      data.instructionsText ? "Instructions provided." : null,
      data.rubricText ? "Rubric provided." : null
    ].filter(Boolean),
    issues: [
      !data.instructionsText ? "Missing instructions." : null,
      !data.rubricText ? "Missing rubric." : null
    ].filter(Boolean),
    suggestions: [
      "Ensure task aligns with CLB level.",
      "Include explicit performance criteria.",
      "Consider fairness and accessibility."
    ]
  };
}

// -----------------------------
// Groq version
// -----------------------------
async function groqCheck(data) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content: "You are an ESL assessment validity expert."
        },
        {
          role: "user",
          content: `
Skill: ${data.skill}
Framework: ${data.levelFramework}
Level: ${data.level}
Purpose: ${data.purpose}

Instructions:
${data.instructionsText}

Rubric:
${data.rubricText}

Evaluate validity, alignment, clarity, and fairness.
Respond in JSON with: summary, strengths, issues, suggestions.
`
        }
      ],
      temperature: 0.3
    })
  });

  const json = await response.json();
  const content = json.choices?.[0]?.message?.content || "{}";

  try {
    const parsed = JSON.parse(content);
    return { mode: "groq", ...parsed };
  } catch {
    return {
      mode: "groq",
      summary: content
    };
  }
}

// -----------------------------
// Route
// -----------------------------
router.post("/", async (req, res) => {
  try {
    const data = req.body;

    if (process.env.GROQ_API_KEY) {
      const result = await groqCheck(data);
      return res.json({ ok: true, report: result });
    }

    const lite = liteCheck(data);
    res.json({ ok: true, report: lite });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      ok: false,
      error: "Validity check failed."
    });
  }
});

module.exports = router;
