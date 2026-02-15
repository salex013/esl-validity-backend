require("dotenv").config();
const express = require("express");
const cors = require("cors");

const { runValidity } = require("./validity");
const { runAutofix } = require("./autofix");
const { requireAdmin } = require("./src/middleware/auth");

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// In-memory history store
const history = [];

/* ===========================
   HEALTH CHECK
=========================== */
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    name: "ESL Validity Tool Backend",
    timestamp: new Date().toISOString(),
    groqConfigured: !!process.env.GROQ_API_KEY,
    liteAvailable: true
  });
});

/* ===========================
   REPORT (Groq or Lite)
=========================== */
app.post("/api/report", async (req, res) => {
  try {
    const mode = req.query.mode || "groq";
    const payload = req.body;

    let result;

    if (mode === "lite") {
      result = await runValidity(payload, { mode: "lite" });
    } else {
      result = await runValidity(payload, { mode: "groq" });
    }

    history.push({
      type: "report",
      mode,
      input: payload,
      result,
      timestamp: new Date().toISOString()
    });

    res.json({ ok: true, report: result });

  } catch (error) {
    console.error("REPORT ERROR:", error);
    res.status(500).json({
      ok: false,
      error: error.message || "Report failed"
    });
  }
});

/* ===========================
   AUTOFIX
=========================== */
app.post("/api/autofix", async (req, res) => {
  try {
    const payload = req.body;
    const result = await runAutofix(payload);

    history.push({
      type: "autofix",
      input: payload,
      result,
      timestamp: new Date().toISOString()
    });

    res.json({ ok: true, result });

  } catch (error) {
    console.error("AUTOFIX ERROR:", error);
    res.status(500).json({
      ok: false,
      error: error.message || "Autofix failed"
    });
  }
});

/* ===========================
   HISTORY (Admin Protected)
=========================== */
app.get("/api/history", requireAdmin, (req, res) => {
  res.json({
    ok: true,
    count: history.length,
    history
  });
});

/* ===========================
   START SERVER
=========================== */
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log("========================================");
  console.log(`Server running on port ${PORT}`);
  console.log("========================================");
});
