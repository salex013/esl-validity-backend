import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { requireAdmin } from "./middleware/admin.js";

// Load env (works locally; Render provides env automatically)
dotenv.config();

const app = express();

// ---------- Basic Middleware ----------
app.use(cors());
app.use(express.json());

// ---------- Health Check ----------
app.get("/", (req, res) => {
  res.json({
    ok: true,
    name: "ESL Validity Tool Backend",
    timestamp: new Date().toISOString(),
    adminConfigured: Boolean(process.env.ADMIN_KEY),
    groqConfigured: Boolean(process.env.GROQ_API_KEY),
  });
});

// ---------- Admin Ping (Protected) ----------
app.get("/api/admin/ping", requireAdmin, (req, res) => {
  res.json({
    ok: true,
    message: "Admin authenticated",
  });
});

// ---------- Example Protected Route ----------
app.post("/api/admin/test", requireAdmin, (req, res) => {
  res.json({
    ok: true,
    received: req.body,
  });
});

// ---------- 404 Catch ----------
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Route not found",
  });
});

// ---------- Error Handler ----------
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({
    ok: false,
    error: "Internal server error",
  });
});

// ---------- Start Server ----------
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log("ADMIN_KEY set:", Boolean(process.env.ADMIN_KEY));
});
