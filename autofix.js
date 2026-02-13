const express = require("express");
const router = express.Router();
const { Document, Packer, Paragraph, HeadingLevel } = require("docx");

function createRuleBasedRewrite(text, meta, rubricText) {
  return `
Assessment Task

Skill: ${meta.skill}
Level: ${meta.level}
Purpose: ${meta.purpose}

Improved Task Description:
${text}

Assessment Criteria:
${rubricText}

Instructions:
Students should prepare and deliver their presentation clearly and confidently, using appropriate vocabulary and pronunciation for the level.
`;
}

router.post("/", async (req, res) => {
  try {
    const { extractedText, meta, rubricText } = req.body;

    if (!extractedText || !meta || !rubricText) {
      return res.status(400).json({ ok: false, error: "Missing required fields." });
    }

    const improvedText = createRuleBasedRewrite(extractedText, meta, rubricText);

    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              text: "Assessment Pack",
              heading: HeadingLevel.HEADING_1,
            }),
            new Paragraph(" "),
            new Paragraph(improvedText),
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
  } catch (err) {
    console.error("Autofix error:", err);
    res.status(500).json({ ok: false, error: "Autofix pack generation failed." });
  }
});

module.exports = router;
