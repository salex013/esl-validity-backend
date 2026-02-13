// autofix.js
// Builds a combined "Assessment Pack" DOCX (Revised Assessment + Revised Rubric + Admin notes)
// Deterministic templates (teacher review required).

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
  WidthType
} = require("docx");
const { v4: uuidv4 } = require("uuid");

function safe(s) {
  return (s || "").toString().trim();
}

function bullets(lines) {
  return lines.filter(Boolean).map((t) => new Paragraph({ text: t, bullet: { level: 0 } }));
}

function parseCriteria(score, rubricText) {
  const extracted = score?.extracted?.criteria || [];
  if (extracted.length) return extracted;

  const t = (rubricText || "").replace(/\s+/g, " ").trim();
  const m = t.match(/criteria\s*:\s*([^\.]+)\./i);
  if (m && m[1]) {
    return m[1].split(",").map((x) => x.trim()).filter(Boolean).slice(0, 8);
  }
  return ["Task Achievement", "Organization", "Language Control", "Vocabulary", "Pronunciation/Fluency"];
}

function purposeExplainer(purpose) {
  const p = (purpose || "").toLowerCase();
  if (p === "formative") return "Formative: used during learning to guide next steps (feedback + practice).";
  if (p === "summative") return "Summative: used to judge achievement (grade/pass-fail). Requires clear standards + reliability.";
  if (p === "diagnostic") return "Diagnostic: used to identify strengths/gaps early so instruction can target needs.";
  if (p === "placement") return "Placement: used to place learners into levels/programs. Fairness + construct coverage are crucial.";
  if (p.includes("benchmark")) return "Benchmark/Progress: used periodically to track growth; consistency across tasks matters.";
  return "Purpose: specify how results will be used and what decisions will be made from the score.";
}

function buildRevisedAssessment({ extractedText, meta, score }) {
  const skill = safe(meta?.skill || "Skill");
  const level = safe(meta?.level || "Level");
  const purpose = safe(meta?.purpose || "Purpose");
  const fixFirst = (score?.fixFirst || []).map((x) => `${x.name}: ${x.note}`);

  const sections = [];

  sections.push(new Paragraph({ text: "Revised Assessment (Suggested)", heading: HeadingLevel.HEADING_1 }));

  sections.push(
    new Paragraph({
      children: [new TextRun({ text: `Skill: ${skill}  |  Level: ${level}  |  Purpose: ${purpose}`, bold: true })]
    })
  );

  sections.push(new Paragraph({ text: purposeExplainer(purpose) }));

  sections.push(new Paragraph({ text: "Target Outcome / Construct", heading: HeadingLevel.HEADING_2 }));
  sections.push(
    new Paragraph({
      text: score?.signals?.hasOutcomes
        ? "This task appears to reference outcomes. Ensure the exact CLB descriptors are stated explicitly below:"
        : "Add explicit CLB outcomes/descriptors here (teacher edits):"
    })
  );

  sections.push(
    ...bullets([
      "CLB outcome(s): ________________________________",
      "Key criteria (what success looks like): ________________________________"
    ])
  );

  sections.push(new Paragraph({ text: "Student Instructions", heading: HeadingLevel.HEADING_2 }));
  sections.push(new Paragraph({ text: "Original (for reference):", bold: true }));
  const original = safe(extractedText);
  sections.push(new Paragraph({ text: original.slice(0, 1200) + (original.length > 1200 ? "…" : "") }));

  sections.push(new Paragraph({ text: "Suggested clearer steps:", bold: true }));
  sections.push(
    ...bullets([
      "1) Read the prompt carefully. Ask the teacher if any words are unclear.",
      "2) Plan your response (notes / outline).",
      "3) Complete the task. Focus on the target skill (avoid extra reading/writing that isn’t required).",
      "4) Review your work (self-check) before submitting or finishing."
    ])
  );

  sections.push(new Paragraph({ text: "Administration Conditions (Reliability)", heading: HeadingLevel.HEADING_2 }));
  sections.push(
    ...bullets([
      "Time limit: ______ minutes (or “untimed” if appropriate).",
      "Materials/resources allowed: ________________________________",
      "Teacher prompts allowed (if speaking): ________________________________",
      "Number of attempts: ______ (e.g., 1 attempt for summative; more for formative)."
    ])
  );

  sections.push(new Paragraph({ text: "Fairness & Accessibility", heading: HeadingLevel.HEADING_2 }));
  sections.push(new Paragraph({ text: "Include an accommodations/supports statement. Example:", italics: true }));
  sections.push(
    new Paragraph({
      text:
        "Accommodations may include extra time, alternate format, assistive technology, and/or quiet space as needed. Supports allowed: ____________________."
    })
  );

  sections.push(new Paragraph({ text: "Teacher Notes (Fix-First from Analyzer)", heading: HeadingLevel.HEADING_2 }));
  sections.push(...bullets(fixFirst.length ? fixFirst : ["No top-priority fixes were flagged."]));

  sections.push(new Paragraph({ text: "Washback (Learning-Oriented Guidance)", heading: HeadingLevel.HEADING_2 }));
  sections.push(
    ...bullets([
      "Give students a checklist aligned to the rubric (before the task).",
      "Share 1–2 exemplars or model responses (as appropriate).",
      "Use feedback phrasing that points to the next step (not just a score)."
    ])
  );

  return sections;
}

