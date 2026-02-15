/**
 * Root server.js (repo root)
 * - Express API for ESL Validity Tool
 * - Admin-protected endpoints via x-admin-key header
 * - In-memory report store (swap for DB later)
 */

import express from "express";
import cors from "cors";

import { runValidity } from "./validity.js";
import { runAutofix } from "./autofix.js";

// Optional exports (only if files exist)
let buildPdf = null;
let buildDocx = null;
try {
  const mod = await import("./src/export/pdf.js");
  buildPdf = mod.buildPdf || mod.default || null;
} catch (_) {}
try {
  const mod = await import("./src/export/docx.js");
  buildDocx = mod.buildDocx || mod.default || null;
} catch (_) {}

const app = express();

// --- Basic middleware ---
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// --- Config ---
const PORT = process.env.PORT || 10000;
const ADMIN_KEY = (process.env.ADMIN_KEY || "").trim();
const GROQ_API_KEY = (process.env.GROQ_API_KEY || "").trim();

// --- Simple in-memory storage ---
/**
 * report record:
 * {
 *   id, createdAt,
 *   input: {...},
 *   report: {...},
 *   mode: "groq"|"lite",
 *   groqError?: {...} // if groq failed and we fell back
 * }
 */
const REPORTS = new Map();

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// --- Auth middleware ---
function requireAdmin(req, res, next) {
  if (!ADMIN_KEY) {
    return res.status(500).json({
      ok: false,
      error: "ADMIN_KEY is not configured on the server",
    });
  }
  const key = (req.get("x-admin-key") || "").trim();
  if (!key || key !== ADMIN_KEY) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  next();
}

// --- Helpers ---
function pickMode(req) {
  const mode = (req.query.mode || "").toString().trim().toLowerCase();
  return mode === "lite" ? "lite" : "groq";
}

function validateReportBody(body) {
  // Minimal required fields for your validator
  const required = ["skill", "levelFramework", "level", "purpose", "instructionsText", "rubricText"];
  const missing = required.filter((k) => !body?.[k] || String(body[k]).trim() === "");
  return missing;
}

// --- Routes ---
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

app.get("/api/status", (req, res) => {
  res.json({
    ok: true,
    groqConfigured: Boolean(GROQ_API_KEY),
    adminConfigured: Boolean(ADMIN_KEY),
  });
});

app.get("/api/routes", (req, res) => {
  res.json({
    routes: [
      "GET  /api/health",
      "GET  /api/routes",
      "GET  /api/status",
      "POST /api/report",
      "POST /api/validity (alias of /api/report)",
      "POST /api/autofix",
      "POST /api/fix (alias of /api/autofix)",
      "GET  /api/history?limit=20 (admin)",
      "GET  /api/report/pdf/:id (admin if exporter exists)",
      "GET  /api/report/docx/:id (admin if exporter exists)",
    ],
  });
});

/**
 * POST /api/report?mode=lite|groq
 * - mode=lite always uses local checks
 * - mode=groq uses Groq if configured, otherwise falls back to lite
 */
app.post("/api/report", async (req, res) => {
  try {
    const missing = validateReportBody(req.body);
    if (missing.length) {
      return res.status(400).json({
        ok: false,
        error: `Missing required fields: ${missing.join(", ")}`,
      });
    }

    const requestedMode = pickMode(req);

    // If user asked lite, do lite only.
    // If user asked groq but groq isn't configured, fall back to lite.
    const canUseGroq = Boolean(GROQ_API_KEY);
    const finalMode = requestedMode === "lite" ? "lite" : (canUseGroq ? "groq" : "lite");

    let report;
    let groqError = null;

    if (finalMode === "groq") {
      try {
        report = await runValidity(req.body, { mode: "groq" });
      } catch (err) {
        // Fallback to lite if Groq fails (decommissioned model, etc.)
        groqError = {
          message: err?.message || String(err),
          type: err?.type,
          code: err?.code,
        };
        report = await runValidity(req.body, { mode: "lite" });
      }
    } else {
      report = await runValidity(req.body, { mode: "lite" });
    }

    const id = makeId();
    const record = {
      id,
      createdAt: new Date().toISOString(),
      input: req.body,
      report,
      mode: finalMode,
      ...(groqError ? { groqError } : {}),
    };
    REPORTS.set(id, record);

    return res.json({ ok: true, id, report, ...(groqError ? { groqError } : {}) });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || String(err),
    });
  }
});

// Aliases (so old front-end calls don’t break)
app.post("/api/validity", (req, res) => {
  // forward to /api/report keeping query string
  req.url = `/api/report${req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""}`;
  app.handle(req, res);
});

app.post("/api/autofix", async (req, res) => {
  try {
    const missing = validateReportBody(req.body);
    if (missing.length) {
      return res.status(400).json({
        ok: false,
        error: `Missing required fields: ${missing.join(", ")}`,
      });
    }

    const fixed = await runAutofix(req.body);
    return res.json({ ok: true, fixed });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

app.post("/api/fix", (req, res) => {
  req.url = "/api/autofix";
  app.handle(req, res);
});

// Admin: list recent reports
app.get("/api/history", requireAdmin, (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit || 20)));
  const items = Array.from(REPORTS.values())
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit)
    .map(({ id, createdAt, mode, input, report, groqError }) => ({
      id,
      createdAt,
      mode,
      input,
      report,
      ...(groqError ? { groqError } : {}),
    }));

  res.json({ ok: true, count: items.length, items });
});

// Admin: export PDF
app.get("/api/report/pdf/:id", requireAdmin, async (req, res) => {
  if (!buildPdf) {
    return res.status(501).json({ ok: false, error: "PDF exporter not available on this build" });
  }
  const rec = REPORTS.get(req.params.id);
  if (!rec) return res.status(404).json({ ok: false, error: "Not found" });

  try {
    const out = await buildPdf(rec); // exporter decides format
    // If exporter returns a Buffer:
    if (Buffer.isBuffer(out)) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="report-${rec.id}.pdf"`);
      return res.send(out);
    }
    // If exporter returns { buffer, filename, contentType }:
    if (out?.buffer && Buffer.isBuffer(out.buffer)) {
      res.setHeader("Content-Type", out.contentType || "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${out.filename || `report-${rec.id}.pdf`}"`);
      return res.send(out.buffer);
    }
    return res.status(500).json({ ok: false, error: "Unexpected PDF exporter output" });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

// Admin: export DOCX
app.get("/api/report/docx/:id", requireAdmin, async (req, res) => {
  if (!buildDocx) {
    return res.status(501).json({ ok: false, error: "DOCX exporter not available on this build" });
  }
  const rec = REPORTS.get(req.params.id);
  if (!rec) return res.status(404).json({ ok: false, error: "Not found" });

  try {
    const out = await buildDocx(rec);
    if (Buffer.isBuffer(out)) {
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="report-${rec.id}.docx"`);
      return res.send(out);
    }
    if (out?.buffer && Buffer.isBuffer(out.buffer)) {
      res.setHeader("Content-Type", out.contentType || "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="${out.filename || `report-${rec.id}.docx`}"`);
      return res.send(out.buffer);
    }
    return res.status(500).json({ ok: false, error: "Unexpected DOCX exporter output" });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

// --- Start ---
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Admin configured: ${Boolean(ADMIN_KEY)}`);
  console.log(`Groq configured: ${Boolean(GROQ_API_KEY)}`);
});
