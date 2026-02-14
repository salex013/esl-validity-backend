const express = require("express");
const cors = require("cors");
const archiver = require("archiver");

const { runValidityReport } = require("./validity");
const { buildFixedDocsZip } = require("./docxBuild");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.get("/", (req, res) => {
  res.send("ESL Validity Backend Running");
});

app.post("/report", async (req, res) => {
  try {
    const report = runValidityReport(req.body);
    res.json(report);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Report generation failed" });
  }
});

app.post("/fix", async (req, res) => {
  try {
    await buildFixedDocsZip(req, res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Fix generation failed" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
