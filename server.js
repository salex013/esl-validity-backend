import express from "express";
import cors from "cors";
import multer from "multer";
import { extractDocxText } from "./extract.js";
import { buildDashboard } from "./validity.js";
import { autoFix } from "./autofix.js";
import { buildDocx } from "./docxBuild.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, name: "ESL Validity Tool Backend" });
});

app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });

    const result = await extractDocxText(req.file.buffer);

    res.json({
      extractedText: result.text
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Extraction failed." });
  }
});

app.post("/api/revise", async (req, res) => {
  try {
    const { extractedText, meta } = req.body;

    if (!extractedText) {
      return res.status(400).json({ error: "Missing text." });
    }

    const dashboard = buildDashboard(extractedText, meta);
    const fix = autoFix(extractedText, meta, dashboard);

    const buffer = await buildDocx(meta, fix, dashboard);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Improved_Assessment.docx"`
    );

    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Revision failed." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
