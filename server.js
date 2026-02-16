// src/server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { requireAdmin } from "./middleware/admin.js";

dotenv.config();

const app = express();

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// --- Health ---
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    name: "ESL Validity Tool Backend",
    timestamp: new Date().toISOString(),
    adminConfigured: !!process.env.ADMIN_KEY,
    groqConfigured: !!process.env.GROQ_API_KEY, // if you use Groq
  });
});

// --- Example admin-protected endpoint (adjust path to your real one) ---
app.get("/api/history", requireAdmin, async (req, res) => {
  // TODO: replace with your real history storage logic
  // For now it returns an empty array so the route works.
  res.json({
    ok: true,
    items: [],
  });
});

// --- 404 ---
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Not found" });
});

// --- Start ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
