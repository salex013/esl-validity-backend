const express = require("express");
const cors = require("cors");

// Support BOTH export styles:
// 1) module.exports = router
// 2) module.exports = { router, ... }
const validityMod = require("./validity");
const autofixMod = require("./autofix");

const validityRouter = validityMod?.router || validityMod;
const autofixRouter = autofixMod?.router || autofixMod;

const app = express();

app.use(cors());
app.use(express.json({ limit: "5mb" }));

/**
 * If your frontend sends "instructionsText" but your route expects "extractedText",
 * this middleware normalizes it.
 */
function normalizeBody(req, res, next) {
  try {
    if (!req.body) req.body = {};
    if (!req.body.extractedText && req.body.instructionsText) {
      req.body.extractedText = req.body.instructionsText;
    }
  } catch (e) {
    // ignore and continue
  }
  next();
}

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

// Primary routes
app.use("/api/validity", normalizeBody, validityRouter);
app.use("/api/autofix", normalizeBody, autofixRouter);

// ✅ Aliases (do NOT call .handle — just mount the routers)
app.use("/api/report", normalizeBody, validityRouter);
app.use("/api/fix", normalizeBody, autofixRouter);

// Debug helper: see what routes exist
app.get("/api/routes", (req, res) => {
  res.json({
    routes: [
      "GET /api/health",
      "GET /api/routes",
      "POST /api/validity",
      "POST /api/report (alias of /api/validity)",
      "POST /api/autofix",
      "POST /api/fix (alias of /api/autofix)",
    ],
  });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server running on port", PORT));
