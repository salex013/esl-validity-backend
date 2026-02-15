const express = require("express");
const cors = require("cors");

// These files MUST export an express.Router()
const validityRouter = require("./validity");
const autofixRouter = require("./autofix");

const app = express();

app.use(cors());
app.use(express.json({ limit: "5mb" }));

// Health
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

// Aliases (same handlers, different paths)
app.use("/api/report", validityRouter); // POST /api/report
app.use("/api/fix", autofixRouter);     // POST /api/fix

// Debug helper
app.get("/api/routes", (req, res) => {
  res.json({
    routes: [
      "GET /api/health",
      "GET /api/routes",
      "POST /api/validity",
      "POST /api/report (alias of /api/validity)",
      "POST /api/autofix",
      "POST /api/fix (alias of /api/autofix)",
      "GET /api/report/history (admin)",
    ],
  });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server running on port", PORT));
