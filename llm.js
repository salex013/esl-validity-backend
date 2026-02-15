async function callGroq({ apiKey, messages, model = "llama-3.1-8b-instant", temperature = 0.2 }) {
  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature,
      messages
    })
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    const err = new Error(`Groq error ${resp.status}: ${text}`);
    err.status = resp.status;
    throw err;
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content || "";
  return content;
}

/**
 * Lite fallback: zero-cost local heuristic analysis
 */
function liteValidity({ skill, levelFramework, level, purpose, instructionsText, rubricText }) {
  const issues = [];
  const strengths = [];
  const suggestions = [];

  const instrLen = (instructionsText || "").trim().length;
  const rubricLen = (rubricText || "").trim().length;

  if (!instructionsText || instrLen < 60) issues.push("Instructions are very short or missing key details (time, task steps, audience, constraints).");
  else strengths.push("Instructions provided.");

  if (!rubricText || rubricLen < 60) issues.push("Rubric is very short or missing clear criteria/levels.");
  else strengths.push("Rubric provided.");

  if (!purpose) issues.push("Purpose is missing (formative/summative).");
  if (!skill) issues.push("Skill is missing (Speaking/Writing/etc.).");
  if (!levelFramework || !level) issues.push("Level framework/level missing.");

  if (issues.length) {
    suggestions.push("Add: time limit, number of parts, topic constraints, and what students must include.");
    suggestions.push("Rubric: list 3–5 criteria + 3 performance levels with observable descriptors.");
  } else {
    suggestions.push("Looks OK. If you want deeper feedback, use Groq mode.");
  }

  // Simple CLB-ish “band”
  const band = issues.length >= 3 ? 1 : issues.length === 2 ? 2 : issues.length === 1 ? 3 : 4;
  const label = band <= 2 ? "Approaches" : band === 3 ? "Meets" : "Exceeds";

  return {
    mode: "lite",
    summary: issues.length ? "Some potential validity issues detected by lite checks." : "No major issues detected by lite checks.",
    strengths,
    issues,
    suggestions,
    scores: {
      clarity: band,
      alignment: band,
      measurability: band
    },
    overall: { band, label },
    riskLevel: issues.length >= 3 ? "high" : issues.length === 2 ? "medium" : "low",
    metadata: { skill, levelFramework, level, purpose }
  };
}

module.exports = { callGroq, liteValidity };
