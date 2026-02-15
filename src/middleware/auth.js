// src/middleware/auth.js
const crypto = require("crypto");

function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ""), "utf8");
  const bb = Buffer.from(String(b || ""), "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function requireAdmin(req, res, next) {
  const expected = (process.env.ADMIN_KEY || "").trim();

  // If ADMIN_KEY isn't set on Render, return a clear error (not Unauthorized)
  if (!expected) {
    return res.status(500).json({
      ok: false,
      error: "ADMIN_KEY is not set on the server (Render env var missing).",
    });
  }

  // Accept a couple common header spellings + optional query param for debugging
  const provided = (
    req.get("x-admin-key") ||
    req.get("X-Admin-Key") ||
    req.get("x-admin") ||
    req.query.adminKey ||
    ""
  ).trim();

  if (safeEqual(provided, expected)) return next();

  return res.status(401).json({ ok: false, error: "Unauthorized" });
}

module.exports = { requireAdmin };
