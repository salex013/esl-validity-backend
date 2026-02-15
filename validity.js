const express = require("express");
const router = express.Router();
const { storage } = require("./src/storage");

// -------- Lite fallback ----------
function liteCheck(data) {
  const missing = [];
  if (!data.instructionsText) missing.push("Missing instructionsText");
  if (!data.rubricText) missing.push("Missing rubricText");

  return {
    summary: "No major issues detected by Lite checks.",
    strengths: [
      data.instructionsText ? "Instructions provided." : null,
      data.rubricText ? "Rubric provided." : null
    ].filter(Boolean),
    issues: missing.length ? missing : [],
    suggestions: missing.length
      ? ["Add missing fields and re-run."]
      : ["If you want deeper feedback, keep Groq enabled."]
  };
}

// -------- Groq ----------
async function groqCheck(data) {
  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      temperature: 0.3,
      messages: [
        { role: "system", content: "You are an ESL assessment validity expert." },
        {
          role: "user",
          content: `
Return JSON only.

Task metadata:
- skill: ${data.skill}
- framework: ${data.levelFramework}
- level: ${data.level}
- purpose: ${data.purpose}

Instructions:
${data.instructionsText || ""}

Rubric:
${data.rubricText || ""}

Evaluate validity/alignment/clarity/fairness.
Return JSON with keys: summary, strengths (array), issues (array), suggestions (array), riskLevel (low/medium/high).
`
        }
      ]
    })
  });

  const json = await resp.json();

  // Groq can return errors; bubble a readable message
  if (!resp.ok) {
    const msg =
      json?.error?.message ||
      json?.message ||
      `Groq error (status ${resp.status})`;
    throw new Error(msg);
  }

  const content = json.choices?.[0]?.message?.content || "{}";

  try {
    return JSON.parse(content);
  } catch {
    // If model ever returns non-JSON, still save it
    return {
      summary: content,
      strengths: [],
      issues: ["Model returned non-JSON output."],
      suggestions: ["Retry, or use lite mode."],
      riskLevel: "medium"
    };
  }
}

// -------- route ----------
router.post("/", async (req, res) => {
  try {
    const data = req.body || {};
    const modeParam = (req.query.mode || "").toString().toLowerCase();

    // normalize old frontend field name if needed
    if (!data.instructionsText && data.extractedText) {
      data.instructionsText = data.extractedText;
    }

    let modeUsed = "lite";
    let report;

    const forceLite = modeParam === "lite";
    const canGroq = !!process.env.GROQ_API_KEY && !forceLite;

    if (canGroq) {
      try {
        report = await groqCheck(data);
        modeUsed = "groq";
      } catch (e) {
        // fallback to lite
        report = liteCheck(data);
        modeUsed = "lite";
        report.issues = [
          ...(report.issues || []),
          `Groq failed: ${e.message}`
        ];
        report.riskLevel = report.riskLevel || "medium";
      }
    } else {
      report = liteCheck(data);
      modeUsed = "lite";
    }

    const saved = await storage.save({
      input: {
        skill: data.skill,
        levelFramework: data.levelFramework,
        level: data.level,
        purpose: data.purpose,
        instructionsText: data.instructionsText || "",
        rubricText: data.rubricText || ""
      },
      output: report,
      mode: modeUsed
    });

    res.json({
      ok: true,
      id: saved.id,
      report: {
        mode: modeUsed,
        ...report
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      ok: false,
      error: err.message || "Validity check failed"
    });
  }
});

module.exports = router;
