function requireAdmin(req, res, next) {
  const expected = process.env.ADMIN_KEY;
  if (!expected) {
    return res.status(500).json({
      ok: false,
      error: "ADMIN_KEY not set on server"
    });
  }

  const headerKey = req.headers["x-admin-key"];
  const queryKey = req.query.adminKey;

  const provided = headerKey || queryKey;
  if (!provided || provided !== expected) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  next();
}

module.exports = { requireAdmin };
