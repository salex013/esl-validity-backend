// src/middleware/admin.js
export function requireAdmin(req, res, next) {
  const expected = process.env.ADMIN_KEY;

  // If you forgot to set it on Render, fail loudly (this is a server misconfig)
  if (!expected) {
    return res.status(500).json({
      ok: false,
      error: "ADMIN_KEY not configured on server",
    });
  }

  const got =
    req.get("x-admin-key") ||
    req.get("X-Admin-Key") ||
    ""; // header names are case-insensitive, but this is extra-safe

  if (got !== expected) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  next();
}
