import express from "express";
import cors from "cors";

// --------------------
// App + middleware
// --------------------
const app = express();

app.use(
  cors({
    origin: "*", // you can lock this down later to your Netlify domain
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-admin-key"],
  })
);

app.use(express.json({ limit: "2mb" }));

// --------------------
// Admin auth
// --------------------
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

// --------------------
// Helpers
// --------------------
function mustHaveGroqKey() {
  const key = (process.env.GROQ_API_KEY || "").toString().trim();
  return key;
}

function safeText(v) {
  return (v ?? "").toString().trim();
}

function escapeHtml(str) {
  return safeText(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildStyledHtmlReport({ title, subtitle, sections }) {
  const sectionHtml = (sections || [])
    .map(
      (s) => `
      <section class="card">
        <h2>${escapeHtml(s.heading)}</h2>
        ${s.bodyHtml || ""}
      </section>
    `
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title || "Report")}</title>
<style>
  :root{
    --ink:#1f2d3a;
    --muted:#6b7280;
    --cream:#fff7ed;
    --blush:#fde2e4;
    --border:rgba(31,45,58,.14);
    --shadow:0 14px 40px rgba(31,45,58,.10);
    --radius:16px;
    --gold:#d4af37;
    --bg: linear-gradient(180deg, var(--cream), var(--blush));
  }
  *{box-sizing:border-box}
  body{
    margin:0;
    font-family: system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
    color:var(--ink);
    background: var(--bg);
    padding: 24px;
  }
  .wrap{max-width: 980px; margin:0 auto;}
  header{
    background: rgba(255,255,255,.92);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 18px 18px;
    margin-bottom: 18px;
  }
  h1{margin:0; font-size: 26px; line-height:1.2}
  .sub{margin-top: 6px; color: var(--muted)}
  .grid{display:grid; gap: 14px}
  .card{
    background: rgba(255,255,255,.94);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 18px;
  }
  .card h2{margin:0 0 10px; font-size:18px}
  .pill{
    display:inline-block;
    border:1px solid var(--border);
    border-radius:999px;
    padding:6px 10px;
    font-size: 12px;
    color: var(--muted);
    background: rgba(255,255,255,.9);
  }
  .rubric{
    width:100%;
    border-collapse: collapse;
    overflow:hidden;
    border-radius: 12px;
    border:1px solid var(--border);
  }
  .rubric th, .rubric td{
    border:1px solid var(--border);
    padding: 10px;
    vertical-align: top;
    font-size: 14px;
  }
  .rubric th{
    background: rgba(212,175,55,.15);
    text-align:left;
  }
  .muted{color: var(--muted)}
  ul{margin: 8px 0 0 18px}
  .k{
    font-weight: 600;
  }
  .twoCol{
    display:grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  @media (max-width: 860px){
    .twoCol{grid-template-columns: 1fr;}
  }
  .hr{height:1px;background:var(--border);margin:12px 0}
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>${escapeHtml(title || "Report")}</h1>
      <div class="sub">${escapeHtml(subtitle || "")}</div>
    </header>

    <div class="grid">
      ${sectionHtml}
    </div>
  </div>
</body>
</html>`;
}

// --------------------
// GROQ call (OpenAI-compatible endpoint)
// --------------------
async function groqChat({ system, user, temperature = 0.4, max_tokens = 1800 }) {
  const key = mustHaveGroqKey();
  if (!key) {
    throw new Error("GROQ_API_KEY is missing on the server.");
  }

  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      temperature,
      max_tokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    const msg = data?.error?.message || JSON.stringify(data);
    throw new Error(`GROQ error (${resp.status}): ${msg}`);
  }

  const text = data?.choices?.[0]?.message?.content || "";
  return text;
}

// --------------------
// Routes: health + admin
// --------------------
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

app.get("/api/admin/ping", requireAdmin, (req, res) => {
  res.json({ ok: true, admin: true, timestamp: new Date().toISOString() });
});

// --------------------
// POST /api/generate
// --------------------
app.post("/api/generate", async (req, res) => {
  try {
    const payload = req.body || {};
    const skill = safeText(payload.skill);
    const levelFramework = safeText(payload.levelFramework || "CLB");
    const level = safeText(payload.level);
    const purpose = safeText(payload.purpose || "Formative");
    const assessmentType = safeText(payload.assessmentType);
    const description = safeText(payload.description);
    const learningOutcomes = safeText(payload.learningOutcomes);

    if (!skill || !level || !assessmentType || !description) {
      return res.status(400).json({
        ok: false,
        error:
          "Missing required fields: skill, level, assessmentType, description (and ideally learningOutcomes).",
      });
    }

    const system = `You are an expert ESL/EAP assessment designer and validity specialist.
You write clear, professional, teacher-ready assessments.
Output MUST be in JSON only (no markdown fences).
The JSON keys MUST be:
- instructions (string, student-facing)
- rubric (object with: title, totalPoints (number), criteria (array of objects with: name, outOf (number), bands (array of 4 objects with: label, range, descriptor)))
- teacherNotes (string)
- improvementsChecklist (array of strings)
Style: clean, Sheridan-style academic tone, practical, AODA-friendly formatting cues.`;

    const user = `Create a complete assessment package from:
Skill: ${skill}
Framework: ${levelFramework}
Level: ${level}
Purpose: ${purpose}
Assessment type: ${assessmentType}
Task/Description: ${description}
Learning outcomes: ${learningOutcomes || "(none provided)"}

Rubric requirements:
- 4 bands: Exceeds expectations / Meets expectations / Needs some improvement / Did not achieve
- Include point ranges and descriptors
- Criteria should match the skill and task (3–5 criteria)
- Total points should be 20 (unless task clearly needs another total; prefer 20)

Return valid JSON only.`;

    const raw = await groqChat({ system, user, temperature: 0.35, max_tokens: 1800 });

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      // If model returns almost-json, try to salvage:
      return res.status(502).json({
        ok: false,
        error: "Model returned non-JSON. (We can harden this if needed.)",
        raw,
      });
    }

    // Build a styled HTML document for download/print
    const rubric = parsed.rubric || {};
    const criteria = Array.isArray(rubric.criteria) ? rubric.criteria : [];

    const rubricTable = `
      <div class="muted pill">Rubric: ${escapeHtml(rubric.title || `${skill} Rubric`)}</div>
      <div class="hr"></div>
      <table class="rubric">
        <thead>
          <tr>
            <th style="width:18%">Criteria</th>
            <th style="width:10%">Out of</th>
            <th>Exceeds expectations</th>
            <th>Meets expectations</th>
            <th>Needs some improvement</th>
            <th>Did not achieve</th>
          </tr>
        </thead>
        <tbody>
          ${criteria
            .map((c) => {
              const bands = Array.isArray(c.bands) ? c.bands : [];
              const b = (i) => bands[i] || {};
              return `
                <tr>
                  <td><span class="k">${escapeHtml(c.name || "")}</span></td>
                  <td>${escapeHtml(c.outOf)}</td>
                  <td><div class="muted">${escapeHtml(b(0).range || "")}</div>${escapeHtml(b(0).descriptor || "")}</td>
                  <td><div class="muted">${escapeHtml(b(1).range || "")}</div>${escapeHtml(b(1).descriptor || "")}</td>
                  <td><div class="muted">${escapeHtml(b(2).range || "")}</div>${escapeHtml(b(2).descriptor || "")}</td>
                  <td><div class="muted">${escapeHtml(b(3).range || "")}</div>${escapeHtml(b(3).descriptor || "")}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
      <p class="muted" style="margin-top:10px">Total: ${escapeHtml(rubric.totalPoints ?? 20)} points</p>
    `;

    const instructionsHtml = `
      <div class="twoCol">
        <div>
          <div class="pill"><span class="k">Skill:</span> ${escapeHtml(skill)}</div>
          <div class="pill" style="margin-left:6px"><span class="k">Level:</span> ${escapeHtml(levelFramework)} ${escapeHtml(level)}</div>
          <div class="pill" style="margin-left:6px"><span class="k">Purpose:</span> ${escapeHtml(purpose)}</div>
        </div>
        <div class="muted" style="text-align:right; padding-top:4px">
          Teacher-ready package (print/save as PDF)
        </div>
      </div>
      <div class="hr"></div>
      <div style="white-space:pre-wrap">${escapeHtml(parsed.instructions || "")}</div>
    `;

    const teacherNotesHtml = `
      <div style="white-space:pre-wrap">${escapeHtml(parsed.teacherNotes || "")}</div>
      ${
        Array.isArray(parsed.improvementsChecklist)
          ? `<div class="hr"></div><div class="k">Quick quality checklist</div><ul>${parsed.improvementsChecklist
              .map((x) => `<li>${escapeHtml(x)}</li>`)
              .join("")}</ul>`
          : ""
      }
    `;

    const html = buildStyledHtmlReport({
      title: "Assessment Package",
      subtitle: `${skill} • ${levelFramework} ${level} • ${purpose} • ${assessmentType}`,
      sections: [
        { heading: "Student Instructions", bodyHtml: instructionsHtml },
        { heading: "Rubric", bodyHtml: rubricTable },
        { heading: "Teacher Notes", bodyHtml: teacherNotesHtml },
      ],
    });

    res.json({
      ok: true,
      data: parsed,        // structured JSON (for the frontend to render)
      htmlReport: html,    // styled HTML (for download/print)
    });
  } catch (err) {
    console.error("Generate error:", err);
    res.status(500).json({ ok: false, error: err.message || "Generation failed" });
  }
});

// --------------------
// POST /api/analyze
// --------------------
app.post("/api/analyze", async (req, res) => {
  try {
    const payload = req.body || {};
    const assessmentText = safeText(payload.assessmentText);
    const rubricText = safeText(payload.rubricText);
    const meta = payload.meta || {};
    const framework = safeText(meta.levelFramework || "CLB");
    const level = safeText(meta.level || "");
    const skill = safeText(meta.skill || "");

    if (!assessmentText && !rubricText) {
      return res.status(400).json({
        ok: false,
        error: "Provide assessmentText and/or rubricText to analyze.",
      });
    }

    const system = `You are a language assessment validity expert (ESL/EAP).
You evaluate: construct alignment, content validity, reliability risks, fairness, accessibility, washback, authenticity, practicality.
You MUST return JSON only with keys:
- summary (string)
- strengths (array of strings)
- risks (array of strings)
- washback (object with: positive (array), negative (array), suggestions (array))
- alignment (object with: likelyConstruct (string), evidence (array of strings), gaps (array of strings))
- improvedAssessment (string)
- improvedRubric (string)
- recommendations (array of strings)
Keep it teacher-friendly and concrete.`;

    const user = `Analyze the following assessment materials.

Context:
Skill: ${skill || "(unknown)"}
Framework: ${framework}
Level: ${level || "(unknown)"}

ASSESSMENT:
${assessmentText || "(none)"}

RUBRIC:
${rubricText || "(none)"}

Return JSON only.`;

    const raw = await groqChat({ system, user, temperature: 0.25, max_tokens: 1800 });

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return res.status(502).json({
        ok: false,
        error: "Model returned non-JSON. (We can harden this if needed.)",
        raw,
      });
    }

    const strengthsHtml = Array.isArray(parsed.strengths)
      ? `<ul>${parsed.strengths.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>`
      : `<div class="muted">(none)</div>`;

    const risksHtml = Array.isArray(parsed.risks)
      ? `<ul>${parsed.risks.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>`
      : `<div class="muted">(none)</div>`;

    const washback = parsed.washback || {};
    const washbackHtml = `
      <div class="twoCol">
        <div>
          <div class="k">Positive washback</div>
          <ul>${(washback.positive || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>
        </div>
        <div>
          <div class="k">Negative washback risks</div>
          <ul>${(washback.negative || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>
        </div>
      </div>
      <div class="hr"></div>
      <div class="k">Washback improvement suggestions</div>
      <ul>${(washback.suggestions || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>
    `;

    const alignment = parsed.alignment || {};
    const alignmentHtml = `
      <div class="pill"><span class="k">Likely construct:</span> ${escapeHtml(alignment.likelyConstruct || "")}</div>
      <div class="hr"></div>
      <div class="k">Evidence</div>
      <ul>${(alignment.evidence || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>
      <div class="k" style="margin-top:10px">Gaps</div>
      <ul>${(alignment.gaps || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>
    `;

    const improvedHtml = `
      <div class="k">Improved assessment (clean version)</div>
      <div class="hr"></div>
      <div style="white-space:pre-wrap">${escapeHtml(parsed.improvedAssessment || "")}</div>
      <div class="hr"></div>
      <div class="k">Improved rubric (clean version)</div>
      <div class="hr"></div>
      <div style="white-space:pre-wrap">${escapeHtml(parsed.improvedRubric || "")}</div>
    `;

    const recHtml = Array.isArray(parsed.recommendations)
      ? `<ul>${parsed.recommendations.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>`
      : `<div class="muted">(none)</div>`;

    const html = buildStyledHtmlReport({
      title: "Validity & Washback Report",
      subtitle: `${skill || "Assessment"} • ${framework} ${level || ""}`.trim(),
      sections: [
        { heading: "Summary", bodyHtml: `<div style="white-space:pre-wrap">${escapeHtml(parsed.summary || "")}</div>` },
        { heading: "Strengths", bodyHtml: strengthsHtml },
        { heading: "Risks / Validity Threats", bodyHtml: risksHtml },
        { heading: "Washback", bodyHtml: washbackHtml },
        { heading: "Alignment", bodyHtml: alignmentHtml },
        { heading: "Improved Versions", bodyHtml: improvedHtml },
        { heading: "Recommendations", bodyHtml: recHtml },
      ],
    });

    res.json({
      ok: true,
      data: parsed,
      htmlReport: html,
    });
  } catch (err) {
    console.error("Analyze error:", err);
    res.status(500).json({ ok: false, error: err.message || "Analysis failed" });
  }
});

// --------------------
// 404 + error handlers
// --------------------
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Route not found" });
});

app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ ok: false, error: "Internal server error" });
});

// --------------------
// Start
// --------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log("ADMIN_KEY set:", Boolean(process.env.ADMIN_KEY));
  console.log("GROQ_API_KEY set:", Boolean(process.env.GROQ_API_KEY));
});
