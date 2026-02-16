import express from "express";
import cors from "cors";

const app = express();

// -------------------- basics --------------------
app.use(cors()); // you can lock this down later to your Netlify domain
app.use(express.json({ limit: "4mb" }));

// -------------------- admin auth (header + env var) --------------------
function getAdminKeyFromRequest(req) {
  return (
    req.get("x-admin-key") ||
    req.get("X-Admin-Key") ||
    req.headers["x-admin-key"] ||
    ""
  )
    .toString()
    .trim();
}

function getExpectedAdminKey() {
  return (process.env.ADMIN_KEY || "").toString().trim();
}

function requireAdmin(req, res, next) {
  const expected = getExpectedAdminKey();
  if (!expected) {
    return res.status(500).json({
      ok: false,
      error: "ADMIN_KEY is not set on the server (Render Environment).",
    });
  }

  const provided = getAdminKeyFromRequest(req);
  if (!provided || provided !== expected) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  return next();
}

// -------------------- GROQ helper --------------------
function requireGroq(req, res, next) {
  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({
      ok: false,
      error: "GROQ_API_KEY is not set on the server (Render Environment).",
    });
  }
  return next();
}

async function groqChat({ system, user, temperature = 0.2, max_tokens = 2200 }) {
  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "llama-3.1-70b-versatile",
      temperature,
      max_tokens,
      messages: [
        system ? { role: "system", content: system } : null,
        { role: "user", content: user },
      ].filter(Boolean),
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Groq error ${resp.status}: ${txt}`);
  }

  const data = await resp.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

// -------------------- small utilities --------------------
function escapeHtml(str) {
  return (str ?? "")
    .toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function nl2br(str) {
  return escapeHtml(str).replaceAll("\n", "<br>");
}

function safeJsonParse(maybeJson) {
  try {
    return JSON.parse(maybeJson);
  } catch {
    return null;
  }
}

function buildRubricTableHTML(rubric) {
  // rubric format:
  // { title, criteria: [{name, outOf, levels:[{label, range, desc}...]}] }
  const title = rubric?.title ? escapeHtml(rubric.title) : "Rubric";
  const criteria = Array.isArray(rubric?.criteria) ? rubric.criteria : [];

  // Find max levels so columns align
  let maxLevels = 0;
  for (const c of criteria) maxLevels = Math.max(maxLevels, (c.levels || []).length);

  const headerCells = [
    `<th>Criteria</th>`,
    `<th>Out of</th>`,
    ...Array.from({ length: maxLevels }, (_, i) => `<th>Level ${i + 1}</th>`),
    `<th>Criterion Score</th>`,
  ].join("");

  const rows = criteria
    .map((c) => {
      const name = escapeHtml(c.name || "");
      const outOf = escapeHtml(c.outOf || "");
      const levels = Array.isArray(c.levels) ? c.levels : [];

      const levelTds = Array.from({ length: maxLevels }, (_, i) => {
        const L = levels[i];
        if (!L) return `<td></td>`;
        const label = escapeHtml(L.label || "");
        const range = escapeHtml(L.range || "");
        const desc = escapeHtml(L.desc || "");
        return `<td><div class="lvl">
          <div class="lvl-top"><strong>${label}</strong>${range ? ` <span class="range">(${range})</span>` : ""}</div>
          <div class="lvl-desc">${desc}</div>
        </div></td>`;
      }).join("");

      return `<tr>
        <td><strong>${name}</strong></td>
        <td>${outOf}</td>
        ${levelTds}
        <td class="scorebox">/ ${outOf || ""}</td>
      </tr>`;
    })
    .join("");

  return `
    <div class="rubric-wrap">
      <h2 class="rubric-title">${title}</h2>
      <div class="rubric-table-wrap">
        <table class="rubric-table">
          <thead><tr>${headerCells}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function buildInstructionsHTML(meta, instructionsText) {
  const skill = escapeHtml(meta?.skill || "");
  const framework = escapeHtml(meta?.framework || "");
  const level = escapeHtml(meta?.level || "");
  const purpose = escapeHtml(meta?.purpose || "");
  const assessmentType = escapeHtml(meta?.assessmentType || "");
  const title = `${skill} Assessment Instructions${level ? ` (${framework} ${level})` : ""}`;

  return `
    <div class="instructions-wrap">
      <h2 class="ins-title">${title}</h2>
      <div class="ins-meta">
        <div><strong>Skill:</strong> ${skill}</div>
        <div><strong>Framework:</strong> ${framework}</div संकेत
        <div><strong>Level:</strong> ${level}</div>
        <div><strong>Purpose:</strong> ${purpose}</div>
        <div><strong>Assessment type:</strong> ${assessmentType}</div>
      </div>
      <div class="ins-body">${nl2br(instructionsText)}</div>
    </div>
  `;
}

// -------------------- core routes --------------------
app.get("/", (req, res) => {
  res.json({
    ok: true,
    name: "ESL Validity Tool Backend",
    timestamp: new Date().toISOString(),
    adminConfigured: Boolean(getExpectedAdminKey()),
    groqConfigured: Boolean(process.env.GROQ_API_KEY),
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    adminConfigured: Boolean(getExpectedAdminKey()),
    groqConfigured: Boolean(process.env.GROQ_API_KEY),
  });
});

// ✅ This answers your question: "how do I find what my backend handlers are called?"
app.get("/api/routes", (req, res) => {
  const routes = [];
  app._router?.stack?.forEach((layer) => {
    if (layer?.route?.path) {
      const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase());
      routes.push({ path: layer.route.path, methods });
    }
  });
  res.json({ ok: true, routes });
});

