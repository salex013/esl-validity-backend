import express from "express";
import cors from "cors";

const app = express();

// --- basics ---
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// --- helpers ---
function getAdminKeyFromRequest(req) {
  // Express lowercases header names internally; these cover common variants
  return (
    req.get("x-admin-key") ||
    req.get("X-Admin-Key") ||
    req.headers["x-admin-key"] ||
    ""
  ).toString().trim();
}

function getExpectedAdminKey() {
  // IMPORTANT: must match what you set in Render Environment
  // Your screenshot shows ADMIN_KEY, so we use ADMIN_KEY.
  return (process.env.ADMIN_KEY || "").toString().trim();
}

function requireAdmin(req, res, next) {
  const expected = getExpectedAdminKey();
  if (!expected) {
    return res.status(500).json({
      ok: false,
      error: "ADMIN_KEY is not set on the server (Render Environment).",
    });
  }

  const provided = getAdminKeyFromRequest(req);
  if (!provided || provided !== expected) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  next();
}

// --- routes ---
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    name: "ESL Validity Tool Backend",
    timestamp: new Date().toISOString(),
    adminConfigured: Boolean(getExpectedAdminKey()),
    groqConfigured: Boolean((process.env.GROQ_API_KEY || "").trim()),
  });
});

app.get("/api/admin/ping", requireAdmin, (req, res) => {
  res.json({ ok: true, admin: true, timestamp: new Date().toISOString() });
});

// Optional: a protected endpoint example
app.post("/api/admin/echo", requireAdmin, (req, res) => {
  res.json({ ok: true, received: req.body });
});

// 404
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Route not found" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ ok: false, error: "Internal server error" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log("ADMIN_KEY set:", Boolean(getExpectedAdminKey()));
  console.log("GROQ_API_KEY set:", Boolean((process.env.GROQ_API_KEY || "").trim()));
});
