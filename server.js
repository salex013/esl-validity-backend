import express from "express";
import cors from "cors";

const app = express();

/**
 * IMPORTANT:
 * Set this in Render env if you want to restrict requests:
 * FRONTEND_ORIGIN=https://assessment-checker-sheridan-eap.netlify.app
 *
 * If not set, it will allow all origins (fine for testing).
 */
const FRONTEND_ORIGIN = (process.env.FRONTEND_ORIGIN || "").trim();

app.use(
  cors({
    origin: FRONTEND_ORIGIN ? FRONTEND_ORIGIN : true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-admin-key"],
  })
);
app.use(express.json({ limit: "2mb" }));

// --- admin auth (only for admin routes; DO NOT require this from browser UI) ---
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

// ---------------------------
// Rule-based analysis core
// ---------------------------
function basicScan({ instructions = "", rubric = "", meta = {} }) {
  const issues = [];
  const tips = [];
  const strengths = [];

  const outcomes = (meta.learningOutcomes || "").trim();
  const desc = (meta.description || "").trim();

  const hasOutcomes = outcomes.length > 0;
  const hasDesc = desc.length > 0;

  const hasTime = /time\s*(limit|allowed)|\b\d+\s*(min|mins|minutes|hour|hours)\b/i.test(
    instructions
  );
  const hasSubmission = /submit|upload|format|pdf|docx|audio|record/i.test(instructions);

  const mentionsCriteria = /criteria/i.test(rubric);
  const mentionsLevels = /exceeds|meets|developing|beginning|excellent|good|satisfactory/i.test(
    rubric
  );
  const mentionsWeight = /out of|\/\s*\d+|%|points/i.test(rubric);

  if (hasOutcomes) strengths.push("Learning outcomes provided (supports alignment checking).");
  if (hasDesc) strengths.push("Task description provided (supports construct/content validity).");
  if (hasTime) strengths.push("Time guidance is present (supports practicality/fairness).");
  if (hasSubmission) strengths.push("Submission format is present (supports practicality).");

  if (!hasOutcomes) issues.push("Learning outcomes missing → alignment is difficult to justify.");
  if (!hasDesc) tips.push("Add a clearer task description/prompt to improve authenticity.");
  if (!hasTime) tips.push("Add a clear time limit to strengthen practicality and fairness.");
  if (!hasSubmission) tips.push("Add a submission format (DOCX/PDF/audio) for practicality.");

  if (!mentionsCriteria) tips.push("Rubric should clearly name criteria (e.g., Task completion, Language control).");
  if (!mentionsLevels) tips.push("Rubric should show performance levels (Exceeds/Meets/Developing/Beginning).");
  if (!mentionsWeight) tips.push("Rubric should show weighting (e.g., Out of 10) to support reliability.");

  // crude washback signal
  const hasFeedbackLanguage = /feedback|next time|to improve|work on|strengths|areas to/i.test(
    instructions + "\n" + rubric
  );
  if (!hasFeedbackLanguage) tips.push("Add feedback-oriented language to increase positive washback.");

  // scores (simple, deterministic)
  const alignment = hasOutcomes ? 0.78 : 0.55;
  const washback = hasFeedbackLanguage ? 0.78 : 0.62;
  const fairness = hasTime ? 0.78 : 0.60;
  const practicality = hasTime && hasSubmission ? 0.84 : 0.60;

  return {
    scores: { alignment, washback, fairness, practicality },
    strengths,
    issues,
    tips,
  };
}

function buildDefaultRubricTable(meta = {}) {
  // SLATE-like columns
  return {
    columns: ["Criteria", "Out of", "Exceeds", "Meets", "Developing", "Beginning", "Criterion score"],
    rows: [
      {
        criteria: "Task completion",
        outOf: "10",
        exceeds: "Fully completes all parts with strong detail and accuracy.",
        meets: "Completes most parts with generally clear, accurate work.",
        developing: "Partially completes the task; missing detail or clarity in places.",
        beginning: "Limited completion; unclear or incomplete response.",
        score: "",
      },
      {
        criteria: "Language control",
        outOf: "10",
        exceeds: "Consistently accurate grammar/vocabulary for the level; errors are rare.",
        meets: "Mostly accurate; errors do not block meaning.",
        developing: "Frequent errors sometimes affect meaning.",
        beginning: "Errors often block meaning; limited control of forms.",
        score: "",
      },
      {
        criteria: "Organization & clarity",
        outOf: "10",
        exceeds: "Very clear organization; easy to follow throughout.",
        meets: "Clear overall; minor lapses.",
        developing: "Some organization; hard to follow at times.",
        beginning: "Unclear organization; difficult to follow.",
        score: "",
      },
    ],
  };
}

