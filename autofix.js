import { getRubricTemplate } from "./rubricTemplates.js";

export function autoFix(text, meta, dashboard, rubricText = "") {
  const changeLog = {
    meta,
    timestamp: new Date().toISOString(),
    summary: [],
    changes: []
  };

  const standardization = buildStandardization(meta, dashboard, changeLog);
  const revisedText = improveInstructions(text, meta, changeLog);

  let revisedRubric;

  if (rubricText && rubricText.trim().length > 30) {
    revisedRubric = { kind: "pasted", text: cleanRubricText(rubricText, changeLog) };
    changeLog.summary.push("Rubric cleaned for observable descriptors (v1 rewrite).");
  } else {
    revisedRubric = { kind: "generated", template: getRubricTemplate(meta) };
    changeLog.summary.push("Rubric template generated (rubric paste not provided).");
    changeLog.changes.push({
      type: "rubric_generated",
      why: "Improves reliability with observable descriptors and consistent band progression."
    });
  }

  for (const a of dashboard.alerts || []) {
    changeLog.changes.push({
      type: "alert_flag",
      why: a,
      action: "Included in admin notes + rubric guidance."
    });
  }

  return { revisedText, standardization, revisedRubric, changeLog };
}

function buildStandardization(meta, dashboard, changeLog) {
  const lines = [
    "Standardization & Administration Notes (v1)",
    `Skill: ${meta.skill} | Level: ${meta.level} | Purpose: ${meta.purpose}`,
    "",
    "Timing: Specify time limits clearly (e.g., 10–15 minutes per student / 30–45 minutes total).",
    "Supports allowed: Clarify if notes, dictionaries, rehearsal, repeats, or transcripts are permitted.",
    "Prompt delivery: Use the same prompts/conditions for all students (or equivalent versions).",
    "Scoring guidance: Score performance evidence, not effort. Use descriptors consistently.",
    "Accommodations: Provide accommodations as required (extra time, alternate format, assistive tech).",
    "",
    "Washback tip: Encourage strategy practice (planning, monitoring, self-correction), not memorization-only."
  ];

  changeLog.changes.push({
    type: "standardization_added",
    why: "Standardization supports reliability, fairness, and practicality.",
    action: "Inserted an administration notes block."
  });

  if (dashboard.signals?.contamination) {
    lines.push("");
    lines.push("Construct note: Reduce unrelated reading/writing demands so the task measures the intended skill.");
  }

  return lines.join("\n");
}

function improveInstructions(text, meta, changeLog) {
  const cleaned = (text || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();

  const header = [
    "Assessment (Improved Draft v1)",
    `Skill: ${meta.skill} | Level: ${meta.level} | Purpose: ${meta.purpose}`,
    "",
    "Student Instructions (Plain Language)",
    "- Read the task carefully. Ask your teacher if a word is unclear.",
    "- Focus on communicating your meaning clearly.",
    "- Use strategies practiced in class (planning, checking, self-correcting).",
    ""
  ].join("\n");

  changeLog.changes.push({
    type: "instructions_clarified",
    why: "Clear instructions reduce construct-irrelevant difficulty and support accessibility.",
    action: "Added plain-language instruction header."
  });

  return `${header}\n${cleaned}`;
}

function cleanRubricText(rubricText, changeLog) {
  let out = rubricText;

  const reps = [
    { from: /\bgood\b/gi, to: "generally accurate and appropriate" },
    { from: /\bclear\b/gi, to: "easy to understand with minor lapses" },
    { from: /\bstrong\b/gi, to: "consistent and well-supported" },
    { from: /\beffective\b/gi, to: "successful for the intended purpose" },
    { from: /\bappropriate\b/gi, to: "suitable for the context and audience" }
  ];

  let hit = false;
  for (const r of reps) {
    if (r.from.test(out)) {
      hit = true;
      out = out.replace(r.from, r.to);
    }
  }

  if (hit) {
    changeLog.changes.push({
      type: "rubric_language_rewrite",
      why: "Replacing vague descriptors improves inter-rater reliability.",
      action: "Converted vague adjectives into observable language."
    });
