const express = require("express");
const cors = require("cors");

const { scoreAssessment } = require("./validity");
const { buildAssessmentPackDocxBuffer } = require("./docxBuild");
const { createRuleBasedRewrite, createAIRewrite } = require("./autofix");

const app = express();

// Render/Netlify friendly
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// --- Health + build tags (handy for debugging deploys)
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, name: "ESL Validity Tool Backend" });
});

app.get("/api/build", (_req, res) => {
  res.json({ ok: true, build: "esl-validity-backend-ai-pack-v1-2026-02-13" });
});

// --- Score route (POST)
app.post("/api/score", (req, res) => {
  try {
    const { extractedText = "", rubricText = "", meta = {} } = req.body || {};
    const result = scoreAssessment({ extractedText, rubricText, meta });
    res.json(result);
  } catch (err) {
    console.error("Score error:", err);
    res.status(500).json({ ok: false, error: "Scoring failed." });
  }
});

// Friendly messages if someone hits GET in the browser
app.get("/api/score", (_req, res) => {
  res
    .status(405)
    .send("Use POST /api/score with JSON { extractedText, rubricText, meta }");
});

// --- Autofix → returns a downloadable DOCX pack (original + rule + AI)
app.post("/api/autofix", async (req, res) => {
  try {
    const { extractedText = "", rubricText = "", meta = {} } = req.body || {};

    // 1) Rule-based rewrite (always available)
    const rule = createRuleBasedRewrite({ extractedText, rubricText, meta });

    // 2) AI rewrite (optional; falls back if no key)
    const ai = await createAIRewrite({
      extractedText,
      rubricText,
      meta,
      ruleFallback: rule
    });

    const packBuffer = await buildAssessmentPackDocxBuffer({
      meta,
      original: { extractedText, rubricText },
      rule,
      ai
    });

    const filename = "Assessment Pack.docx";
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(packBuffer);
  } catch (err) {
    console.error("Autofix error:", err);
    res.status(500).json({ ok: false, error: "Autofix pack generation failed." });
  }
});

app.get("/api/autofix", (_req, res) => {
  res
    .status(405)
    .send("Use POST /api/autofix with JSON { extractedText, rubricText, meta }");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Server listening on port", PORT);
});