app.get("/api/admin/ping", requireAdmin, (req, res) => {
  res.json({ ok: true, admin: true, timestamp: new Date().toISOString() });
});

// -------------------- AI: GENERATE (instructions + rubric) --------------------
app.post("/api/generate", requireGroq, async (req, res) => {
  try {
    const meta = req.body?.meta || {};
    const prompt = req.body?.prompt || meta?.description || "";

    const system = `
You are an expert ESL/EAP assessment designer.
Return ONLY valid JSON.
Your job:
1) Write clear student-facing assessment instructions (AODA-friendly, simple layout).
2) Create a professional rubric in a structured format suitable for a D2L-style table.
Rubric must include criteria, "outOf", and 4 performance levels with labels + %/score ranges + descriptors.
Do NOT include markdown fences. JSON only.
`;

    const user = `
META:
- skill: ${meta.skill || ""}
- framework: ${meta.framework || ""}
- level: ${meta.level || ""}
- purpose: ${meta.purpose || ""}
- assessmentType: ${meta.assessmentType || ""}
- learningOutcomes: ${meta.learningOutcomes || ""}

TASK PROMPT / DESCRIPTION:
${prompt}

Return JSON with this shape:
{
  "instructionsText": "....",
  "rubric": {
    "title": "...",
    "criteria": [
      {
        "name": "...",
        "outOf": "20 points",
        "levels": [
          {"label":"Exceeds expectations", "range":"80%+", "desc":"..."},
          {"label":"Meets expectations", "range":"70–79%", "desc":"..."},
          {"label":"Needs some improvement", "range":"60–69%", "desc":"..."},
          {"label":"Did not achieve", "range":"59% or lower", "desc":"..."}
        ]
      }
    ]
  }
}
`;

    const raw = await groqChat({ system, user, temperature: 0.2, max_tokens: 2200 });

    // Sometimes models include extra text — try to extract JSON
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    const slice = jsonStart >= 0 && jsonEnd >= 0 ? raw.slice(jsonStart, jsonEnd + 1) : raw;
    const parsed = safeJsonParse(slice);

    if (!parsed?.instructionsText || !parsed?.rubric) {
      return res.status(502).json({
        ok: false,
        error: "Model did not return valid JSON. Try again.",
        raw,
      });
    }

    const instructionsHtml = buildInstructionsHTML(meta, parsed.instructionsText);
    const rubricHtml = buildRubricTableHTML(parsed.rubric);

    res.json({
      ok: true,
      meta,
      instructionsText: parsed.instructionsText,
      rubric: parsed.rubric,
      instructionsHtml,
      rubricHtml,
    });
  } catch (err) {
    console.error("Generate error:", err);
    res.status(500).json({ ok: false, error: err.message || "Generate failed" });
  }
});

