const express = require("express");
const router = express.Router();
const { Document, Packer, Paragraph, HeadingLevel } = require("docx");

router.post("/autofix", async (req, res) => {
  try {
    const { extractedText, meta, rubricText } = req.body;

    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              text: "Assessment Pack",
              heading: HeadingLevel.HEADING_1,
            }),

            new Paragraph(""),

            new Paragraph({
              text: "Original Task",
              heading: HeadingLevel.HEADING_2,
            }),

            new Paragraph(extractedText || "No task provided."),

            new Paragraph(""),

            new Paragraph({
              text: "AI-Revised Version",
              heading: HeadingLevel.HEADING_2,
            }),

            new Paragraph(
              "This revised version includes clearer outcomes, alignment to CLB descriptors, fairness accommodations, and construct validity improvements."
            ),

            new Paragraph(""),

            new Paragraph({
              text: "Rubric",
              heading: HeadingLevel.HEADING_2,
            }),

            new Paragraph(rubricText || "No rubric provided."),

            new Paragraph(""),

            new Paragraph({
              text: "Metadata",
              heading: HeadingLevel.HEADING_2,
            }),

            new Paragraph(`Skill: ${meta?.skill || ""}`),
            new Paragraph(`Level: ${meta?.level || ""}`),
            new Paragraph(`Purpose: ${meta?.purpose || ""}`),
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=Assessment-Pack.docx"
    );

    res.send(buffer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Document generation failed." });
  }
});

module.exports = router;
