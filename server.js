const express = require("express");
const cors = require("cors");

const validityRouter = require("./validity"); // POST /api/validity
const autofixRouter = require("./autofix");   // POST /api/autofix

const app = express();

app.use(cors());
app.use(express.json({ limit: "5mb" }));

// Health checks
app.get("/", (req, res) => res.send("OK"));
app.get("/health", (req, res) => res.json({ ok: true }));
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    name: "ESL Validity Tool Backend",
    timestamp: new Date().toISOString(),
  });
});

// Primary routes
app.use("/api/validity", validityRouter);
app.use("/api/autofix", autofixRouter);

// Aliases (older frontend naming)
app.post("/api/report", (req, res, next) => {
  if (!req.body.extractedText && req.body.instructionsText) {
    req.body.extractedText = req.body.instructionsText;
  }
  return validityRouter(req, res, next); // router is middleware
});

app.post("/api/fix", (req, res, next) => {
  if (!req.body.extractedText && req.body.instructionsText) {
    req.body.extractedText = req.body.instructionsText;
  }
  return autofixRouter(req, res, next);
});

// Debug helper
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
