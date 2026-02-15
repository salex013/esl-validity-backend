// server.js (root)
const express = require("express");
const cors = require("cors");

const { runValidity } = require("./validity");
const { runAutofix } = require("./autofix");

const app = express();

// ---- middleware ----
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ---- small helpers ----
function requireAdmin(req, res, next) {
  const expected = process.env.ADMIN_KEY || "";
  const provided = req.header("x-admin-key") || "";
  if (!expected) {
    return res.status(500).json({
      ok: false,
      error: "ADMIN_KEY is not set on the server.",
    });
  }
  if (provided !== expected) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  next();
}

// ---- in-memory history (simple + free) ----
const HISTORY = [];
function addHistory(entry) {
  HISTORY.push({ ...entry, at: new Date().toISOString() });
  // keep last 200 so it never grows forever
  if (HISTORY.length > 200) HISTORY.shift();
}

// ---- routes ----
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    name: "ESL Validity Tool Backend",
    timestamp: new Date().toISOString(),
    groqConfigured: !!process.env.GROQ_API_KEY,
    liteAvailable: true,
  });
});

app.get("/api/routes", (req, res) => {
  res.json({
    routes: [
      "GET  /api/health",
      "GET  /api/routes",
      "POST /api/validity",
      "POST /api/report (alias of /api/validity)",
      "POST /api/autofix",
      "POST /api/fix (alias of /api/autofix)",
      "GET  /api/history (admin)",
    ],
  });
});

// main: validity
app.post("/api/validity", async (req, res) => {
  try {
    const report = await runValidity(req.body, {
      mode: req.query.mode, // "groq" | "lite" | undefined
    });

    addHistory({
      type: "validity",
      mode: report?.mode || "unknown",
      inputMeta: {
        skill: req.body?.skill,
        levelFramework: req.body?.levelFramework,
        level: req.body?.level,
        purpose: req.body?.purpose,
      },
      ok: true,
    });

    res.json({ ok: true, report });
  } catch (err) {
    addHistory({ type: "validity", ok: false, error: String(err?.message || err) });
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

// alias
app.post("/api/report", async (req, res) => {
  // same handler as /api/validity
  req.url = "/api/validity" + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "");
  return app._router.handle(req, res);
});

// main: autofix
app.post("/api/autofix", async (req, res) => {
  try {
    const result = await runAutofix(req.body, {
      mode: req.query.mode,
    });

    addHistory({
      type: "autofix",
      mode: result?.mode || "unknown",
      inputMeta: { hasText: !!req.body?.text },
      ok: true,
    });

    res.json({ ok: true, result });
  } catch (err) {
    addHistory({ type: "autofix", ok: false, error: String(err?.message || err) });
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

// alias
app.post("/api/fix", async (req, res) => {
  req.url = "/api/autofix" + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "");
  return app._router.handle(req, res);
});

// admin: history
app.get("/api/history", requireAdmin, (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50)));
  res.json({ ok: true, items: HISTORY.slice(-limit).reverse() });
});

// ---- start ----
const port = process.env.PORT || 10000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
