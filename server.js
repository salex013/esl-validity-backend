const express = require("express");
const cors = require("cors");
const archiver = require("archiver");

const runValidityCheck = require("./validity");
const buildDocx = require("./docBuild");
const runAutofix = require("./autofix");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ===============================
// Health Check Route
// ===============================
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "ESL Assessment Validity Checker Backend",
    status: "running"
  });
});

// ===============================
// Run Report
// ===============================
app.post("/api/report", async (req, res) => {
  try {
    const {
      instructions,
      rubric,
      skill,
      levelFramework,
      level,
      purpose
    } = req.body;

    const report = runValidityCheck({
      instructions,
      rubric,
      skill,
      levelFramework,
      level,
      purpose
    });

    res.json({ success: true, report });

  } catch (err) {
    console.error("REPORT ERROR:", err);
    res.status(500).json({ success: false, error: "Report generation failed." });
  }
});

// ===============================
// Fix & Generate Updated DOCX ZIP
// ===============================
app.post("/api/fix", async (req, res) => {
  try {
    const {
      instructions,
      rubric,
      skill,
      levelFramework,
      level,
      purpose
    } = req.body;

    const fixed = runAutofix({
      instructions,
      rubric,
      skill,
      levelFramework,
      level,
      purpose
    });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", "attachment; filename=updated-assessment-pack.zip");

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(res);

    const instructionDoc = await buildDocx("Updated Instructions", fixed.instructions);
    const rubricDoc = await buildDocx("Updated Rubric", fixed.rubric);

    archive.append(instructionDoc, { name: "Updated_Instructions.docx" });
    archive.append(rubricDoc, { name: "Updated_Rubric.docx" });

    await archive.finalize();

  } catch (err) {
    console.error("FIX ERROR:", err);
    res.status(500).json({ success: false, error: "Fix generation failed." });
  }
});

// ===============================
// Root Route (Optional but Helpful)
// ===============================
app.get("/", (req, res) => {
  res.send("ESL Assessment Validity Checker Backend is running.");
});

// ===============================
// Start Server
// ===============================
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
