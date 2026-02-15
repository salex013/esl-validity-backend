// validity.js
// Provides a single entrypoint: runValidation(body, mode)
// - mode="groq" (default): uses Groq; falls back to lite if Groq fails
// - mode="lite": uses lite only (no API calls)

function normalizeInput(body = {}) {
  // Accept either "instructionsText" or "extractedText" (alias)
  const instructionsText = body.instructionsText || body.extractedText || "";
  const rubricText = body.rubricText || "";

  return {
    skill: body.skill || "",
    levelFramework: body.levelFramework || "CLB",
    level: body.level || "",
    purpose: body.purpose || "",
    instructionsText,
    rubricText,
  };
}

async function runValidation(rawBody, mode = "groq") {
  const body = normalizeInput(rawBody);

  const liteValidation = require("./validity-lite");
  const groqValidation = require("./validity-groq");

  if (mode === "lite") {
    const report = await liteValidation(body);
    // Ensure consistent metadata
    report.mode = "lite";
    return report;
  }

  try {
    const report = await groqValidation(body);
    report.mode = "groq";
    return report;
  } catch (err) {
    console.error("Groq validity failed, falling back to lite:", err.message);
    const report = await liteValidation(body);
    report.mode = "lite";
    report.fallbackReason = err.message;
    return report;
  }
}

module.exports = { runValidation };
