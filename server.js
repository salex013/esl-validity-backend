const express = require("express");
const cors = require("cors");

const validityRouter = require("./validity");
const autofixRouter = require("./autofix");

const { requireAdmin } = require("./src/middleware/auth");
const { storage } = require("./src/storage");
const { makePdfBuffer } = require("./src/export/pdf");
const { makeDocxBuffer } = require("./src/export/docx");

const app = express();

app.use(cors());
app.use(express.json({ limit: "5mb" }));

// ---------- health ----------
app.get("/", (req, res) => res.send("OK"));

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    name: "ESL Validity Tool Backend",
    timestamp: new Date().toISOString(),
    groqConfigured: !!process.env.GROQ_API_KEY,
    liteAvailable: true,
    persistence: storage.mode()
  });
});

// ---------- primary routes ----------
app.use("/api/validity", validityRouter);
app.use("/api/report", validityRouter); // alias
app.use("/api/autofix", autofixRouter);
app.use("/api/fix", autofixRouter); // alias

// ---------- routes list ----------
app.get("/api/routes", (req, res) => {
  res.json({
    routes: [
      "GET  /api/health",
      "GET  /api/routes",
      "GET  /api/stats",
      "POST /api/validity",
      "POST /api/report (alias)",
      "POST /api/autofix",
      "POST /api/fix (alias)",
      "GET  /api/history (admin)",
      "GET  /api/history/:id (admin)",
      "GET  /api/report/pdf/:id (admin)",
      "GET  /api/report/docx/:id (admin)"
    ]
  });
});

// ---------- simple stats ----------
let stats = { total: 0, byPath: {}, byStatus: {} };

app.use((req, res, next) => {
  res.on("finish", () => {
    stats.total++;
    stats.byPath[req.path] = (stats.byPath[req.path] || 0) + 1;
    stats.byStatus[res.statusCode] = (stats.byStatus[res.statusCode] || 0) + 1;
  });
  next();
});

app.get("/api/stats", (req, res) => {
  res.json({
    ok: true,
    total: stats.total,
    byPath: stats.byPath,
    byStatus: stats.byStatus
  });
});

// ---------- teacher/admin endpoints ----------
app.get("/api/history", requireAdmin, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
  const items = await storage.list(limit);
  res.json({ ok: true, items });
});

app.get("/api/history/:id", requireAdmin, async (req, res) => {
  const item = await storage.get(req.params.id);
  if (!item) return res.status(404).json({ ok: false, error: "Not found" });
  res.json({ ok: true, item });
});

app.get("/api/report/pdf/:id", requireAdmin, async (req, res) => {
  const item = await storage.get(req.params.id);
  if (!item) return res.status(404).json({ ok: false, error: "Not found" });

  const buf = await makePdfBuffer(item);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="validity-report-${item.id}.pdf"`
  );
  res.send(buf);
});

app.get("/api/report/docx/:id", requireAdmin, async (req, res) => {
  const item = await storage.get(req.params.id);
  if (!item) return res.status(404).json({ ok: false, error: "Not found" });

  const buf = await makeDocxBuffer(item);
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="validity-report-${item.id}.docx"`
  );
  res.send(buf);
});

// ----------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server running on port", PORT));
