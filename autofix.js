/**
 * autofix.js
 * ESL Validity Tool — AutoFix + Assessment Pack generator
 *
 * Exports:
 *  - createRuleBasedRewrite({ extractedText, rubricText, meta, analysis })
 *  - createAIRewrite({ extractedText, rubricText, meta, analysis })
 *  - buildAssessmentPackDocxBuffer({ extractedText, rubricText, meta, analysis })
 *
 * Notes:
 *  - AI rewrite uses direct HTTPS call to OpenAI Responses API (no SDK dependency).
 *  - If OPENAI_API_KEY missing or call fails, it falls back to rule-based rewrite.
 *  - “Pack” includes BOTH Original + Revised versions (Option C).
 */

const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
} = require("docx");

// -----------------------------
// Helpers
// -----------------------------
function safeStr(v, fallback = "") {
  return typeof v === "string" ? v : fallback;
}

function nlToParas(text, { bullet = false } = {}) {
  const lines = safeStr(text, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [new Paragraph("")];

  return lines.map((line) => {
    if (bullet) {
      return new Paragraph({ text: line, bullet: { level: 0 } });
    }
    return new Paragraph(line);
  });
}

function heading(text, level = HeadingLevel.HEADING_2) {
  return new Paragraph({
    text,
    heading: level,
    spacing: { before: 240, after: 120 },
  });
}

function subtle(text) {
  return new Paragraph({
    children: [new TextRun({ text, color: "666666", size: 20 })],
    spacing: { after: 120 },
  });
}

function keyValueTable(rows) {
  // rows: [{k, v}]
  const tableRows = rows.map(({ k, v }) => {
    return new TableRow({
      children: [
        new TableCell({
          width: { size: 30, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              children: [new TextRun({ text: safeStr(k), bold: true })],
            }),
          ],
        }),
        new TableCell({
          width: { size: 70, type: WidthType.PERCENTAGE },
          children: nlToParas(safeStr(v)),
        }),
      ],
    });
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: tableRows,
  });
}

function normalizeMeta(meta = {}) {
  return {
    skill: safeStr(meta.skill, "Unknown"),
    level: safeStr(meta.level, "Unknown"),
    purpose: safeStr(meta.purpose, "Unknown"),
  };
}

// -----------------------------
// Rule-based rewrite (fallback)
// -----------------------------
function createRuleBasedRewrite({ extractedText = "", rubricText = "", meta = {}, analysis = {} }) {
  const m = normalizeMeta(meta);

  const addIfMissing = (text, snippet, matcher) => {
    const hay = safeStr(text).toLowerCase();
    const needle = (matcher || snippet).toLowerCase();
    if (hay.includes(needle)) return text;
    return `${safeStr(text).trim()}\n\n${snippet}`.trim();
  };

  let revisedAssessmentText = safeStr(extractedText).trim();
  let revisedRubricText = safeStr(rubricText).trim();

  // Alignment / outcomes (common “content validity” fix)
  revisedAssessmentText = addIfMissing(
    revisedAssessmentText,
    `Learning Outcomes / CLB Alignment:\n(Teacher) Add the specific ${m.level} ${m.skill} outcomes being assessed here (in the task + in the rubric headings).`,
    "clb alignment"
  );

  // Timing + conditions (reliability/practicality)
  revisedAssessmentText = addIfMissing(
    revisedAssessmentText,
    `Administration Details:\nTime: ____ minutes | Mode: in-class / online | Purpose: ${m.purpose}\nMaterials: ______________________________\nTeacher Prompts Allowed: ______________________________`,
    "administration details"
  );

  // Fairness / accessibility
  revisedAssessmentText = addIfMissing(
    revisedAssessmentText,
    `Accommodations / Supports Allowed:\n(Teacher) List allowed supports (e.g., extra time, assistive tech, alternate format, quiet space) and any supports NOT allowed.`,
    "accommodations"
  );

  // Washback: add a simple practice note
  revisedAssessmentText = addIfMissing(
    revisedAssessmentText,
    `Preparation / Practice (Recommended):\nStudents may rehearse with a partner, use planning notes, and practice self-correction strategies (not memorization).`,
    "preparation / practice"
  );

  // Rubric clarity reminder (reliability)
  revisedRubricText = addIfMissing(
    revisedRubricText,
    `Descriptor Clarity Check:\nEnsure each criterion has clear level descriptors (what “Meets ${m.level}” looks like) + examples of performance.`,
    "descriptor clarity"
  );

  // If rubric looks too vague, suggest adding observable indicators
  revisedRubricText = addIfMissing(
    revisedRubricText,
    `Observable Indicators (add to each band):\n- Fluency: pausing/repair, pace, coherence\n- Vocabulary: range, appropriacy, paraphrasing\n- Pronunciation: intelligibility, stress/intonation, key sounds`,
    "observable indicators"
  );

  const changes = [
    "Added CLB/outcomes alignment placeholder",
    "Added administration details (time/mode/materials)",
    "Added accommodations/supports section",
    "Added preparation/practice guidance",
    "Added rubric clarity + observable indicators",
  ];

  return {
    revisedAssessmentText,
    revisedRubricText,
    changes,
    rewriteMode: "rule_based",
  };
}