function buildRubricTable(criteria, meta) {
  const level = safe(meta?.level || "Level");

  const header = new TableRow({
    children: [
      new TableCell({
        width: { size: 24, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ text: "Criteria", bold: true })]
      }),
      new TableCell({
        width: { size: 19, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ text: "4 (Strong)", bold: true })]
      }),
      new TableCell({
        width: { size: 19, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ text: "3 (Good)", bold: true })]
      }),
      new TableCell({
        width: { size: 19, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ text: "2 (Developing)", bold: true })]
      }),
      new TableCell({
        width: { size: 19, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ text: "1 (Needs work)", bold: true })]
      })
    ]
  });

  const rows = [header];

  for (const c of criteria) {
    rows.push(
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ text: c })] }),
          new TableCell({
            children: [new Paragraph({ text: `Meets/Exceeds ${level} expectations for ${c.toLowerCase()}.` })]
          }),
          new TableCell({
            children: [new Paragraph({ text: `Mostly meets expectations for ${c.toLowerCase()}, minor lapses.` })]
          }),
          new TableCell({
            children: [new Paragraph({ text: `Sometimes meets expectations; noticeable gaps in ${c.toLowerCase()}.` })]
          }),
          new TableCell({
            children: [new Paragraph({ text: `Rarely meets expectations; frequent issues in ${c.toLowerCase()}.` })]
          })
        ]
      })
    );
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows
  });
}

function buildRevisedRubric({ rubricText, meta, score }) {
  const criteria = parseCriteria(score, rubricText);
  const parts = [];

  parts.push(new Paragraph({ text: "Revised Rubric (Suggested)", heading: HeadingLevel.HEADING_1 }));
  parts.push(
    new Paragraph({
      text: "This rubric uses observable, level-differentiated descriptors. Teacher review required.",
      italics: true
    })
  );

  if (rubricText && rubricText.trim().length > 0) {
    parts.push(new Paragraph({ text: "Original rubric (for reference):", bold: true }));
    const r = rubricText.trim();
    parts.push(new Paragraph({ text: r.slice(0, 1200) + (r.length > 1200 ? "…" : "") }));
  }

  parts.push(new Paragraph({ text: "Suggested rubric table:", heading: HeadingLevel.HEADING_2 }));
  parts.push(buildRubricTable(criteria, meta));

  parts.push(new Paragraph({ text: "Scoring rules (Reliability):", heading: HeadingLevel.HEADING_2 }));
  parts.push(
    ...bullets([
      "Score each criterion based on observable evidence.",
      "Use the same administration conditions for all students (time, prompts, supports).",
      "If multiple raters: do a quick norming with 1 sample response before scoring."
    ])
  );

  return parts;
}

async function buildAssessmentPackDocxBuffer({ extractedText, rubricText, meta, score }) {
  const created = new Date().toISOString().slice(0, 10);
  const docId = uuidv4();

  const doc = new Document({
    creator: "ESL Validity Analyzer",
    description: "Suggested revised assessment pack (teacher review required).",
    title: "Assessment Pack (Revised)",
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: "Assessment Pack (Suggested Revision)",
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: `Generated: ${created}  |  ID: ${docId}`, color: "666666" })]
          }),
          new Paragraph({ text: "" }),

          ...buildRevisedAssessment({ extractedText, meta, score }),

          new Paragraph({ text: "" }),
          new Paragraph({ text: "— — —", alignment: AlignmentType.CENTER }),
          new Paragraph({ text: "" }),

          ...buildRevisedRubric({ rubricText, meta, score }),

          new Paragraph({ text: "" }),
          new Paragraph({ text: "Disclaimer", heading: HeadingLevel.HEADING_2 }),
          new Paragraph({
            text:
              "This document is auto-generated to support teacher decision-making. Teachers should review, edit, and ensure alignment with local policy, curriculum, and CLB descriptors before use."
          })
        ]
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer;
}

module.exports = { buildAssessmentPackDocxBuffer };
