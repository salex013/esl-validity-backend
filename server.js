const express = require("express");
const cors = require("cors");

const validityRouter = require("./validity");
const autofixRouter = require("./autofix");

const app = express();

app.use(cors());
app.use(express.json({ limit: "5mb" }));

// ==============================
// 🔐 ADMIN KEY (hardcoded)
// ==============================
const ADMIN_KEY = "sara-validity-2026-super-secret";

// ==============================
// In-memory report store
// ==============================
const reports = [];

// ==============================
// Health
// ==============================
app.get("/", (req, res) => res.send("OK"));

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    name: "ESL Validity Tool Backend",
    timestamp: new Date().toISOString(),
  });
});

// ==============================
// MAIN REPORT ROUTE
// ==============================
app.post("/api/report", async (req, res) => {
  try {
    const mode = req.query.mode || "groq";

    // Run AI validation
    const report = await validityRouter.runValidation(req.body, mode);

    const id = `rep_${Date.now()}`;

    const stored = {
      id,
      createdAt: new Date().toISOString(),
      input: req.body,
      report,
    };

    reports.unshift(stored);

    res.json({
      ok: true,
      id,
      report,
    });
  } catch (err) {
    console.error("REPORT ERROR:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==============================
// Autofix route
// ==============================
app.post("/api/fix", async (req, res) => {
  try {
    const mode = req.query.mode || "groq";

    const result = await autofixRouter.runAutofix(req.body, mode);

    res.json({
      ok: true,
      result,
    });
  } catch (err) {
    console.error("AUTOFIX ERROR:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==============================
// 🔐 ADMIN ROUTES
// ==============================

function checkAdmin(req, res, next) {
  const key = req.headers["x-admin-key"];
  if (!key || key !== ADMIN_KEY) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  next();
}

// View history
app.get("/api/history", checkAdmin, (req, res) => {
  const limit = parseInt(req.query.limit || "20");
  res.json({
    ok: true,
    count: reports.length,
    items: reports.slice(0, limit),
  });
});

// Export PDF (placeholder for now)
app.get("/api/report/pdf/:id", checkAdmin, (req, res) => {
  res.json({ ok: true, message: "PDF export coming next" });
});

// Export DOCX (placeholder)
app.get("/api/report/docx/:id", checkAdmin, (req, res) => {
  res.json({ ok: true, message: "DOCX export coming next" });
});

// ==============================

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
