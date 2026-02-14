"use strict";

const express = require("express");
const cors = require("cors");
const archiver = require("archiver");
const { Document, Packer, Paragraph, TextRun } = require("docx");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 10000;

// -------------------- Health --------------------
app.get("/api/health", (req, res) => {
  res.json({ ok: true, name: "ESL Validity Tool Backend" });
});

// -------------------- Report --------------------
app.post("/api/report", (req, res) => {
  const instructions = (req.body?.instructions || "").trim();
  const rubric = (req.body?.rubric || "").trim();
  const meta = req.body?.meta || {};

  const issues = [];

  if (instructions.length < 50) {
    issues.push("Instructions are too short or unclear (add more detail).");
  }
  if (rubric.length < 50) {
    issues.push("Rubric is too short or missing (include criteria + bands/levels).");
  }

  const rubricLower = rubric.toLowerCase();
  if (!rubricLower.includes("level") && !rubricLower.includes("band") && !rubricLower.includes("criteria")) {
    issues.push("Rubric does not clearly show levels/bands and criteria language.");
  }

  res.json({
    ok: true,
    meta,
    issues,
    summary: issues.length === 0
      ? "No major validity issues detected."
      : "Potential validity concerns detected."
  });
});

// -------------------- Fix + Zip DOCX --------------------
app.post("/api/fix", async (req, res) => {
  const instructions = (req.body?.instructions || "").trim();
  const rubric = (req.body?.rubric || "").trim();
  const meta = req.body?.meta || {};

  const improvedInstructions =
    instructions +
    "\n\nImprovement notes:\n- Clarified task expectations\n- Added alignment cues (what success looks like)\n- Reduced ambiguity in instructions";

  const improvedRubric =
    rubric +
    "\n\nImprovement notes:\n- Strengthened performance descriptors\n- Clarified levels/bands language\n- Improved reliability wording (consistent scoring)";

  const doc1 = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [new TextRun({ text: "Updated Instructions", bold: true, size: 32 })]
          }),
          new Paragraph(""),
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
            children: [new TextRun({ text: "Updated Rubric", bold: true, size: 32 })]
          }),
          new Paragraph(""),
          new Paragraph(improvedRubric)
        ]
      }
    ]
  });

  // Stream ZIP back
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", "attachment; filename=updated-pack.zip");

  const archive = archiver("zip", { zlib: { level: 9 } });

  archive.on("error", (err) => {
    console.error("Archiver error:", err);
    if (!res.headersSent) res.status(500);
    res.end();
  });

  archive.pipe(res);

  const buffer1 = await Packer.toBuffer(doc1);
  const buffer2 = await Packer.toBuffer(doc2);

  archive.append(buffer1, { name: "Updated-Instructions.docx" });
  archive.append(buffer2, { name: "Updated-Rubric.docx" });

  // Optional: include a tiny metadata file
  archive.append(JSON.stringify({ meta, generatedAt: new Date().toISOString() }, null, 2), {
    name: "meta.json"
  });

  await archive.finalize();
});

// -------------------- Start --------------------
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
