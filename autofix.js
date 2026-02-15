// autofix.js (ROOT)
// Exports a FUNCTION
// Returns improved instructions/rubric suggestions without rewriting the whole assessment.

function safeStr(x) {
  return (x ?? "").toString().trim();
}

// Lite autofix: simple templates
function liteAutofix(input) {
  const skill = safeStr(input.skill) || "the target skill";
  const levelFramework = safeStr(input.levelFramework) || "CLB";
  const level = safeStr(input.level) || "5";
  const purpose = safeStr(input.purpose) || "Summative";

  const instructionsText = safeStr(input.instructionsText);
  const rubricText = safeStr(input.rubricText);

  const fixedInstructionsText =
    instructionsText ||
    `Task (${purpose}): Students will complete a ${skill} assessment.\n` +
      `1) Prepare your response based on the topic.\n` +
      `2) Submit your work (spoken or written) as instructed.\n` +
      `3) Aim for clear organization, accurate vocabulary, and appropriate grammar for ${levelFramework} ${level}.\n` +
      `4) Check your work before submitting.`;

  const fixedRubricText =
    rubricText ||
    `Rubric (${levelFramework} ${level} - ${skill}):\n` +
      `- Clarity & Organization\n` +
      `- Vocabulary & Word Choice\n` +
      `- Grammar & Sentence Structure\n` +
      `- Pronunciation/Delivery (if speaking)\n` +
      `- Task Completion\n` +
      `Performance Levels: Needs Improvement / Developing / Competent / Strong`;

  return {
    mode: "lite",
    fixedInstructionsText,
    fixedRubricText,
    notes: [
      "Lite autofix used templates (no AI).",
      "You can paste these into your assessment to improve clarity and measurability.",
    ],
  };
}

// Groq autofix
async function groqJson(prompt, groqApiKey) {
  if (!groqApiKey) return null;

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
            "You improve ESL assessment instructions/rubrics. Return STRICT JSON only with keys: fixedInstructionsText, fixedRubricText, notes.",
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

  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Groq did not return JSON.");
  }

  return JSON.parse(content.slice(start, end + 1));
}

async function runAutofix(input, options = {}) {
  const mode = (options.mode || "groq").toString().toLowerCase();
  const groqApiKey = options.groqApiKey || "";

  if (mode === "lite") return liteAutofix(input);

  const payload = {
    skill: safeStr(input.skill),
    levelFramework: safeStr(input.levelFramework),
    level: safeStr(input.level),
    purpose: safeStr(input.purpose),
    instructionsText: safeStr(input.instructionsText),
    rubricText: safeStr(input.rubricText),
  };

  const prompt =
    `Improve these ESL/EAP assessment instructions + rubric.\n` +
    `Rules:\n` +
    `- Keep the original intent.\n` +
    `- Make instructions clearer and measurable.\n` +
    `- Make rubric criteria explicit.\n` +
    `- Output STRICT JSON only.\n\n` +
    `INPUT:\n${JSON.stringify(payload, null, 2)}`;

  try {
    const out = await groqJson(prompt, groqApiKey);
    if (!out) return liteAutofix(input);

    return {
      mode: "groq",
      fixedInstructionsText: safeStr(out.fixedInstructionsText) || payload.instructionsText,
      fixedRubricText: safeStr(out.fixedRubricText) || payload.rubricText,
      notes: Array.isArray(out.notes) ? out.notes : ["Groq autofix generated improvements."],
    };
  } catch (e) {
    const lite = liteAutofix(input);
    lite.notes.unshift(`Groq failed; used lite autofix. (${e.message})`);
    return lite;
  }
}

module.exports = runAutofix;
