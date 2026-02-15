const {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun
} = require("docx");

function para(text) {
  return new Paragraph({ children: [new TextRun(text || "")] });
}

function list(title, items) {
  const out = [new Paragraph({ text: title, heading: HeadingLevel.HEADING_3 })];
  if (!items || !items.length) {
    out.push(para("- (none)"));
    return out;
  }
  items.forEach((i) => out.push(para(`- ${i}`)));
  return out;
}

async function makeDocxBuffer(item) {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: "ESL Assessment Validity Report",
            heading: HeadingLevel.TITLE
          }),
          para(`Report ID: ${item.id}`),
          para(`Created: ${item.createdAt}`),
          para(`Mode: ${item.mode}`),

          new Paragraph({ text: "Task Info", heading: HeadingLevel.HEADING_2 }),
          para(`Skill: ${item.input?.skill || ""}`),
          para(`Framework: ${item.input?.levelFramework || ""}`),
          para(`Level: ${item.input?.level || ""}`),
          para(`Purpose: ${item.input?.purpose || ""}`),

          new Paragraph({ text: "Summary", heading: HeadingLevel.HEADING_2 }),
          para(item.output?.summary || ""),

          ...list("Strengths", item.output?.strengths || []),
          ...list("Issues", item.output?.issues || []),
          ...list("Suggestions", item.output?.suggestions || [])
        ]
      }
    ]
  });

  return await Packer.toBuffer(doc);
}

module.exports = { makeDocxBuffer };
