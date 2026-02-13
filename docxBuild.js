import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel
} from "docx";

export async function buildDocx(meta, fix, dashboard) {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: "Improved Assessment",
            heading: HeadingLevel.TITLE
          }),
          new Paragraph(`Trust Score: ${dashboard.trustScore}/100`),
          new Paragraph(""),
          new Paragraph({
            text: "Standardization",
            heading: HeadingLevel.HEADING_2
          }),
          new Paragraph(fix.standardization),
          new Paragraph(""),
          new Paragraph({
            text: "Revised Assessment",
            heading: HeadingLevel.HEADING_2
          }),
          new Paragraph(fix.revisedText)
        ]
      }
    ]
  });

  return await Packer.toBuffer(doc);
}
