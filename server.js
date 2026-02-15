// server.js (ROOT) — CommonJS only (NO import statements)

const express = require("express");
const cors = require("cors");

// Your local modules (root)
const { runValidity, liteValidity } = require("./validity");
const { runAutofix } = require("./autofix");

// Optional export handlers (in /src/export)
let makePdf;
let makeDocx;
try {
  makePdf = require("./src/export/pdf");
} catch (e) {
  makePdf = null;
}
try {
  makeDocx = require("./src/export/docx");
} catch (e) {
  makeDocx = null;
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// --- Admin auth (Render Environment Variable: ADMIN_KEY) ---
function requireAdmin(req, res, next) {
  const expected = process.env.ADMIN_KEY || "";
  const provided = req.header("x-admin-key") || "";

  if (!expected) {
    return res.status(500).json({ ok: false, error: "ADMIN_KEY not configured on server." });
  }
  if (provided !== expected) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  next();
}

// --- Simple in-memory history (good enough for now) ---
const history = []; // newest first
function addToHistory(item) {
  history.unshift(item);
  if (history.length > 200) history.length = 200;
}

// --- Health / Routes ---
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    name: "ESL Validity Tool Backend",
    timestamp: new Date().toISOString(),
    groqConfigured: !!process.env.GROQ_API_KEY,
    liteAvailable: true,
    adminConfigured: !!process.env.ADMIN_KEY,
  });
});

app.get("/api/routes", (req, res) => {
  res.json({
    routes: [
      "GET /api/health",
      "GET /api/routes",
      "POST /api/report",
      "POST /api/report?mode=lite",
      "POST /api/autofix",
      "POST /api/fix (alias of /api/autofix)",
      "GET /api/history?limit=20 (admin)",
      "GET /api/report/pdf/:id (admin, if pdf export exists)",
      "GET /api/report/docx/:id (admin, if docx export exists)",
    ],
  });
});

// --- Main report endpoint ---
app.post("/api/report", async (req, res) => {
  try {
    const mode = (req.query.mode || "").toLowerCase();
    const input = req.body || {};

    let report;
    if (mode === "lite") {
      report = liteValidity(input); // local heuristic, zero-cost
    } else {
      report = await runValidity(input); // Groq-backed (or your logic)
    }

    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    addToHistory({ id, createdAt: new Date().toISOString(), mode: report?.mode || mode || "groq", input, report });

    res.json({ ok: true, id, report });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || "Server error" });
  }
});

// --- Autofix endpoint ---
app.post("/api/autofix", async (req, res) => {
  try {
    const input = req.body || {};
    const fixed = await runAutofix(input);

    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    addToHistory({ id, createdAt: new Date().toISOString(), mode: "autofix", input, report: fixed });

    res.json({ ok: true, id, report: fixed });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || "Server error" });
  }
});

// alias
app.post("/api/fix", (req, res) => app._router.handle(req, res, () => {}));

// --- Admin history ---
app.get("/api/history", requireAdmin, (req, res) => {
  const limit = Math.max(1, Math.min(200, parseInt(req.query.limit || "20", 10)));
  res.json({ ok: true, items: history.slice(0, limit) });
});

// --- Admin export (optional) ---
app.get("/api/report/pdf/:id", requireAdmin, async (req, res) => {
  if (!makePdf) return res.status(501).json({ ok: false, error: "PDF export not installed." });
  const item = history.find((h) => h.id === req.params.id);
  if (!item) return res.status(404).json({ ok: false, error: "Not found" });

  // Your pdf module can be either a function or { makePdf }
  const fn = typeof makePdf === "function" ? makePdf : makePdf.makePdf;
  if (typeof fn !== "function") return res.status(500).json({ ok: false, error: "PDF export module invalid." });

  try {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="report-${item.id}.pdf"`);
    await fn({ res, item });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || "PDF export failed" });
  }
});

app.get("/api/report/docx/:id", requireAdmin, async (req, res) => {
  if (!makeDocx) return res.status(501).json({ ok: false, error: "DOCX export not installed." });
  const item = history.find((h) => h.id === req.params.id);
  if (!item) return res.status(404).json({ ok: false, error: "Not found" });

  const fn = typeof makeDocx === "function" ? makeDocx : makeDocx.makeDocx;
  if (typeof fn !== "function") return res.status(500).json({ ok: false, error: "DOCX export module invalid." });

  try {
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader("Content-Disposition", `attachment; filename="report-${item.id}.docx"`);
    await fn({ res, item });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || "DOCX export failed" });
  }
});

// --- Start ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
