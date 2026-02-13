// server.js
import express from "express";
import cors from "cors";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ---- Health check
app.get("/api/health", (req, res) => {
  res.json({ ok: true, name: "ESL Validity Tool Backend" });
});

// ---- Small helpers
function safeStr(v) {
  return typeof v === "string" ? v : "";
}

function ruleBasedImprove({ extractedText, meta, rubricText }) {
  // Simple, safe “rewrite” logic (you can expand later)
  const skill = safeStr(meta?.skill) || "Skill";
  const level = safeStr(meta?.level) || "Level";
  const purpose = safeStr(meta?.purpose) || "Purpose";

  const task = safeStr(extractedText).trim() || "(No task provided.)";
  const rubric = safeStr(rubricText).trim() || "(No rubric provided.)";

  // Basic structure for your pack
  const improvedTask = [
    `Task: ${task}`,
    "",
    "Student instructions:",
    "• Prepare your response using clear organization (beginning, middle, end).",
    "• Use appropriate vocabulary for the topic.",
    "• Speak clearly and at a steady pace.",
    "• Check the rubric below before you submit.",
  ].join("\n");

  const criteriaList = rubric
    .replace(/\s+/g, " ")
    .split(/(?:Criteria:|Criteria\s*-\s*|Rubric:)/i)
    .pop()
    ?.trim();

  const cleanCriteria = criteriaList ? `Criteria: ${criteriaList}` : rubric;

  return {
    meta: { skill, level, purpose },
    improvedTask,
    rubric: cleanCriteria,
    notes: [
      "This is a rule-based output (no OpenAI).",
      "If you want AI rewriting later, we can plug it in safely after the DOCX pipeline is solid.",
    ],
  };
}

async function buildDocxBuffer({ title, meta, improvedTask, rubric, notes }) {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: title,
            heading: HeadingLevel.TITLE,
          }),

          new Paragraph({
            children: [
              new TextRun({ text: "Skill: ", bold: true }),
              new TextRun(meta.skill),
              new TextRun({ text: "   Level: ", bold: true }),
              new TextRun(meta.level),
              new TextRun({ text: "   Purpose: ", bold: true }),
              new TextRun(meta.purpose),
            ],
          }),

          new Paragraph({ text: "" }),

          new Paragraph({
            text: "Improved Task",
            heading: HeadingLevel.HEADING_1,
          }),

          ...improvedTask.split("\n").map((line) => new Paragraph(line)),

          new Paragraph({ text: "" }),

          new Paragraph({
            text: "Rubric / Criteria",
            heading: HeadingLevel.HEADING_1,
          }),

          ...rubric.split("\n").map((line) => new Paragraph(line)),

          new Paragraph({ text: "" }),

          new Paragraph({
            text: "Notes",
            heading: HeadingLevel.HEADING_1,
          }),

          ...(notes || []).map((n) => new Paragraph(`• ${n}`)),
        ],
      },
    ],
  });

  return await Packer.toBuffer(doc);
}

// ---- Main endpoint
app.post("/api/autofix", async (req, res) => {
  try {
    const extractedText = safeStr(req.body?.extractedText);
    const rubricText = safeStr(req.body?.rubricText);
    const meta = req.body?.meta || {};

    // If caller wants JSON, return JSON
    const accept = (req.headers.accept || "").toLowerCase();
    const wantsJson = accept.includes("application/json");

    const result = ruleBasedImprove({ extractedText, meta, rubricText });

    if (wantsJson) {
      return res.json({
        ok: true,
        mode: "rule-based",
        ...result,
      });
    }

    // Otherwise: return DOCX download
    const buffer = await buildDocxBuffer({
      title: "Assessment Pack",
      ...result,
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader("Content-Disposition", 'attachment; filename="Assessment-Pack.docx"');
    res.setHeader("Content-Length", buffer.length);

    return res.status(200).send(buffer);
  } catch (err) {
    console.error("Autofix error:", err);
    return res.status(500).json({
      ok: false,
      error: "Autofix pack generation failed.",
      details: err?.message || String(err),
    });
  }
});

// ---- Render port binding
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Server listening on port", PORT);
});
