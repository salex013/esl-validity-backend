const express = require("express");
const cors = require("cors");

const validityRouter = require("./validity"); // expects POST "/"
const autofixRouter = require("./autofix");   // expects POST "/"

const app = express();

app.use(cors());
app.use(express.json({ limit: "5mb" }));

// Health (Render check + human check)
app.get("/", (req, res) => res.send("OK"));
app.get("/health", (req, res) => res.json({ ok: true }));

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    name: "ESL Validity Tool Backend",
    timestamp: new Date().toISOString(),
    groqConfigured: !!process.env.GROQ_API_KEY,
    liteAvailable: true,
  });
});

// Primary routes
app.use("/api/validity", validityRouter);
app.use("/api/autofix", autofixRouter);

// ✅ Aliases (this is the important fix)
// These mount the SAME routers at new paths, so POST /api/report works.
app.use("/api/report", validityRouter);
app.use("/api/fix", autofixRouter);

// Debug helper: see what routes exist
app.get("/api/routes", (req, res) => {
  res.json({
    routes: [
      "GET  /api/health",
      "GET  /api/routes",
      "POST /api/validity",
      "POST /api/report  (alias of /api/validity)",
      "POST /api/autofix",
      "POST /api/fix     (alias of /api/autofix)",
    ],
  });
});

// Optional: request stats (if you added it before, keep it here)
const stats = {
  totalInMemory: 0,
  sampleWindow: 50,
  lastStatuses: [],
  byStatus: {},
  byPath: {},
};

app.use((req, res, next) => {
  res.on("finish", () => {
    const s = res.statusCode;
    const p = req.path;
    stats.totalInMemory += 1;
    stats.lastStatuses.push(s);
    if (stats.lastStatuses.length > stats.sampleWindow) stats.lastStatuses.shift();
    stats.byStatus[s] = (stats.byStatus[s] || 0) + 1;
    stats.byPath[p] = (stats.byPath[p] || 0) + 1;
  });
  next();
});

app.get("/api/stats", (req, res) => {
  const avgMsLast50 = 0; // placeholder if you want to compute timing later
  res.json({
    ok: true,
    totalInMemory: stats.totalInMemory,
    sampleWindow: stats.sampleWindow,
    avgMsLast50,
    byStatus: stats.byStatus,
    byPath: stats.byPath,
    groqConfigured: !!process.env.GROQ_API_KEY,
    liteEnabled: true,
  });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server running on port", PORT));
