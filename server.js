const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const { scoreAssessment } = require("./validity");
const { buildAssessmentPackDocxBuffer } = require("./autofix");

const app = express();

// --- Config ---
const PORT = process.env.PORT || 10000;

// If you want to lock this down later, replace "*" with your Netlify domain.
app.use(cors({ origin: "*" }));
app.use(helmet());
app.use(morgan("tiny"));
app.use(express.json({ limit: "2mb" }));

// --- Routes ---
app.get("/api/health", (req, res) => {
  res.json({ ok: true, name: "ESL Validity Tool Backend" });
});

app.get("/api/build", (req, res) => {
  res.json({ ok: true, build: "esl-validity-backend-autofix-pack-v1-2026-02-13" });
});

// Score route (JSON)
app.post("/api/score", (req, res) => {
  try {
    const { extractedText = "", meta = {}, rubricText = "" } = req.body || {};
    const result = scoreAssessment({ extractedText, meta, rubricText });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "score_failed", message: err?.message || "Unknown error" });
  }
});

// Autofix route (returns downloadable DOCX "Assessment Pack")
app.post("/api/autofix", async (req, res) => {
  try {
    const { extractedText = "", meta = {}, rubricText = "" } = req.body || {};
    if (!String(extractedText).trim()) {
      return res.status(400).json({
        error: "missing_extractedText",
        message: "Assessment instructions text is required."
      });
    }

    // Use the same scoring engine to decide what to fix-first
    const score = scoreAssessment({ extractedText, meta, rubricText });

    const buffer = await buildAssessmentPackDocxBuffer({
      extractedText,
      rubricText,
      meta,
      score
    });

    const safeSkill = (meta?.skill || "Skill").toString().replace(/[^a-z0-9_-]+/gi, "-");
    const safeLevel = (meta?.level || "Level").toString().replace(/[^a-z0-9_-]+/gi, "-");
    const filename = `Assessment-Pack_${safeSkill}_${safeLevel}.docx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: "autofix_failed", message: err?.message || "Unknown error" });
  }
});

// Root (nice message)
app.get("/", (req, res) => {
  res.type("text").send("ESL Validity Tool Backend is running. Try /api/health");
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
