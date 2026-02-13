const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel
} = require("docx");

function H(text, level = HeadingLevel.HEADING_2) {
  return new Paragraph({ text, heading: level });
}

function P(text) {
  return new Paragraph({ children: [new TextRun(text || "")] });
}

function spacer() {
  return new Paragraph({ text: "" });
}

function block(title, text) {
  const lines = (text || "").split("\n");
  return [
    H(title, HeadingLevel.HEADING_3),
    ...lines.map((ln) => P(ln)),
    spacer()
  ];
}

async function buildAssessmentPackDocxBuffer({ meta, original, rule, ai }) {
  const skill = (meta?.skill || "").toString();
  const level = (meta?.level || "").toString();
  const purpose = (meta?.purpose || "").toString();

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: "Assessment Pack",
            heading: HeadingLevel.TITLE
          }),
          P(`Skill: ${skill || "[not specified]"}    Level: ${level || "[not specified]"}    Purpose: ${purpose || "[not specified]"}`),
          spacer(),

          H("1) Original Version", HeadingLevel.HEADING_2),
          block("Original Assessment Instructions", original?.extractedText || ""),
          block("Original Rubric", original?.rubricText || ""),

          H("2) Revised Version (Rule-Based)", HeadingLevel.HEADING_2),
          block("Revised Assessment Instructions (Rule-Based)", rule?.revisedAssessmentText || ""),
          block("Revised Rubric (Rule-Based)", rule?.revisedRubricText || ""),
          block("Rule-Based Change Log", rule?.changeLog || ""),

          H("3) Revised Version (AI Rewrite Engine)", HeadingLevel.HEADING_2),
          block("Revised Assessment Instructions (AI)", ai?.revisedAssessmentText || ""),
          block("Revised Rubric (AI)", ai?.revisedRubricText || ""),
          block("AI Change Log", ai?.changeLog || ""),

          H("Notes", HeadingLevel.HEADING_2),
          P("• The AI rewrite preserves task intent but improves clarity, alignment, accessibility, and rubric observability."),
          P("• If outcomes/descriptors were missing, placeholders are used so instructors can insert official CLB/course outcomes."),
          P("• Always review institutional policy before use (accommodations, academic integrity, evaluation rules).")
        ]
      }
    ]
  });

  return await Packer.toBuffer(doc);
}

module.exports = { buildAssessmentPackDocxBuffer };
