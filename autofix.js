// autofix.js (root)

async function groqChat({ system, user, temperature = 0.2 }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set.");

  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      temperature,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Groq error ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  return data?.choices?.[0]?.message?.content || "";
}

function liteAutofix(input) {
  const text = (input?.text || "").trim();
  if (!text) {
    return {
      mode: "lite",
      summary: "No text provided.",
      improved: "",
      changes: ["Provide `text` to autofix."],
    };
  }

  // super-light cleanup (safe + deterministic)
  const improved = text
    .replace(/\s+/g, " ")
    .replace(/\s+\./g, ".")
    .replace(/\s+,/g, ",")
    .trim();

  const changes = [];
  if (improved !== text) changes.push("Normalized spacing and punctuation.");
  else changes.push("No changes needed.");

  return {
    mode: "lite",
    summary: "Basic formatting cleanup (lite mode).",
    improved,
    changes,
  };
}

async function runAutofix(input, opts = {}) {
  const requestedMode = (opts.mode || "").toLowerCase(); // "groq" | "lite" | ""
  const forceLite = requestedMode === "lite";
  const forceGroq = requestedMode === "groq";

  if (forceLite) return liteAutofix(input);

  const hasGroq = !!process.env.GROQ_API_KEY;

  if (!hasGroq && forceGroq) {
    throw new Error("mode=groq requested but GROQ_API_KEY is not set.");
  }

  if (!hasGroq) return liteAutofix(input);

  const system =
    "You are an expert ESL editor. Return ONLY valid JSON. Be concise. Make changes that improve clarity, level-appropriateness, and rubric measurability.";

  const user = `
Return JSON:
{
  "mode": "groq",
  "model": "<string>",
  "summary": "<short>",
  "improved": "<improved version of the text>",
  "changes": ["..."]
}

Input:
${JSON.stringify(input, null, 2)}
`;

  try {
    const raw = await groqChat({ system, user, temperature: 0.2 });

    const jsonText = raw.trim().startsWith("{")
      ? raw.trim()
      : raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);

    const parsed = JSON.parse(jsonText);

    return {
      mode: "groq",
      model: "llama-3.1-8b-instant",
      ...parsed,
    };
  } catch (err) {
    if (forceGroq) throw err;
    return liteAutofix(input);
  }
}

module.exports = { runAutofix };