// -----------------------------
// AI rewrite (OpenAI via HTTP)
// -----------------------------
async function createAIRewrite({ extractedText = "", rubricText = "", meta = {}, analysis = {} }) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini"; // change if you prefer

  if (!apiKey) {
    // Fallback
    return createRuleBasedRewrite({ extractedText, rubricText, meta, analysis });
  }

  const m = normalizeMeta(meta);

  // We instruct the model to return STRICT JSON we can parse.
  const system = `
You are an expert ESL/EAP assessment designer.
Rewrite an assessment task + rubric to improve validity, reliability, fairness/accessibility, practicality, and washback.
Return ONLY strict JSON with these keys:
{
  "revisedAssessmentText": "...",
  "revisedRubricText": "...",
  "changes": ["...", "..."]
}
No markdown. No extra keys.
`.trim();

  const user = `
INPUTS
Skill: ${m.skill}
Level: ${m.level}
Purpose: ${m.purpose}

ASSESSMENT TEXT
${safeStr(extractedText).trim()}

RUBRIC TEXT
${safeStr(rubricText).trim()}

(If missing, add: explicit CLB/outcome alignment lines, administration details, accommodations/supports section, and clearer rubric descriptors.)
`.trim();

  const payload = {
    model,
    input: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    // keep output more deterministic
    temperature: 0.3,
  };

  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    // fallback on any API error
    return createRuleBasedRewrite({ extractedText, rubricText, meta, analysis });
  }

  const data = await resp.json();

  // Responses API returns content in output_text or nested items.
  // We'll try the common forms safely.
  const text =
    data.output_text ||
    (Array.isArray(data.output)
      ? data.output
          .flatMap((o) => o.content || [])
          .map((c) => c.text)
          .filter(Boolean)
          .join("\n")
      : "") ||
    "";

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    // fallback if model didn’t comply
    return createRuleBasedRewrite({ extractedText, rubricText, meta, analysis });
  }

  const revisedAssessmentText = safeStr(parsed.revisedAssessmentText).trim();
  const revisedRubricText = safeStr(parsed.revisedRubricText).trim();
  const changes = Array.isArray(parsed.changes) ? parsed.changes.map(String) : [];

  if (!revisedAssessmentText || !revisedRubricText) {
    return createRuleBasedRewrite({ extractedText, rubricText, meta, analysis });
  }

  return {
    revisedAssessmentText,
    revisedRubricText,
    changes,
    rewriteMode: "ai",
    modelUsed: model,
  };
}

// -----------------------------
// Build DOCX buffer (Assessment Pack)
// Option C: include BOTH versions
// -----------------------------
async function buildAssessmentPackDocxBuffer({ extractedText = "", rubricText = "", meta = {}, analysis = {} }) {
  const m = normalizeMeta(meta);

  // 1) Always compute a rewrite (AI if possible; fallback to rule-based)
  const rewrite = await createAIRewrite({ extractedText, rubricText, meta, analysis });

  // 2) Prepare doc sections
  const title = new Paragraph({
    text: "Assessment Pack",
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
  });

  const subtitle = new Paragraph({
    children: [
      new TextRun({ text: `Skill: ${m.skill}  |  Level: ${m.level}  |  Purpose: ${m.purpose}`, italics: true }),
    ],
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
  });

  const metaTable = keyValueTable([
    { k: "Skill", v: m.skill },
    { k: "CLB Level", v: m.level },
    { k: "Purpose", v: m.purpose },
    { k: "Rewrite Mode", v: rewrite.rewriteMode === "ai" ? `AI (${rewrite.modelUsed || "model"})` : "Rule-based fallback" },
  ]);

  const changesList =
    rewrite.changes && rewrite.changes.length
      ? [
          heading("What Changed", HeadingLevel.HEADING_2),
          ...nlToParas(rewrite.changes.join("\n"), { bullet: true }),
        ]
      : [heading("What Changed", HeadingLevel.HEADING_2), subtle("No change notes were returned.")];

  // 3) Pack content (Option C: BOTH)
  const originalAssessment = [
    heading("Original Assessment Instructions", HeadingLevel.HEADING_2),
    ...nlToParas(safeStr(extractedText).trim() || "(No assessment text provided.)"),
  ];

  const originalRubric = [
    heading("Original Rubric", HeadingLevel.HEADING_2),
    ...nlToParas(safeStr(rubricText).trim() || "(No rubric text provided.)"),
  ];

  const revisedAssessment = [
    heading("Revised Assessment Instructions", HeadingLevel.HEADING_2),
    ...nlToParas(rewrite.revisedAssessmentText || "(No revised assessment text generated.)"),
  ];

  const revisedRubric = [
    heading("Revised Rubric", HeadingLevel.HEADING_2),
    ...nlToParas(rewrite.revisedRubricText || "(No revised rubric text generated.)"),
  ];

  const footerNote = subtle(
    "Note: This document is a draft support tool. Teachers should review and adjust to their program outcomes, policies, and accommodations requirements."
  );

  // 4) Build document
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          title,
          subtitle,
          metaTable,
          ...changesList,
          heading("Original Version", HeadingLevel.HEADING_1),
          ...originalAssessment,
          ...originalRubric,
          heading("Revised Version", HeadingLevel.HEADING_1),
          ...revisedAssessment,
          ...revisedRubric,
          footerNote,
        ],
      },
    ],
  });

  // 5) Return buffer
  const buffer = await Packer.toBuffer(doc);
  return buffer;
}

// -----------------------------
// Exports (IMPORTANT)
// -----------------------------
module.exports = {
  createRuleBasedRewrite,
  createAIRewrite,
  buildAssessmentPackDocxBuffer,
};