// -------------------- AI: ANALYZE (validity + washback + improved versions) --------------------
app.post("/api/analyze", requireGroq, async (req, res) => {
  try {
    const meta = req.body?.meta || {};
    const instructionsText = req.body?.instructionsText || "";
    const rubricText = req.body?.rubricText || "";
    const assessmentText = req.body?.assessmentText || "";

    const system = `
You are an assessment specialist (validity, reliability, practicality, fairness, washback).
Return ONLY valid JSON.
You must:
1) Analyze the provided assessment + rubric for: validity, reliability, fairness, practicality, washback, clarity, alignment.
2) Provide a clear, teacher-friendly report with bullet points and actionable fixes.
3) Provide improved "better" versions of instructions and rubric (structured rubric format).
JSON only; no markdown fences.
`;

    const user = `
META:
- skill: ${meta.skill || ""}
- framework: ${meta.framework || ""}
- level: ${meta.level || ""}
- purpose: ${meta.purpose || ""}
- assessmentType: ${meta.assessmentType || ""}
- learningOutcomes: ${meta.learningOutcomes || ""}

ASSESSMENT TEXT:
${assessmentText}

INSTRUCTIONS TEXT:
${instructionsText}

RUBRIC TEXT:
${rubricText}

Return JSON:
{
  "scores": {"validity": 0-10, "reliability":0-10, "fairness":0-10, "practicality":0-10, "washback":0-10, "clarity":0-10, "alignment":0-10},
  "strengths": ["..."],
  "risks": ["..."],
  "fixes": [{"issue":"...", "whyItMatters":"...", "quickFix":"..."}],
  "improvedInstructionsText":"...",
  "improvedRubric": { "title":"...", "criteria":[ ...same structure as /api/generate... ] }
}
`;

    const raw = await groqChat({ system, user, temperature: 0.2, max_tokens: 2600 });

    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    const slice = jsonStart >= 0 && jsonEnd >= 0 ? raw.slice(jsonStart, jsonEnd + 1) : raw;
    const parsed = safeJsonParse(slice);

    if (!parsed?.scores || !parsed?.improvedRubric || !parsed?.improvedInstructionsText) {
      return res.status(502).json({
        ok: false,
        error: "Model did not return valid JSON. Try again.",
        raw,
      });
    }

    const improvedInstructionsHtml = buildInstructionsHTML(meta, parsed.improvedInstructionsText);
    const improvedRubricHtml = buildRubricTableHTML(parsed.improvedRubric);

    // Simple teacher report HTML (frontend can style it)
    const reportHtml = `
      <div class="report">
        <h2>Validity & Washback Report</h2>
        <div class="scores">
          ${Object.entries(parsed.scores)
            .map(([k, v]) => `<div class="pill"><strong>${escapeHtml(k)}</strong>: ${escapeHtml(v)}</div>`)
            .join("")}
        </div>

        <h3>Strengths</h3>
        <ul>${(parsed.strengths || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>

        <h3>Risks</h3>
        <ul>${(parsed.risks || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>

        <h3>Fixes (actionable)</h3>
        <ol>
          ${(parsed.fixes || [])
            .map(
              (f) => `<li>
                <div><strong>Issue:</strong> ${escapeHtml(f.issue || "")}</div>
                <div><strong>Why it matters:</strong> ${escapeHtml(f.whyItMatters || "")}</div>
                <div><strong>Quick fix:</strong> ${escapeHtml(f.quickFix || "")}</div>
              </li>`
            )
            .join("")}
        </ol>
      </div>
    `;

    res.json({
      ok: true,
      meta,
      report: parsed,
      reportHtml,
      improvedInstructionsHtml,
      improvedRubricHtml,
    });
  } catch (err) {
    console.error("Analyze error:", err);
    res.status(500).json({ ok: false, error: err.message || "Analyze failed" });
  }
});

// -------------------- 404 catch --------------------
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Route not found" });
});

// -------------------- error handler --------------------
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ ok: false, error: "Internal server error" });
});

// -------------------- start --------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log("ADMIN_KEY set:", Boolean(process.env.ADMIN_KEY));
  console.log("GROQ_API_KEY set:", Boolean(process.env.GROQ_API_KEY));
});
