function safe(s) {
  return (s || "").toString().trim();
}

function createRuleBasedRewrite({ extractedText, rubricText, meta }) {
  const task = safe(extractedText);
  const rubric = safe(rubricText);
  const skill = safe(meta?.skill);
  const level = safe(meta?.level);
  const purpose = safe(meta?.purpose);

  // Minimal “safe” rewrite: add missing admin details and validity boosters without changing teacher intent too much.
  const supportsBlock = [
    "Accommodations/Supports (teacher may adapt as needed):",
    "• Extra time if required",
    "• Clarification of instructions (no coaching of answers)",
    "• Alternate format if needed (oral instead of written; larger font; screen reader-friendly copy)",
    "• Quiet space / reduced distractions where possible"
  ].join("\n");

  const alignmentBlock = [
    "Alignment:",
    `• Skill: ${skill || "[add skill]"}  • Level: ${level || "[add level]"}  • Purpose: ${purpose || "[add purpose]"}`,
    "• Target outcomes/descriptors: [add 2–4 CLB descriptors or course outcomes here]"
  ].join("\n");

  const adminBlock = [
    "Administration (recommended):",
    "• Time: [add duration] minutes",
    "• Materials: [add materials]",
    "• Steps:",
    "  1) Review task + success criteria with learners",
    "  2) Provide brief planning time",
    "  3) Collect performance (live or recorded)",
    "  4) Score with rubric + short feedback note"
  ].join("\n");

  const improvedTask =
    [
      "ASSESSMENT INSTRUCTIONS (Revised — Rule-Based)",
      alignmentBlock,
      "",
      "Original task (for reference):",
      task || "[no task text provided]",
      "",
      "Revised version (teacher-facing):",
      "• Student-friendly goal statement: Students will demonstrate the target skill in an authentic, level-appropriate task.",
      "• Clear deliverable: [describe what students submit/do].",
      "• Success criteria: Use the rubric categories below; share with learners before the assessment.",
      "",
      adminBlock,
      "",
      supportsBlock
    ].join("\n");

  const improvedRubric =
    [
      "RUBRIC (Revised — Rule-Based)",
      `Rubric context: ${skill || "[skill]"} — ${level || "[level]"}`,
      "",
      "Original rubric (for reference):",
      rubric || "[no rubric text provided]",
      "",
      "Revised rubric guidance:",
      "• Ensure each level uses observable language (e.g., ‘uses 3+ relevant details’ vs. ‘good detail’).",
      "• Add anchors/examples for Levels 4 and 2.",
      "• Keep criteria aligned to the target skill; avoid penalizing unrelated skills."
    ].join("\n");

  const changeLog = [
    "Rule-Based Change Log (what this revision adds):",
    "• Added an Alignment block (skill/level/purpose + outcomes placeholder).",
    "• Added Administration details (time/materials/steps) to improve practicality and reliability.",
    "• Added Accommodations/Supports block to improve fairness & accessibility.",
    "• Added guidance to make rubric descriptors observable (reliability)."
  ].join("\n");

  return {
    mode: "rule_based",
    revisedAssessmentText: improvedTask,
    revisedRubricText: improvedRubric,
    changeLog
  };
}

// -------- AI rewrite (OpenAI Responses API) --------
// Uses POST https://api.openai.com/v1/responses :contentReference[oaicite:1]{index=1}
async function createAIRewrite({ extractedText, rubricText, meta, ruleFallback }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      mode: "ai_fallback_to_rule",
      revisedAssessmentText: ruleFallback.revisedAssessmentText,
      revisedRubricText: ruleFallback.revisedRubricText,
      changeLog:
        "AI rewrite not enabled (OPENAI_API_KEY missing). Returned the rule-based version instead."
    };
  }

  const model = process.env.OPENAI_MODEL || "gpt-5.2"; // default per docs example :contentReference[oaicite:2]{index=2}

  const task = safe(extractedText);
  const rubric = safe(rubricText);

  // Strong constraints: preserve teacher intent, improve validity/reliability/fairness, keep CLB level appropriate.
  const system = [
    "You are an expert ESL/EAP assessment designer.",
    "Rewrite assessment instructions and rubric to improve validity, reliability, fairness/accessibility, washback, and practicality.",
    "Do NOT invent course-specific outcomes: use placeholders when outcomes/descriptors are missing.",
    "Preserve the original task intent and topic.",
    "Use clear headings and bullet points.",
    "Keep language appropriate to the stated CLB level.",
    "Return STRICT JSON only with keys: revisedAssessmentText, revisedRubricText, changeLogBullets."
  ].join(" ");

  const user = {
    meta: {
      skill: safe(meta?.skill),
      level: safe(meta?.level),
      purpose: safe(meta?.purpose)
    },
    originalAssessmentText: task,
    originalRubricText: rubric,
    requiredInclusions: [
      "Alignment block: skill, level, purpose, and outcomes placeholder",
      "Administration block: time, materials, steps, conditions",
      "Accommodations/Supports block",
      "Rubric with observable descriptors and 4 levels (or keep teacher’s scale but make descriptors measurable)",
      "Short change log bullets mapping changes to validity/reliability/fairness/washback/practicality"
    ]
  };

  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(user) }
      ],
      // Encourage “tool-like” behavior
      temperature: 0.2
    })
  });

  if (!resp.ok) {
    const txt = await resp.text();
    return {
      mode: "ai_error_fallback_to_rule",
      revisedAssessmentText: ruleFallback.revisedAssessmentText,
      revisedRubricText: ruleFallback.revisedRubricText,
      changeLog:
        "AI rewrite failed (API error). Returned the rule-based version instead.\n\n" +
        txt.slice(0, 800)
    };
  }

  const data = await resp.json();

  // Responses API returns output content; safely extract text
  const raw =
    (data?.output_text && data.output_text) ||
    extractOutputText(data) ||
    "";

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // If model returned non-JSON, fall back.
    return {
      mode: "ai_bad_output_fallback_to_rule",
      revisedAssessmentText: ruleFallback.revisedAssessmentText,
      revisedRubricText: ruleFallback.revisedRubricText,
      changeLog:
        "AI rewrite returned unexpected format. Returned the rule-based version instead."
    };
  }

  const revisedAssessmentText = safe(parsed.revisedAssessmentText);
  const revisedRubricText = safe(parsed.revisedRubricText);
  const changeLogBullets = Array.isArray(parsed.changeLogBullets)
    ? parsed.changeLogBullets.map(safe).filter(Boolean)
    : [];

  return {
    mode: "ai",
    revisedAssessmentText: revisedAssessmentText || ruleFallback.revisedAssessmentText,
    revisedRubricText: revisedRubricText || ruleFallback.revisedRubricText,
    changeLog: ["AI Change Log:", ...changeLogBullets.map((b) => `• ${b}`)].join("\n")
  };
}

function extractOutputText(data) {
  // Defensive parsing for Responses API shapes
  try {
    const out = data?.output;
    if (!Array.isArray(out)) return "";
    const texts = [];
    for (const item of out) {
      const content = item?.content;
      if (!Array.isArray(content)) continue;
      for (const c of content) {
        if (c?.type === "output_text" && typeof c?.text === "string") texts.push(c.text);
      }
    }
    return texts.join("\n").trim();
  } catch {
    return "";
  }
}

module.exports = { createRuleBasedRewrite, createAIRewrite };
