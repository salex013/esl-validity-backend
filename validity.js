// validity.js (ROOT)
// Exports a FUNCTION (so server can call it)
// Supports mode: "lite" | "groq"

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function safeStr(x) {
  return (x ?? "").toString().trim();
}

function liteValidate(input) {
  const skill = safeStr(input.skill);
  const levelFramework = safeStr(input.levelFramework);
  const level = safeStr(input.level);
  const purpose = safeStr(input.purpose);
  const instructionsText = safeStr(input.instructionsText);
  const rubricText = safeStr(input.rubricText);

  const issues = [];
  const suggestions = [];
  const strengths = [];

  if (!skill) issues.push("Skill is missing.");
  if (!levelFramework) issues.push("Level framework is missing (e.g., CLB).");
  if (!level) issues.push("Level is missing (e.g., 5).");
  if (!purpose) issues.push("Purpose is missing (formative/summative).");
  if (!instructionsText) issues.push("Instructions are missing.");
  if (!rubricText) issues.push("Rubric is missing.");

  if (instructionsText && instructionsText.length < 60) {
    issues.push("Instructions are very short; students may not know what to do.");
    suggestions.push("Add step-by-step instructions and what students must submit.");
  } else if (instructionsText) {
    strengths.push("Instructions are provided.");
  }

  if (rubricText && rubricText.length < 40) {
    issues.push("Rubric is very short; assessment criteria may be unclear.");
    suggestions.push("Add clear criteria (e.g., organization, vocabulary, grammar, pronunciation) and performance levels.");
  } else if (rubricText) {
    strengths.push("Rubric is provided.");
  }

  // Simple alignment checks (heuristic)
  if (skill && rubricText && !rubricText.toLowerCase().includes(skill.toLowerCase())) {
    suggestions.push("Consider making the rubric explicitly mention the target skill to improve alignment.");
  }

  // Risk level
  let riskLevel = "low";
  if (issues.length >= 4) riskLevel = "medium";
  if (issues.length >= 7) riskLevel = "high";

  const clarity = clamp(3 - Math.floor(issues.length / 3), 0, 3);
  const alignment = clamp(3 - Math.floor(issues.length / 4), 0, 3);
  const measurability = rubricText ? clamp(2 - (rubricText.length < 80 ? 1 : 0), 0, 2) : 0;
  const fairness_accessibility = clamp(2 - (instructionsText.length < 80 ? 1 : 0), 0, 2);

  const overall = clamp(
    Math.round(((clarity / 3) + (alignment / 3) + (measurability / 2) + (fairness_accessibility / 2)) * 1.5),
    0,
    6
  );

  return {
    mode: "lite",
    summary: issues.length ? "Some issues detected by lite checks." : "No major issues detected by lite checks.",
    strengths,
    issues,
    suggestions,
    scores: {
      clarity,
      alignment,
      measurability,
      fairness_accessibility,
      overall,
    },
    riskLevel,
    metadata: {
      skill,
      levelFramework,
      level,
      purpose,
    },
  };
}

// ---- Groq (OpenAI-compatible) ----
async function groqJson(prompt, groqApiKey) {
  if (!groqApiKey) {
    // fallback to lite if key missing
    return null;
  }

  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${groqApiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.1-70b-versatile",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are an ESL/EAP assessment validity evaluator. Return STRICT JSON only. No markdown. No extra text.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Groq error ${resp.status}: ${txt}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content ?? "";

  // Extract the first JSON object from the response
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Groq did not return JSON.");
  }

  const jsonText = content.slice(start, end + 1);
  return JSON.parse(jsonText);
}

async function runValidity(input, options = {}) {
  const mode = (options.mode || "groq").toString().toLowerCase();
  const groqApiKey = options.groqApiKey || "";

  if (mode === "lite") {
    return liteValidate(input);
  }

  // Groq mode with fallback to lite if anything goes wrong
  const payload = {
    skill: safeStr(input.skill),
    levelFramework: safeStr(input.levelFramework),
    level: safeStr(input.level),
    purpose: safeStr(input.purpose),
    instructionsText: safeStr(input.instructionsText),
    rubricText: safeStr(input.rubricText),
  };

  const prompt =
    `Evaluate this ESL/EAP assessment for validity/alignment.\n` +
    `Return JSON with keys: mode, model, summary, strengths (array), issues (array), suggestions (array), scores (object), riskLevel.\n` +
    `Scores: clarity(0-3), alignment(0-3), measurability(0-2), fairness_accessibility(0-2), overall(0-6).\n\n` +
    `INPUT:\n${JSON.stringify(payload, null, 2)}`;

  try {
    const groqOut = await groqJson(prompt, groqApiKey);
    // Normalize + ensure required fields
    return {
      mode: "groq",
      model: "ESL/EAP Assessment Designer",
      summary: groqOut.summary ?? "Groq report generated.",
      strengths: Array.isArray(groqOut.strengths) ? groqOut.strengths : [],
      issues: Array.isArray(groqOut.issues) ? groqOut.issues : [],
      suggestions: Array.isArray(groqOut.suggestions) ? groqOut.suggestions : [],
      scores: groqOut.scores ?? {},
      riskLevel: groqOut.riskLevel ?? "medium",
    };
  } catch (e) {
    const lite = liteValidate(input);
    lite.summary = `Groq failed; returned lite checks. (${e.message})`;
    return lite;
  }
}

module.exports = runValidity;
