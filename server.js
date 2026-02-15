const express = require("express");
const cors = require("cors");

const validityRouter = require("./validity");
const autofixRouter = require("./autofix");

const app = express();

app.use(cors());
app.use(express.json({ limit: "5mb" }));

// -----------------------------
// Health
// -----------------------------
app.get("/", (req, res) => res.send("OK"));

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    name: "ESL Validity Tool Backend",
    timestamp: new Date().toISOString(),
    groqConfigured: !!process.env.GROQ_API_KEY,
    liteAvailable: true
  });
});

// -----------------------------
// Main Routes
// -----------------------------
app.use("/api/validity", validityRouter);
app.use("/api/report", validityRouter);

app.use("/api/autofix", autofixRouter);
app.use("/api/fix", autofixRouter);

// -----------------------------
// Debug Routes
// -----------------------------
app.get("/api/routes", (req, res) => {
  res.json({
    routes: [
      "GET  /api/health",
      "GET  /api/routes",
      "POST /api/validity",
      "POST /api/report",
      "POST /api/autofix",
      "POST /api/fix"
    ]
  });
});

// -----------------------------
// Simple Stats Tracker
// -----------------------------
let stats = {
  totalRequests: 0,
  byPath: {},
  byStatus: {}
};

app.use((req, res, next) => {
  res.on("finish", () => {
    stats.totalRequests++;
    stats.byPath[req.path] = (stats.byPath[req.path] || 0) + 1;
    stats.byStatus[res.statusCode] =
      (stats.byStatus[res.statusCode] || 0) + 1;
  });
  next();
});

app.get("/api/stats", (req, res) => {
  res.json({
    ok: true,
    totalRequests: stats.totalRequests,
    byPath: stats.byPath,
    byStatus: stats.byStatus,
    groqConfigured: !!process.env.GROQ_API_KEY
  });
});

// -----------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server running on port", PORT));
