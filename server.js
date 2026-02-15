// server.js (ROOT)
// Start command on Render: node server.js

const express = require("express");
const cors = require("cors");

const runValidity = require("./validity");     // ROOT validity.js
const runAutofix = require("./autofix");       // ROOT autofix.js

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 10000;
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const ADMIN_KEY = (process.env.ADMIN_KEY || "").trim();

// --------------------
// In-memory storage
// --------------------
const reports = new Map(); // id -> { id, createdAt, mode, input, report }
let counter = 0;

function makeId() {
  counter += 1;
  return `${Date.now()}-${counter}-${Math.random().toString(16).slice(2)}`;
}

// --------------------
// Admin middleware
// --------------------
function requireAdmin(req, res, next) {
  const provided = (req.header("x-admin-key") || "").trim();

  // If ADMIN_KEY isn't set, lock admin endpoints down.
  if (!ADMIN_KEY) {
    return res.status(500).json({
      ok: false,
      error: "ADMIN_KEY is not configured on the server.",
    });
  }

  if (!provided || provided !== ADMIN_KEY) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  next();
}

// --------------------
// Routes
// --------------------
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    name: "ESL Validity Tool Backend",
    timestamp: new Date().toISOString(),
    groqConfigured: Boolean(GROQ_API_KEY),
    liteAvailable: true,
    adminConfigured: Boolean(ADMIN_KEY),
  });
});

app.get("/api/routes", (req, res) => {
  res.json({
    routes: [
      "GET /api/health",
      "GET /api/routes",
      "GET /api/status",
      "GET /api/stats",
      "GET /api/logs (in-memory sample)",
      "POST /api/validity (alias of /api/report)",
      "POST /api/report",
      "POST /api/autofix",
      "POST /api/fix (alias of /api/autofix)",
      "GET /api/history?limit=20 (admin)",
      "GET /api/report/pdf/:id (admin, if exporter exists)",
      "GET /api/report/docx/:id (admin, if exporter exists)",
    ],
  });
});

app.get("/api/status", (req, res) => {
  res.json({
    ok: true,
    uptimeSec: Math.round(process.uptime()),
    reportsInMemory: reports.size,
    groqConfigured: Boolean(GROQ_API_KEY),
    adminConfigured: Boolean(ADMIN_KEY),
  });
});

app.get("/api/stats", (req, res) => {
  // quick mini-metrics from stored reports
  const byMode = { groq: 0, lite: 0 };
  for (const r of reports.values()) {
    if (r.mode === "lite") byMode.lite += 1;
    else byMode.groq += 1;
  }

  res.json({
    ok: true,
    totalInMemory: reports.size,
    byMode,
    groqConfigured: Boolean(GROQ_API_KEY),
    liteAvailable: true,
  });
});

// A tiny “logs” sample so you can see activity without external logging
app.get("/api/logs", (req, res) => {
  const sampleWindow = Math.min(25, reports.size);
  const last = Array.from(reports.values())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, sampleWindow)
    .map((x) => ({
      id: x.id,
      createdAt: x.createdAt,
      mode: x.mode,
      skill: x.input?.skill,
      levelFramework: x.input?.levelFramework,
      level: x.input?.level,
      purpose: x.input?.purpose,
    }));

  res.json({ ok: true, sampleWindow, last });
});

// -------- report / validity (same thing) --------
async function handleReport(req, res) {
  try {
    const modeParam = (req.query.mode || "").toString().trim().toLowerCase();
    const mode = modeParam === "lite" ? "lite" : "groq";

    const input = req.body || {};
    const report = await runValidity(input, { mode, groqApiKey: GROQ_API_KEY });

    const id = makeId();
    const record = {
      id,
      createdAt: new Date().toISOString(),
      mode: report?.mode || mode,
      input,
      report,
    };
    reports.set(id, record);

    res.json({ ok: true, reportId: id, report });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err?.message || String(err),
    });
  }
}

app.post("/api/report", handleReport);
app.post("/api/validity", handleReport);

// -------- autofix / fix (same thing) --------
async function handleAutofix(req, res) {
  try {
    const modeParam = (req.query.mode || "").toString().trim().toLowerCase();
    const mode = modeParam === "lite" ? "lite" : "groq";

    const input = req.body || {};
    const fix = await runAutofix(input, { mode, groqApiKey: GROQ_API_KEY });

    res.json({ ok: true, mode: fix?.mode || mode, fix });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err?.message || String(err),
    });
  }
}

app.post("/api/autofix", handleAutofix);
app.post("/api/fix", handleAutofix);

// -------- admin history --------
app.get("/api/history", requireAdmin, (req, res) => {
  const limit = Math.max(
    1,
    Math.min(200, parseInt(req.query.limit || "20", 10) || 20)
  );

  const items = Array.from(reports.values())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);

  res.json({ ok: true, limit, items });
});

// -------- admin export endpoints (optional) --------
function tryRequire(path) {
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require(path);
  } catch {
    return null;
  }
}

app.get("/api/report/pdf/:id", requireAdmin, async (req, res) => {
  const record = reports.get(req.params.id);
  if (!record) return res.status(404).json({ ok: false, error: "Not found" });

  // If you have exporters elsewhere, you can hook them in.
  // Example: const makePdf = require("./src/export/pdf");
  const makePdf = tryRequire("./src/export/pdf");
  if (!makePdf) {
    return res.status(501).json({
      ok: false,
      error: "PDF export module not found at ./src/export/pdf.js",
    });
  }

  const pdfBuffer = await makePdf(record);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="report-${record.id}.pdf"`);
  res.send(pdfBuffer);
});

app.get("/api/report/docx/:id", requireAdmin, async (req, res) => {
  const record = reports.get(req.params.id);
  if (!record) return res.status(404).json({ ok: false, error: "Not found" });

  const makeDocx = tryRequire("./src/export/docx");
  if (!makeDocx) {
    return res.status(501).json({
      ok: false,
      error: "DOCX export module not found at ./src/export/docx.js",
    });
  }

  const docxBuffer = await makeDocx(record);
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="report-${record.id}.docx"`
  );
  res.send(docxBuffer);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
