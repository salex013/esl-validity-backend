import express from "express";
import cors from "cors";
import multer from "multer";

import { extractDocxText } from "./extract.js";
import { buildDashboard } from "./validity.js";
import { autoFix } from "./autofix.js";
import { buildDocx } from "./docxBuild.js";

const BUILD_ID = "esl-validity-backend-score-route-v1-2026-02-13";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, name: "ESL Validity Tool Backend" });
});

// PROVE WHAT CODE IS DEPLOYED
app.get("/api/build", (req, res) => {
  res.json({ ok: true, build: BUILD_ID });
});

/**
 * Upload + extract DOCX to raw text
 * FormData: file
 * Returns: { extractedText }
 */
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    if (!String(req.file.originalname || "").toLowerCase().endsWith(".docx")) {
      return res.status(400).json({ error: "Please upload a .docx file." });
    }

    const result = await extractDocxText(req.file.buffer);
    res.json({ extractedText: result.text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Extraction failed." });
  }
});

/**
 * Server-authored dashboard scoring
 * Body: { extractedText, meta, rubricText? }
 * Returns: dashboard JSON
 */
app.post("/api/score", async (req, res) => {
  try {
    const { extractedText, meta, rubricText } = req.body || {};

    if (!extractedText || typeof extractedText !== "string") {
      return res.status(400).json({ error: "Missing extractedText." });
    }
    if (!meta || !meta.skill || !meta.level || !meta.purpose) {
      return res.status(400).json({ error: "Missing meta (skill, level, purpose)." });
    }

    const dashboard = buildDashboard(extractedText, meta, rubricText || "");
    res.json(dashboard);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Scoring failed." });
  }
});

/**
 * Generate improved DOCX using server dashboard + autofix
 * Body: { extractedText, meta, rubricText? }
 * Returns: DOCX file. Also sets X-Dashboard-Base64 header.
 */
app.post("/api/revise", async (req, res) => {
  try {
    const { extractedText, meta, rubricText } = req.body || {};

    if (!extractedText || typeof extractedText !== "string") {
      return res.status(400).json({ error: "Missing extractedText." });
    }
    if (!meta || !meta.skill || !meta.level || !meta.purpose) {
      return res.status(400).json({ error: "Missing meta (skill, level, purpose)." });
    }

    const dashboard = buildDashboard(extractedText, meta, rubricText || "");
    const fix = autoFix(extractedText, meta, dashboard, rubricText || "");

    const buffer = await buildDocx(meta, fix, dashboard);

    // Provide dashboard for UI to decode if desired
    const dashB64 = Buffer.from(JSON.stringify(dashboard), "utf8").toString("base64");
    res.setHeader("X-Dashboard-Base64", dashB64);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Improved_Assessment_${safe(meta.skill)}_${safe(meta.level)}.docx"`
    );

    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Revision failed." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT} (${BUILD_ID})`));

function safe(s) {
  return String(s || "")
    .replace(/[^a-z0-9-_ ]/gi, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 40) || "NA";
}
