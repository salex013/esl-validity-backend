// src/server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

// ---- middleware ----
app.use(cors());
app.use(express.json({ limit: "5mb" }));

// ---- ADMIN AUTH (INLINE: no external file needed) ----
function requireAdmin(req, res, next) {
  const expected = process.env.ADMIN_KEY;

  if (!expected) {
    return res.status(500).json({
      ok: false,
      error: "ADMIN_KEY not configured on server",
    });
  }

  const got =
    req.get("x-admin-key") ||
    req.get("X-Admin-Key") ||
    (req.query && req.query.admin_key) ||
    "";

  if (got !== expected) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  next();
}

// ---- health ----
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    name: "ESL Validity Tool Backend",
    timestamp: new Date().toISOString(),
    adminConfigured: !!process.env.ADMIN_KEY,
    groqConfigured: !!process.env.GROQ_API_KEY,
  });
});

// ---- example admin route (keep/remove as you like) ----
app.get("/api/admin/ping", requireAdmin, (req, res) => {
  res.json({ ok: true, admin: true });
});

// ---- 404 ----
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Not found" });
});

// ---- start ----
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
