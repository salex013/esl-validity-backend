const Groq = require("groq-sdk");

/**
 * Decide mode:
 * - ?mode=lite OR header x-mode=lite  => lite
 * - else try groq if GROQ_API_KEY exists
 * - if groq fails => lite fallback
 */
function getRequestedMode(req) {
  const q = String(req.query?.mode || "").toLowerCase();
  const h = String(req.headers["x-mode"] || "").toLowerCase();
  if (q === "lite" || h === "lite") return "lite";
  return "auto";
}

function safeTrim(s, max = 20000) {
  if (!s) return "";
  const t = String(s);
  return t.length > max ? t.slice(0, max) + "\n\n[TRUNCATED]" : t;
}

/** ---------- LITE CHECKS (no AI) ---------- */
function liteValidityReport({ skill, levelFramework, level, purpose, instructionsText, rubricText }) {
  const issues = [];
  const suggestions = [];

  const instr = (instructionsText || "").trim();
  const rubric = (rubricText || "").trim();

  if (!instr) issues.push("Missing instructionsText (task instructions).");
  if (!rubric) issues.push("Missing rubricText (assessment rubric).");

  if (instr.length > 0 && instr.length < 40) {
    issues.push("Instructions are very short; may be unclear for students.");
    suggestions.push("Add context: task goal, steps, time limit, and required language features.");
  }

  // Basic “rubric coverage” heuristic
  const rubricSignals = ["clarity", "organization", "vocabulary", "grammar", "pronunciation", "fluency", "content", "task", "criteria"];
  const foundSignals = rubricSignals.filter(w => rubric.toLowerCase().includes(w));
  if (rubric && foundSignals.length < 2) {
    issues.push("Rubric may be too vague (few clear criteria keywords detected).");
    suggestions.push("Include 3–5 criteria (e.g., task achievement, organization, language control, pronunciation/fluency).");
  }

  // Level sanity hints
  if (String(levelFramework).toLowerCase().includes("clb")) {
    if (String(level) === "5" && instr.toLowerCase().includes("research") && instr.toLowerCase().includes("cite")) {
      suggestions.push("For CLB 5, consider simplifying research/citation demands or providing a scaffold/template.");
    }
  }

  // Purpose sanity
  if (purpose && String(purpose).toLowerCase().includes("summative") && instr.toLowerCase().includes("practice")) {
    suggestions.push("If this is summative, remove 'practice' language or clarify grading weight.");
  }

  // Output shape similar to AI version
  return {
    mode: "lite",
    summary: issues.length ? "Some potential validity risks detected." : "No major issues detected by Lite checks.",
    issues,
    strengths: [
      ...(instr ? ["Instructions provided."] : []),
      ...(rubric ? ["Rubric provided."] : [])
    ],
    suggestions: suggestions.length ? suggestions : ["Looks OK. If you want deeper feedback, enable Groq mode."],
    metadata: {
      skill: skill || null,
      levelFramework: levelFramework || null,
      level: level || null,
      purpose: purpose || null
    }
  };
}

/** ---------- GROQ ---------- */
async function groqValidityReport({ skill, levelFramework, level, purpose, instructionsText, rubricText }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("Missing GROQ_API_KEY");

  const groq = new Groq({ apiKey });

  const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

  const system = `
You are an ESL assessment quality checker.
Return ONLY valid JSON (no markdown) with keys:
summary (string),
strengths (string[]),
issues (string[]),
suggestions (string[]),
alignment (object with keys: skillMatch, levelMatch, purposeMatch as strings),
riskLevel (one of: "low","medium","high").
Be concise and practical.
`.trim();

  const user = `
Analyze this assessment.

Skill: ${skill || "N/A"}
Level framework: ${levelFramework || "N/A"}
Level: ${level || "N/A"}
Purpose: ${purpose || "N/A"}

Instructions:
${safeTrim(instructionsText, 15000)}

Rubric:
${safeTrim(rubricText, 15000)}
`.trim();

  const resp = await groq.chat.completions.create({
    model,
    temperature: 0.2,
    max_tokens: 900,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ]
  });

  const text = resp.choices?.[0]?.message?.content || "";
  // Best-effort JSON parse
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    // Try to salvage JSON if model added extra text
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      parsed = JSON.parse(text.slice(start, end + 1));
    } else {
      throw new Error("Groq returned non-JSON.");
    }
  }

  return { mode: "groq", model, ...parsed };
}

/** ---------- HANDLER ---------- */
module.exports = async function validityHandler(req, res) {
  try {
    const modeReq = getRequestedMode(req);

    const {
      skill,
      levelFramework,
      level,
      purpose,
      instructionsText,
      rubricText,
      extractedText // allow legacy field
    } = req.body || {};

    const instructions = instructionsText || extractedText || "";

    // Minimal validation
    if (!instructions && !rubricText) {
      return res.status(400).json({
        ok: false,
        error: "Missing instructionsText (or extractedText) and rubricText."
      });
    }

    if (modeReq === "lite") {
      const report = liteValidityReport({
        skill, levelFramework, level, purpose,
        instructionsText: instructions,
        rubricText
      });
      return res.json({ ok: true, report });
    }

    // auto: try groq, fallback to lite
    try {
      const report = await groqValidityReport({
        skill, levelFramework, level, purpose,
        instructionsText: instructions,
        rubricText
      });
      return res.json({ ok: true, report });
    } catch (err) {
      const report = liteValidityReport({
        skill, levelFramework, level, purpose,
        instructionsText: instructions,
        rubricText
      });
      return res.json({
        ok: true,
        report,
        fallback: {
          from: "groq",
          to: "lite",
          reason: String(err?.message || err)
        }
      });
    }
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
};
