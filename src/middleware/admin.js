// src/middleware/admin.js

module.exports = function admin(req, res, next) {
  const provided =
    (req.header("x-admin-key") || req.header("X-Admin-Key") || "").trim();

  const expected = (process.env.ADMIN_KEY || "").trim();

  if (!expected) {
    return res.status(500).json({
      ok: false,
      error: "Admin key not configured (set ADMIN_KEY in environment)",
    });
  }

  if (!provided || provided !== expected) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  next();
};