function buildDefaultInstructions(meta = {}) {
  const skill = (meta.skill || "Assessment").toString();
  const level = `${meta.levelFramework || ""} ${meta.level || ""}`.trim();

  return [
    `## Assessment Instructions`,
    ``,
    `**Skill:** ${skill}`,
    level ? `**Level:** ${level}` : ``,
    ``,
    `### Goal`,
    `Complete the task using appropriate language for your level.`,
    ``,
    `### What to do`,
    `1. Read the prompt carefully.`,
    `2. Plan your response (brainstorm / outline).`,
    `3. Complete the task.`,
    `4. Review for clarity, grammar, and vocabulary.`,
    ``,
    `### Time`,
    `30–45 minutes (teacher may adjust).`,
    ``,
    `### Submission`,
    `Upload a **DOCX or PDF** (or submit audio if assigned).`,
    ``,
    `### Success criteria (summary)`,
    `You will be evaluated on task completion, language control, and organization/clarity.`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------------------------
// ROUTES
// ---------------------------
app.get("/", (req, res) => {
  res.json({
    ok: true,
    name: "ESL Validity Tool Backend",
    timestamp: new Date().toISOString(),
    adminConfigured: Boolean(getExpectedAdminKey()),
    groqConfigured: Boolean(process.env.GROQ_API_KEY),
    frontendOrigin: FRONTEND_ORIGIN || "(any)",
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

// ✅ Generate a package (instructions + rubric table)
app.post("/api/generate", async (req, res) => {
  try {
    const meta = req.body || {};
    const instructionsMarkdown = buildDefaultInstructions(meta);
    const rubricTable = buildDefaultRubricTable(meta);

    return res.json({
      ok: true,
      generated: {
        instructionsMarkdown,
        rubricTable,
      },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Generate failed." });
  }
});

// ✅ Analyze validity/washback + return improved versions + report
app.post("/api/analyze", async (req, res) => {
  try {
    const { instructions = "", rubric = "", meta = {} } = req.body || {};

    if (!instructions.trim() && !rubric.trim()) {
      return res.status(400).json({ ok: false, error: "Provide instructions and/or rubric." });
    }

    const scan = basicScan({ instructions, rubric, meta });

    // “Improved” versions (rule-based)
    const improvedInstructions = instructions.trim()
      ? `${instructions.trim()}\n\n---\n**Improvements added:** Clear time + submission + success criteria language for positive washback.`
      : buildDefaultInstructions(meta);

    const improvedRubricTable = buildDefaultRubricTable(meta);

    const pct = (x) => `${Math.round(x * 100)}%`;

    const reportHtml = `
      <h3>Validity & Washback Report</h3>
      <p><strong>Alignment:</strong> ${pct(scan.scores.alignment)}</p>
      <p><strong>Washback:</strong> ${pct(scan.scores.washback)}</p>
      <p><strong>Fairness:</strong> ${pct(scan.scores.fairness)}</p>
      <p><strong>Practicality:</strong> ${pct(scan.scores.practicality)}</p>

      ${scan.strengths?.length ? `<h4>Strengths</h4><ul>${scan.strengths
        .map((x) => `<li>${x}</li>`)
        .join("")}</ul>` : ""}

      ${scan.issues?.length ? `<h4>Issues</h4><ul>${scan.issues
        .map((x) => `<li>${x}</li>`)
        .join("")}</ul>` : ""}

      ${scan.tips?.length ? `<h4>Recommendations</h4><ul>${scan.tips
        .map((x) => `<li>${x}</li>`)
        .join("")}</ul>` : ""}
    `;

    return res.json({
      ok: true,
      scan,
      improved: {
        instructionsText: improvedInstructions,
        rubricTable: improvedRubricTable,
      },
      reportHtml,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Analyze failed." });
  }
});

// --- 404 catch ---
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Route not found" });
});

// --- start ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
