const express = require("express");
const router = express.Router();
const { Document, Packer, Paragraph, HeadingLevel } = require("docx");

router.post("/", async (req, res) => {
  try {
    const { extractedText, meta, rubricText } = req.body;

    if (!extractedText || !meta || !rubricText) {
      return res.status(400).json({
        ok: false,
        error: "Missing required fields.",
      });
    }

    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              text: "Assessment Pack",
              heading: HeadingLevel.HEADING_1,
            }),
            new Paragraph(" "),
            new Paragraph(`Skill: ${meta.skill}`),
            new Paragraph(`Level: ${meta.level}`),
            new Paragraph(`Purpose: ${meta.purpose}`),
            new Paragraph(" "),
            new Paragraph("Task Description:"),
            new Paragraph(extractedText),
            new Paragraph(" "),
            new Paragraph("Assessment Criteria:"),
            new Paragraph(rubricText),
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);

    // VERY IMPORTANT
    res.writeHead(200, {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition":
        "attachment; filename=Assessment-Pack.docx",
      "Content-Length": buffer.length,
    });

    return res.end(buffer);

  } catch (err) {
    console.error("Autofix error:", err);
    return res.status(500).json({
      ok: false,
      error: "Autofix pack generation failed.",
    });
  }
});

module.exports = router;
