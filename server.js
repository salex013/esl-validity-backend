import express from "express";
import cors from "cors";

const app = express();

// --- basics ---
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// --- admin auth (header + env var) ---
function getAdminKeyFromRequest(req) {
  // Express lowercases header names internally; these cover common variants
  return (
    req.get("x-admin-key") ||
    req.get("X-Admin-Key") ||
    req.headers["x-admin-key"] ||
    ""
  )
    .toString()
    .trim();
}

function getExpectedAdminKey() {
  // IMPORTANT: must match the Render Environment Variable name
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

  return next();
}

// --- routes ---
app.get("/", (req, res) => {
  res.json({
    ok: true,
    name: "ESL Validity Tool Backend",
    timestamp: new Date().toISOString(),
    adminConfigured: Boolean(getExpectedAdminKey()),
    groqConfigured: Boolean(process.env.GROQ_API_KEY),
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    adminConfigured: Boolean(getExpectedAdminKey()),
    groqConfigured: Boolean(process.env.GROQ_API_KEY),
  });
});

app.get("/api/admin/ping", requireAdmin, (req, res) => {
  res.json({ ok: true, admin: true, timestamp: new Date().toISOString() });
});

// --- 404 catch ---
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Route not found" });
});

// --- error handler ---
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ ok: false, error: "Internal server error" });
});

// --- start ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log("ADMIN_KEY set:", Boolean(process.env.ADMIN_KEY));
  console.log("GROQ_API_KEY set:", Boolean(process.env.GROQ_API_KEY));
});
