import express from "express";
import cors from "cors";

const app = express();

// --- basics ---
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// --- admin auth (optional) ---
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

// --- helpers ---
function cleanStr(x) {
  return (x ?? "").toString().trim();
}

function basicRubricTable({ levelFramework, level, skill }) {
  // Matches the SLATE-style columns you showed
  return {
    columns: [
      "Criteria",
      "Out of",
      "Exceeds expectations (80%+)",
      "Meets expectations (70–79%)",
      "Needs some improvement (60–69%)",
      "Did not achieve (59% or lower)",
      "Criterion score",
    ],
    rows: [
      {
        criteria: "Task completion",
        outOf: " / 5",
        exceeds: "All required parts completed fully and appropriately.",
        meets: "Most required parts completed; minor gaps.",
        developing: "Some parts incomplete or unclear; important details missing.",
        beginning: "Task mostly incomplete or does not meet requirements.",
        score: "",
      },
      {
        criteria: "Organization / coherence",
        outOf: " / 5",
        exceeds: "Very clear, logical flow; easy to follow.",
        meets: "Generally clear; a few small organization issues.",
        developing: "Some confusion; ideas not always connected clearly.",
        beginning: "Hard to follow; organization prevents understanding.",
        score: "",
      },
      {
        criteria: "Language use (grammar & vocab)",
        outOf: " / 5",
        exceeds: `Strong control for ${levelFramework} ${level}; accurate range and word choice.`,
        meets: `Appropriate for ${levelFramework} ${level}; some errors but meaning is clear.`,
        developing: "Limited range; frequent errors that sometimes affect meaning.",
        beginning: "Very limited control; errors often block meaning.",
        score: "",
      },
      {
        criteria: skill === "Speaking" ? "Fluency & pronunciation" : "Mechanics / clarity",
        outOf: " / 5",
        exceeds: "Smooth, clear, confident; very easy to understand.",
        meets: "Mostly clear; a few issues do not interrupt understanding.",
        developing: "Sometimes unclear; listener/reader must work to understand.",
        beginning: "Often unclear; communication breaks down.",
        score: "",
      },
    ],
  };
}

function basicInstructions({ levelFramework, level, skill, purpose, assessmentType, description, learningOutcomes }) {
  const header = `Assessment Instructions (${levelFramework} ${level})`;
  const bullets = [
    "Read the task carefully.",
    "Complete the task using language that matches your level.",
    "Submit your work by the deadline (your teacher will confirm).",
  ];

  const include = [
    skill === "Speaking" ? "Clear pronunciation and an appropriate pace" : "Clear writing that is easy to follow",
    "A clear main idea and supporting details",
    "Relevant vocabulary for the topic",
  ];

  return [
    header,
    "",
    `Skill: ${skill}`,
    `Assessment type: ${assessmentType}`,
    `Purpose: ${purpose}`,
    "",
    "Task:",
    description ? description : "(teacher will provide)",
    "",
    "Steps:",
    ...bullets.map((b, i) => `${i + 1}) ${b}`),
    "",
    "What to include:",
    ...include.map((x) => `• ${x}`),
    "",
    "Learning outcomes (teacher input):",
    learningOutcomes ? learningOutcomes : "(none provided)",
  ].join("\n");
}

function basicValidityReportHtml({ instructions, rubric }) {
  const issues = [];

  if (!instructions || instructions.length < 80) issues.push("Instructions are very short — students may not understand expectations.");
  if (!rubric || rubric.length < 80) issues.push("Rubric text is very short — criteria and performance levels may be unclear.");

  // simple “washback” heuristics
  if (instructions.toLowerCase().includes("grammar") && !instructions.toLowerCase().includes("meaning")) {
    issues.push("Washback risk: focus may skew toward grammar accuracy over meaning/communication.");
  }

  const score = Math.max(1, 5 - issues.length); // quick, transparent heuristic

  return `
    <div>
      <p><strong>Overall signal:</strong> <span style="padding:6px 10px;border:2px solid #d4af37;border-radius:999px;color:#d4af37;font-weight:800;">${score}/5</span></p>
      <h3>Validity & washback notes</h3>
      <ul>
        ${issues.length ? issues.map(i => `<li>${i}</li>`).join("") : "<li>Looks solid based on the text provided.</li>"}
      </ul>
      <h3>Recommendations</h3>
      <ul>
        <li>Add clearer success criteria (“what good looks like”) in student-friendly language.</li>
        <li>Ensure rubric criteria align directly to the learning outcomes (content validity).</li>
        <li>Add positive, actionable descriptors to encourage good washback (strategy + communication).</li>
      </ul>
    </div>
  `;
}

// --- routes ---
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

// ✅ NEW: generate
app.post("/api/generate", async (req, res) => {
  try {
    const skill = cleanStr(req.body.skill) || "Speaking";
    const levelFramework = cleanStr(req.body.levelFramework) || "CLB";
    const level = cleanStr(req.body.level) || "5";
    const purpose = cleanStr(req.body.purpose) || "Formative";
    const assessmentType = cleanStr(req.body.assessmentType) || "Task";
    const description = cleanStr(req.body.description);
    const learningOutcomes = cleanStr(req.body.learningOutcomes);

    const instructionsMarkdown = basicInstructions({
      levelFramework, level, skill, purpose, assessmentType, description, learningOutcomes
    });

    const rubricTable = basicRubricTable({ levelFramework, level, skill });

    return res.json({
      ok: true,
      generated: { instructionsMarkdown, rubricTable },
    });
  } catch (err) {
    console.error("Generate error:", err);
    return res.status(500).json({ ok: false, error: "Generate failed." });
  }
});

// ✅ NEW: analyze
app.post("/api/analyze", async (req, res) => {
  try {
    const instructions = cleanStr(req.body.instructions);
    const rubric = cleanStr(req.body.rubric);
    const meta = req.body.meta || {};

    const reportHtml = basicValidityReportHtml({ instructions, rubric });

    // “Improved” versions (simple starter version; you can upgrade with Groq later)
    const improvedInstructionsText = instructions
      ? instructions + "\n\n(Improvement) Add: time limit, submission format, and a model/example response."
      : basicInstructions({
          levelFramework: meta.levelFramework || "CLB",
          level: meta.level || "5",
          skill: meta.skill || "Speaking",
          purpose: meta.purpose || "Formative",
          assessmentType: meta.assessmentType || "Task",
          description: meta.description || "",
          learningOutcomes: meta.learningOutcomes || "",
        });

    const improvedRubricTable = basicRubricTable({
      levelFramework: meta.levelFramework || "CLB",
      level: meta.level || "5",
      skill: meta.skill || "Speaking",
    });

    return res.json({
      ok: true,
      reportHtml,
      improved: {
        instructionsText: improvedInstructionsText,
        rubricTable: improvedRubricTable,
      },
    });
  } catch (err) {
    console.error("Analyze error:", err);
    return res.status(500).json({ ok: false, error: "Analyze failed." });
  }
});

// --- 404 catch ---
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Route not found" });
});

// --- error handler ---
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ ok: false, error: "Internal server error" });
});

// --- start ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log("ADMIN_KEY set:", Boolean(process.env.ADMIN_KEY));
  console.log("GROQ_API_KEY set:", Boolean(process.env.GROQ_API_KEY));
});
