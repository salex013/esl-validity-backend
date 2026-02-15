const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const validityRouter = require("./validity"); // must export an express.Router()
const autofixRouter = require("./autofix");   // must export an express.Router()

const fs = require("fs");
const path = require("path");

const app = express();

/**
 * ===== CONFIG =====
 * Optional: persist logs (JSON Lines) if you have a Render Disk.
 * - Set LOG_FILE_PATH to something like: /var/data/requests.jsonl
 */
const LOG_FILE_PATH = process.env.LOG_FILE_PATH || ""; // leave blank for in-memory only
const MAX_LOGS_IN_MEMORY = Number(process.env.MAX_LOGS_IN_MEMORY || 500);

/**
 * ===== BASIC MIDDLEWARE =====
 */
app.use(cors());
app.use(express.json({ limit: "5mb" }));

/**
 * ===== RATE LIMITING =====
 * Defaults: 60 req / 15 minutes per IP
 * Tune if needed via env vars:
 * - RATE_LIMIT_WINDOW_MS (default 900000)
 * - RATE_LIMIT_MAX (default 60)
 */
const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.RATE_LIMIT_MAX || 60),
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

/**
 * ===== SIMPLE REQUEST LOGGING =====
 */
const requestLogs = []; // in-memory ring buffer

function safeAppendLog(lineObj) {
  // in-memory ring buffer
  requestLogs.push(lineObj);
  if (requestLogs.length > MAX_LOGS_IN_MEMORY) requestLogs.shift();

  // optional file append (JSONL)
  if (!LOG_FILE_PATH) return;
  try {
    const dir = path.dirname(LOG_FILE_PATH);
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(LOG_FILE_PATH, JSON.stringify(lineObj) + "\n", "utf8");
  } catch (e) {
    // do not crash service if logging fails
    console.warn("Log append failed:", e.message);
  }
}

app.use((req, res, next) => {
  const start = Date.now();
  const requestId = Math.random().toString(36).slice(2, 10);
  req.requestId = requestId;

  res.on("finish", () => {
    const ms = Date.now() - start;
    const mode = (req.query && req.query.mode) || (req.body && req.body.mode) || "auto";

    safeAppendLog({
      ts: new Date().toISOString(),
      requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      ms,
      ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
      mode,
    });
  });

  next();
});

/**
 * ===== HEALTH ROUTES =====
 */
app.get("/", (req, res) => res.send("OK"));
app.get("/health", (req, res) => res.json({ ok: true }));
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    name: "ESL Validity Tool Backend",
    timestamp: new Date().toISOString(),
    groqConfigured: Boolean(process.env.GROQ_API_KEY),
    liteAvailable: true
  });
});

/**
 * ===== PRIMARY ROUTERS =====
 */
app.use("/api/validity", validityRouter);
app.use("/api/autofix", autofixRouter);

/**
 * ===== ALIASES (for your older frontend names) =====
 * These are real POST endpoints, not browser GET endpoints.
 * /api/report -> /api/validity
 * /api/fix    -> /api/autofix
 */
app.post("/api/report", (req, res, next) => {
  // allow either extractedText OR instructionsText as "the text to analyze"
  if (!req.body.extractedText && req.body.instructionsText) {
    req.body.extractedText = req.body.instructionsText;
  }
  return validityRouter(req, res, next);
});

app.post("/api/fix", (req, res, next) => {
  if (!req.body.extractedText && req.body.instructionsText) {
    req.body.extractedText = req.body.instructionsText;
  }
  return autofixRouter(req, res, next);
});

/**
 * ===== DASHBOARD / ADMIN ENDPOINTS =====
 * These are “teacher dashboard” style stats you can call from your frontend.
 */
app.get("/api/routes", (req, res) => {
  res.json({
    routes: [
      "GET /api/health",
      "GET /api/routes",
      "GET /api/stats",
      "GET /api/logs (in-memory sample)",
      "POST /api/validity",
      "POST /api/report (alias of /api/validity)",
      "POST /api/autofix",
      "POST /api/fix (alias of /api/autofix)"
    ]
  });
});

app.get("/api/stats", (req, res) => {
  const total = requestLogs.length;
  const last50 = requestLogs.slice(-50);
  const avgMs =
    last50.length ? Math.round(last50.reduce((a, b) => a + (b.ms || 0), 0) / last50.length) : 0;

  const byStatus = {};
  const byPath = {};
  const byMode = {};

  for (const r of last50) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    const p = (r.path || "").split("?")[0];
    byPath[p] = (byPath[p] || 0) + 1;
    byMode[r.mode] = (byMode[r.mode] || 0) + 1;
  }

  res.json({
    ok: true,
    totalInMemory: total,
    sampleWindow: last50.length,
    avgMsLast50: avgMs,
    byStatus,
    byPath,
    byMode,
    groqConfigured: Boolean(process.env.GROQ_API_KEY),
    logFileEnabled: Boolean(LOG_FILE_PATH)
  });
});

app.get("/api/logs", (req, res) => {
  // returns last N logs from memory (useful for debugging)
  const n = Number(req.query.n || 50);
  res.json({
    ok: true,
    logs: requestLogs.slice(-Math.min(n, MAX_LOGS_IN_MEMORY))
  });
});

/**
 * ===== START =====
 */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server running on port", PORT));
