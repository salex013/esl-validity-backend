// server.js
"use strict";

const express = require("express");
const cors = require("cors");

const autofixRouter = require("./autofix");

const app = express();

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: "2mb" })); // bump if you send large payloads

// --- Health check ---
app.get("/api/health", (req, res) => {
  res.status(200).json({ ok: true, name: "ESL Validity Tool Backend" });
});

// --- Autofix route ---
app.use("/api/autofix", autofixRouter);

// --- 404 fallback ---
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Not found" });
});

// --- Error handler ---
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ ok: false, error: "Internal server error" });
});

// --- Start ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
