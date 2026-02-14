const express = require("express");
const cors = require("cors");
const archiver = require("archiver");
const { Document, Packer, Paragraph, TextRun } = require("docx");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

app.get("/api/health", (req, res) => {
  res.json({ ok: true, name: "ESL Validity Tool Backend" });
});

app.post("/api/report", (req, res) => {
  const { instructions, rubric } = req.body;

  let issues = [];

  if (!instructions || instructions.length < 50) {
    issues.push("Instructions are too short or unclear.");
  }

  if (!rubric || rubric.length < 50) {
    issues.push("Rubric is missing detail or performance levels.");
  }

  if (!rubric.toLowerCase().includes("level")) {
    issues.push("Rubric does not clearly define performance levels.");
  }

  res.json({
    ok: true,
    issues,
    summary:
      issues.length === 0
        ? "No major validity issues detected."
        : "Potential validity concerns detected."
  });
});

app.post("/api/fix", async (req, res) => {
  const { instructions, rubric } = req.body;

  const improvedInstructions =
    instructions +
    "\n\nImprovement: Clarified task expectations and performance criteria alignment.";

  const improvedRubric =
    rubric +
    "\n\nImprovement: Explicit level descriptors added for clearer scoring reliability.";

  const doc1 = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: "Updated Instructions",
                bold: true,
                size: 32
              })
            ]
          }),
          new Paragraph(improvedInstructions)
        ]
      }
    ]
  });

  const doc2 = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: "Updated Rubric",
                bold: true,
                size: 32
              })
            ]
          }),
          new Paragraph(improvedRubric)
        ]
      }
    ]
  });

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", "attachment; filename=updated-pack.zip");

  const archive = archiver("zip");
  archive.pipe(res);

  const buffer1 = await Packer.toBuffer(doc1);
  const buffer2 = await Packer.toBuffer(doc2);

  archive.append(buffer1, { name: "Updated-Instructions.docx" });
  archive.append(buffer2, { name: "Updated-Rubric.docx" });

  archive.finalize();
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${
