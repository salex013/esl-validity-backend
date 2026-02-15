const Groq = require("groq-sdk");

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

/** --------- LITE AUTOFIX (no AI) ---------- */
function liteAutofix({ skill, levelFramework, level, purpose, instructionsText, rubricText }) {
  const instr = (instructionsText || "").trim();
  const rubric = (rubricText || "").trim();

  // Very simple scaffolded rewrite templates
  const improvedInstructions = instr
    ? [
        "TASK: " + instr.replace(/\s+/g, " ").trim(),
        "",
        "STUDENT-FRIENDLY STEPS:",
        "1) Read the task carefully.",
        "2) Plan your ideas (use keywords).",
        "3) Complete the task (time limit if given).",
        "4) Check: content, organization, language accuracy.",
        "",
        "SUCCESS TIPS:",
        "- Use clear topic sentences.",
        "- Use examples/details.",
        "- Speak/write clearly and at a steady pace."
      ].join("\n")
    : "No instructions provided.";

  const improvedRubric = rubric
    ? [
        "RUBRIC (Refined):",
        "- Task Achievement: meets the instructions and purpose",
        "- Organization: clear structure; logical order",
        "- Language: appropriate vocabulary + grammar control",
        "- (Speaking) Delivery: clarity, pronunciation, fluency / (Writing) Mechanics: spelling, punctuation",
        "",
        "ORIGINAL RUBRIC:",
        rubric
      ].join("\n")
    : "No rubric provided.";

  return {
    mode: "lite",
    summary: "Generated a scaffolded version of your instructions and a clarified rubric template.",
    improved: {
      instructionsText: improvedInstructions,
      rubricText: improvedRubric
    },
    notes: [
      "Lite mode uses templates and heuristics (no AI).",
      "If Groq is enabled, you’ll get a more customized rewrite."
    ],
    metadata: { skill: skill || null, levelFramework: levelFramework || null, level: level || null, purpose: purpose || null }
  };
}

/** --------- GROQ AUTOFIX ---------- */
async function groqAutofix({ skill, levelFramework, level, purpose, instructionsText, rubricText }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("Missing GROQ_API_KEY");

  const groq = new Groq({ apiKey });
  const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

  const system = `
You rewrite ESL assessment materials for clarity and validity.
Return ONLY JSON with keys:
summary (string),
improved (object with keys instructionsText, rubricText),
changes (string[]),
warnings (string[]).
Keep it concise and aligned to the given level/purpose.
`.trim();

  const user = `
Rewrite these materials.

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
    temperature: 0.3,
    max_tokens: 900,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ]
  });

  const text = resp.choices?.[0]?.message?.content || "";
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
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

/** --------- HANDLER ---------- */
module.exports = async function autofixHandler(req, res) {
  try {
    const modeReq = getRequestedMode(req);

    const {
      skill,
      levelFramework,
      level,
      purpose,
      instructionsText,
      rubricText,
      extractedText
    } = req.body || {};

    const instructions = instructionsText || extractedText || "";

    if (!instructions && !rubricText) {
      return res.status(400).json({
        ok: false,
        error: "Missing instructionsText (or extractedText) and rubricText."
      });
    }

    if (modeReq === "lite") {
      const result = liteAutofix({
        skill, levelFramework, level, purpose,
        instructionsText: instructions,
        rubricText
      });
      return res.json({ ok: true, result });
    }

    try {
      const result = await groqAutofix({
        skill, levelFramework, level, purpose,
        instructionsText: instructions,
        rubricText
      });
      return res.json({ ok: true, result });
    } catch (err) {
      const result = liteAutofix({
        skill, levelFramework, level, purpose,
        instructionsText: instructions,
        rubricText
      });
      return res.json({
        ok: true,
        result,
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
