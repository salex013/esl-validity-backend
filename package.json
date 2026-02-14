const express = require("express");
const cors = require("cors");

const validityRouter = require("./validity");   // POST /api/validity
const autofixRouter = require("./autofix");     // POST /api/autofix

const app = express();

app.use(cors());
app.use(express.json({ limit: "5mb" }));

// Health (Render check + human check)
app.get("/", (req, res) => res.send("OK"));
app.get("/health", (req, res) => res.json({ ok: true }));
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    name: "ESL Validity Tool Backend",
    timestamp: new Date().toISOString(),
  });
});

// Primary routes (your actual implemented routers)
app.use("/api/validity", validityRouter);
app.use("/api/autofix", autofixRouter);

// ✅ Aliases for your frontend / older naming
// /api/report  -> same as /api/validity
// /api/fix     -> same as /api/autofix
app.post("/api/report", (req, res, next) => {
  // allow either extractedText OR instructionsText
  if (!req.body.extractedText && req.body.instructionsText) {
    req.body.extractedText = req.body.instructionsText;
  }
  return validityRouter.handle(req, res, next);
});

app.post("/api/fix", (req, res, next) => {
  if (!req.body.extractedText && req.body.instructionsText) {
    req.body.extractedText = req.body.instructionsText;
  }
  return autofixRouter.handle(req, res, next);
});

// Debug helper: see what routes exist
app.get("/api/routes", (req, res) => {
  res.json({
    routes: [
      "GET /api/health",
      "POST /api/validity",
      "POST /api/report (alias of /api/validity)",
      "POST /api/autofix",
      "POST /api/fix (alias of /api/autofix)",
    ],
  });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server running on port", PORT));
