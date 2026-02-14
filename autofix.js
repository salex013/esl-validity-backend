const express = require("express");
const archiver = require("archiver");
const { Document, Packer, Paragraph, TextRun } = require("docx");

const router = express.Router();

/**
 * POST /api/autofix
 * Returns: ZIP (report.json + fixed.docx)
 *
 * Body:
 * {
 *   "instructionsText": "...", // or extractedText
 *   "rubricText": "...",
 *   "skill": "...",
 *   "levelFramework": "CLB"|"CEFR",
 *   "level": "5",
 *   "purpose": "Summative"
 * }
 */
router.post("/", async (req, res) => {
  try {
    const {
      skill,
      levelFramework,
      level,
      purpose,
      instructionsText,
      extractedText,
      rubricText,
    } = req.body || {};

    const text = extractedText || instructionsText || "";
    if (!text.trim()) {
      return res.status(400).json({ ok: false, error: "Missing extractedText/instructionsText" });
    }

    // (Optional) if you want autofix to use AI too, you can reuse OPENAI_API_KEY here.
    // For now: a simple “fixed” version by adding structure headers.
    const fixedText =
`ASSESSMENT INSTRUCTIONS (REVISED)

Skill: ${skill || "Unknown"}
Framework/Level: ${levelFramework || "Unknown"} ${level || ""}
Purpose: ${purpose || "Unknown"}

1) Task
${text.trim()}

2) Success Criteria (based on rubric)
${rubricText ? rubricText.trim() : "(No rubric provided — add criteria here.)"}

3) Submission
- Include your name and student ID.
- Submit by the deadline posted in SLATE.
`;

    const report = {
      ok: true,
      name: "Autofix Package",
      timestamp: new Date().toISOString(),
      notes: [
        "This ZIP includes a revised instruction docx + a JSON report file.",
      ],
    };

    // Build DOCX
    const doc = new Document({
      sections: [
        {
          children: fixedText.split("\n").map((line) =>
            new Paragraph({
              children: [new TextRun(line)],
            })
          ),
        },
      ],
    });

    const docxBuffer = await Packer.toBuffer(doc);

    // Stream ZIP back
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="autofix.zip"');

    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.on("error", (err) => {
      // If archiver errors mid-stream
      try {
        res.status(500).end();
      } catch {}
      console.error(err);
    });

    archive.pipe(res);

    archive.append(JSON.stringify(report, null, 2), { name: "report.json" });
    archive.append(docxBuffer, { name: "fixed.docx" });

    await archive.finalize();
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

module.exports = router;
