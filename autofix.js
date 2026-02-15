// autofix.js
// Provides a single entrypoint: runAutofix(body, mode)
// - mode="groq" (default): uses Groq; falls back to lite if Groq fails
// - mode="lite": uses lite only

function normalizeInput(body = {}) {
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

async function runAutofix(rawBody, mode = "groq") {
  const body = normalizeInput(rawBody);

  const liteAutofix = require("./autofix-lite");
  const groqAutofix = require("./autofix-groq");

  if (mode === "lite") {
    const result = await liteAutofix(body);
    return {
      mode: "lite",
      ...result,
    };
  }

  try {
    const result = await groqAutofix(body);
    return {
      mode: "groq",
      ...result,
    };
  } catch (err) {
    console.error("Groq autofix failed, falling back to lite:", err.message);
    const result = await liteAutofix(body);
    return {
      mode: "lite",
      fallbackReason: err.message,
      ...result,
    };
  }
}

module.exports = { runAutofix };
