// validity.js (root)
// Groq uses an OpenAI-compatible endpoint:
// POST https://api.groq.com/openai/v1/chat/completions
// Header: Authorization: Bearer <GROQ_API_KEY>

async function groqChat({ system, user, temperature = 0.2 }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set.");

  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      temperature,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Groq error ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content || "";
  return content;
}

// Very simple “lite” checker (free, deterministic)
function liteValidity(input) {
  const issues = [];
  const strengths = [];

  const skill = (input?.skill || "").trim();
  const levelFramework = (input?.levelFramework || "").trim();
  const level = String(input?.level || "").trim();
  const purpose = (input?.purpose || "").trim();
  const instructionsText = (input?.instructionsText || "").trim();
  const rubricText = (input?.rubricText || "").trim();

  if (skill) strengths.push("Skill is specified.");
  else issues.push("Missing skill (e.g., Speaking/Writing/Reading/Listening).");

  if (levelFramework) strengths.push("Level framework is specified.");
  else issues.push("Missing levelFramework (e.g., CLB/CEFR).");

  if (level) strengths.push("Level is specified.");
  else issues.push("Missing level.");

  if (purpose) strengths.push("Purpose is specified.");
  else issues.push("Missing purpose (Formative/Summative/etc.).");

  if (instructionsText.length >= 20) strengths.push("Instructions are provided.");
  else issues.push("Instructions are missing or too short.");

  if (rubricText.length >= 20) strengths.push("Rubric is provided.");
  else issues.push("Rubric is missing or too short.");

  const suggestions = [];
  if (!rubricText) suggestions.push("Add a rubric with clear criteria + performance descriptors.");
  if (!instructionsText) suggestions.push("Add step-by-step student instructions (time, task, deliverable).");
  if (instructionsText && !/time|minute|minutes/i.test(instructionsText)) {
    suggestions.push("Consider adding time expectations (e.g., 3 minutes, 150–200 words, etc.).");
  }

  return {
    mode: "lite",
    summary: issues.length ? "Some issues detected by lite checks." : "No major issues detected by lite checks.",
    strengths,
    issues,
    suggestions,
    riskLevel: issues.length >= 3 ? "high" : issues.length ? "medium" : "low",
    metadata: {
      skill,
      levelFramework,
      level,
      purpose,
    },
  };
}

async function runValidity(input, opts = {}) {
  const requestedMode = (opts.mode || "").toLowerCase(); // "groq" | "lite" | ""
  const forceLite = requestedMode === "lite";
  const forceGroq = requestedMode === "groq";

  // If forced lite, do it.
  if (forceLite) return liteValidity(input);

  // Try Groq unless missing key or Groq fails (unless forceGroq)
  const hasGroq = !!process.env.GROQ_API_KEY;

  if (!hasGroq && forceGroq) {
    throw new Error("mode=groq requested but GROQ_API_KEY is not set.");
  }

  if (!hasGroq) return liteValidity(input);

  const system =
    "You are an expert ESL/EAP assessment designer. Return ONLY valid JSON matching the schema the user requests.";

  const user = `
Analyze this assessment for validity/alignment and return JSON with:
{
  "mode": "groq",
  "model": "<string>",
  "summary": "<short paragraph>",
  "strengths": ["..."],
  "issues": ["..."],
  "suggestions": ["..."],
  "scores": { "clarity": 0-2, "alignment": 0-2, "measurability": 0-2, "fairness_accessibility": 0-2, "overall": 0-8 },
  "riskLevel": "low"|"medium"|"high"
}

Input:
${JSON.stringify(input, null, 2)}
`;

  try {
    const raw = await groqChat({ system, user, temperature: 0.2 });

    // Try to extract JSON even if model wraps it.
    const jsonText = raw.trim().startsWith("{")
      ? raw.trim()
      : raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);

    const parsed = JSON.parse(jsonText);

    // Ensure required fields exist
    return {
      mode: "groq",
      model: "llama-3.1-8b-instant",
      ...parsed,
    };
  } catch (err) {
    if (forceGroq) throw err;
    // fallback
    return liteValidity(input);
  }
}

module.exports = { runValidity };
