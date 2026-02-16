// src/middleware/admin.js
import crypto from "crypto";

function normalize(v = "") {
  // Trim whitespace/newlines AND strip wrapping quotes people paste by accident
  return String(v).trim().replace(/^['"]|['"]$/g, "");
}

function sha(v) {
  return crypto.createHash("sha256").update(v).digest("hex");
}

export function requireAdmin(req, res, next) {
  const expectedRaw = process.env.ADMIN_KEY || "";
  const expected = normalize(expectedRaw);

  // accept multiple ways of sending the key
  const headerKey =
    req.get("x-admin-key") ||
    req.get("X-Admin-Key") ||
    req.get("x-admin") ||
    req.get("X-Admin") ||
    "";

  // also allow: Authorization: Bearer <key>
  const auth = req.get("authorization") || req.get("Authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7)
    : "";

  const provided = normalize(headerKey || bearer);

  // If not configured, be explicit
  if (!expected) {
    return res.status(500).json({
      ok: false,
      error: "Admin key not configured (set ADMIN_KEY on the server)",
    });
  }

  // Compare safely (avoid subtle timing attacks)
  const ok =
    provided.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));

  if (!ok) {
    // Safe diagnostics (NO secret revealed)
    return res.status(401).json({
      ok: false,
      error: "Unauthorized",
      debug: {
        sawHeader: Boolean(headerKey),
        sawBearer: Boolean(bearer),
        providedLen: provided.length,
        expectedLen: expected.length,
        providedSha8: provided ? sha(provided).slice(0, 8) : null,
        expectedSha8: expected ? sha(expected).slice(0, 8) : null,
      },
    });
  }

  next();
}
