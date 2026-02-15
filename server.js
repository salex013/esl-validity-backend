const express = require("express");
const cors = require("cors");

const runValidity = require("./validity");
const runAutofix = require("./autofix");

const app = express();

app.use(cors());
app.use(express.json({ limit: "5mb" }));

// Root
app.get("/", (req, res) => res.send("OK"));

// Health
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    name: "ESL Validity Tool Backend",
    timestamp: new Date().toISOString(),
  });
});

// 🔹 VALIDITY
app.post("/api/validity", async (req, res) => {
  try {
    const result = await runValidity(req.body);
    res.json({ ok: true, report: result });
  } catch (err) {
    console.error("VALIDITY ERROR:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Alias
app.post("/api/report", async (req, res) => {
  try {
    const result = await runValidity(req.body);
    res.json({ ok: true, report: result });
  } catch (err) {
    console.error("REPORT ERROR:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 🔹 AUTOFIX
app.post("/api/autofix", async (req, res) => {
  try {
    const result = await runAutofix(req.body);
    res.json({ ok: true, fix: result });
  } catch (err) {
    console.error("AUTOFIX ERROR:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Alias
app.post("/api/fix", async (req, res) => {
  try {
    const result = await runAutofix(req.body);
    res.json({ ok: true, fix: result });
  } catch (err) {
    console.error("FIX ERROR:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Debug
app.get("/api/routes", (req, res) => {
  res.json({
    routes: [
      "GET /api/health",
      "POST /api/validity",
      "POST /api/report",
      "POST /api/autofix",
      "POST /api/fix"
    ]
  });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server running on port", PORT));
