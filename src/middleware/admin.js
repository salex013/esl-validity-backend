// src/middleware/admin.js

function getAdminKeyFromRequest(req) {
  // Option A: x-admin-key header
  const xKey = req.header("x-admin-key");
  if (xKey && String(xKey).trim()) return String(xKey).trim();

  // Option B: Authorization: Bearer <token>
  const auth = req.header("authorization");
  if (auth && /^Bearer\s+/i.test(auth)) {
    return auth.replace(/^Bearer\s+/i, "").trim();
  }

  return "";
}

function adminOnly(req, res, next) {
  const expected = (process.env.ADMIN_KEY || "").trim();
  if (!expected) {
    return res.status(500).json({
      ok: false,
      error: "Admin key not configured. Set ADMIN_KEY in environment variables.",
    });
  }

  const provided = getAdminKeyFromRequest(req);
  if (!provided || provided !== expected) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  next();
}

module.exports = { adminOnly };
