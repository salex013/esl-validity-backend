// server.js
// ESL Validity Backend (Report + Fix + ZIP pack)
// Endpoints:
//   GET  /api/health
//   POST /api/report   -> JSON report (issues + issueCount)
//   POST /api/autofix  -> ZIP with DOCX + report files
//
// Request body shape (frontend sends this):
// {
//   extractedText: "...",
//   rubricText: "...",
//   meta: { skill: "Speaking", framework: "CLB"|"CEFR", level: "5"|"B2", purpose: "Benchmark / Exit" },
//   mode?: "fix"|"asIs"   // OPTIONAL; default "fix"
// }

const express = require("express");
const cors = require("cors");
const archiver = require("archiver");

// DOCX generator
let docx;
try {
  docx = require("docx");
} catch (e) {
  docx = null;
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 10000;

// ----------------------------
// Helpers
// ----------------------------
function safeStr(v) {
  return typeof v === "string" ? v : "";
}

function normalizeWhitespace(s) {
  return safeStr(s).replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

function hasAny(s, patterns = []) {
  const t = safeStr(s).toLowerCase();
  return patterns.some((p) => t.includes(p.toLowerCase()));
}

function lineCount(s) {
  const t = normalizeWhitespace(s);
  if (!t) return 0;
  return t.split("\n").filter(Boolean).length;
}

function wordCount(s) {
  const t = normalizeWhitespace(s);
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

function clampText(s, maxChars = 8000) {
  const t = safeStr(s);
  return t.length > maxChars ? t.slice(0, maxChars) + "…" : t;
}

function nowISO() {
  return new Date().toISOString();
}

// ----------------------------
// Purpose definitions (as requested for UI/tooling)
// You can also serve these to the frontend later if you want.
// ----------------------------
const PURPOSE_DEFINITIONS = {
  "Diagnostic / Placement":
    "Used at the start to identify a learner’s current level and needs. Results guide class placement and learning plans, not final grades.",
  "Formative / Practice":
    "Low-stakes check-ins during learning. Feedback helps students improve before a final evaluation; often includes revision opportunities.",
  "Summative":
    "Higher-stakes evaluation at the end of a unit/term to measure achievement. Usually contributes to final grades or official results.",
  "Benchmark / Exit":
    "Decision point for progression (e.g., move up a level) or completion (exit). Evidence should align tightly with level descriptors and criteria.",
  "Portfolio / Evidence Collection":
    "Ongoing collection of work samples showing growth over time. Focus is on progress, reflection, and multiple pieces of evidence.",
  "Self / Peer Assessment":
    "Learners assess their own or peers’ work using criteria. Builds awareness of quality and targets; teacher moderation may be needed.",
  "Observation / Performance":
    "Teacher observes live performance (speaking, interaction, task completion). Notes should be tied to clear criteria and descriptors."
};

// ----------------------------
// Rule-based Report
// ----------------------------
function buildReport({ extractedText, rubricText, meta }) {
  const task = normalizeWhitespace(extractedText);
  const rubric = normalizeWhitespace(rubricText);

  const skill = safeStr(meta?.skill || "").trim();
  const framework = safeStr(meta?.framework || "").trim();
  const level = safeStr(meta?.level || "").trim();
  const purpose = safeStr(meta?.purpose || "").trim();

  const issues = [];
  const suggestions = [];

  // Basic presence
  if (!task) {
    issues.push({
      severity: "high",
      code: "TASK_MISSING",
      message: "Task / instructions text is empty.",
      suggestion: "Paste the full assessment instructions (what students do, how long, what to submit, conditions)."
    });
  } else if (wordCount(task) < 25) {
    issues.push({
      severity: "medium",
      code: "TASK_TOO_SHORT",
      message: "Task text is very short—may be missing key conditions (time, audience, steps, success criteria).",
      suggestion: "Add: time limit, audience/format, required components, and submission details."
    });
  }

  if (!rubric) {
    issues.push({
      severity: "high",
      code: "RUBRIC_MISSING",
      message: "Rubric text is empty.",
      suggestion: "Paste criteria + bands/levels (or performance descriptors)."
    });
  } else if (wordCount(rubric) < 20) {
    issues.push({
      severity: "medium",
      code: "RUBRIC_TOO_SHORT",
      message: "Rubric text is very short—may not include descriptors or levels/bands.",
      suggestion: "Include criteria and what performance looks like at each band/level."
    });
  }

  // Meta checks
  if (!skill) {
    issues.push({
      severity: "low",
      code: "SKILL_MISSING",
      message: "Skill is not selected.",
      suggestion: "Select the skill (Speaking, Writing, Listening, Reading)."
    });
  }
  if (!framework) {
    issues.push({
      severity: "low",
      code: "FRAMEWORK_MISSING",
      message: "Level framework (CLB/CEFR) is not selected.",
      suggestion: "Select CLB or CEFR."
    });
  }
  if (!level) {
    issues.push({
      severity: "low",
      code: "LEVEL_MISSING",
      message: "Level is not selected.",
      suggestion: "Select the target level for this assessment."
    });
  }
  if (!purpose) {
    issues.push({
      severity: "low",
      code: "PURPOSE_MISSING",
      message: "Purpose is not selected.",
      suggestion: "Select the purpose (Formative, Summative, Benchmark/Exit, etc.)."
    });
  }

  // Skill alignment heuristics
  if (skill) {
    const s = skill.toLowerCase();
    if (s.includes("speaking")) {
      if (!hasAny(task, ["present", "talk", "speak", "discussion", "role-play", "conversation", "oral"])) {
        issues.push({
          severity: "medium",
          code: "SKILL_MISMATCH_TASK",
          message: "Skill is Speaking but task text doesn’t clearly indicate an oral/speaking performance.",
          suggestion: "Add explicit speaking requirements (time, interaction type, audience, recording/live)."
        });
      }
      if (rubric && !hasAny(rubric, ["fluency", "pronunciation", "intelligib", "interaction", "turn-taking", "coherence"])) {
        issues.push({
          severity: "medium",
          code: "SPEAKING_RUBRIC_WEAK",
          message: "Speaking rubric may be missing key speaking dimensions (fluency, pronunciation, interaction, coherence).",
          suggestion: "Include at least 3–5 speaking criteria with descriptors for bands/levels."
        });
      }
    }
    if (s.includes("writing")) {
      if (!hasAny(task, ["write", "paragraph", "essay", "report", "email", "draft"])) {
        issues.push({
          severity: "medium",
          code: "SKILL_MISMATCH_TASK",
          message: "Skill is Writing but task text doesn’t clearly indicate a writing product.",
          suggestion: "Add the required writing product, length/structure, and submission format."
        });
      }
    }
    if (s.includes("listening")) {
      if (!hasAny(task, ["listen", "audio", "recording", "podcast", "video"])) {
        issues.push({
          severity: "medium",
          code: "SKILL_MISMATCH_TASK",
          message: "Skill is Listening but task text doesn’t clearly mention an audio/video listening source.",
          suggestion: "State the listening source and conditions (plays allowed, note-taking rules)."
        });
      }
    }
    if (s.includes("reading")) {
      if (!hasAny(task, ["read", "article", "text", "passage"])) {
        issues.push({
          severity: "medium",
          code: "SKILL_MISMATCH_TASK",
          message: "Skill is Reading but task text doesn’t clearly mention a reading text/passage.",
          suggestion: "State the reading text type/length and the question/task requirements."
        });
      }
    }
  }

  // Time / conditions check
  if (task && !hasAny(task, ["minute", "minutes", "min", "time limit", "timed", "within"])) {
    issues.push({
      severity: "low",
      code: "TIME_UNCLEAR",
      message: "Time/length conditions are not explicit in the task text.",
      suggestion: "Add a time limit or expected duration/length (e.g., 3 minutes, 150–200 words)."
    });
  }

  // Rubric banding check
  if (rubric) {
    const hasBands =
      hasAny(rubric, ["level 1", "level 2", "level 3", "level 4", "band", "meets", "approaches", "exceeds", "poor", "fair", "good", "excellent"]);
    if (!hasBands) {
      issues.push({
        severity: "medium",
        code: "RUBRIC_NO_BANDS",
        message: "Rubric doesn’t clearly include performance bands/levels.",
        suggestion: "Add bands (e.g., Approaches/Meets/Exceeds) or descriptors per level."
      });
    }
  }

  // Purpose-specific nudges
  if (purpose) {
    const def = PURPOSE_DEFINITIONS[purpose];
    if (def) {
      suggestions.push({
        code: "PURPOSE_DEFINITION",
        message: `Purpose definition: ${def}`
      });
    }

    const p = purpose.toLowerCase();
    if (p.includes("benchmark") || p.includes("exit")) {
      if (!hasAny(rubric, ["descriptor", "meets", "benchmark", "criteria"])) {
        issues.push({
          severity: "low",
          code: "BENCHMARK_NEEDS_TIGHT_ALIGNMENT",
          message: "Benchmark/Exit assessments should have tight rubric descriptors aligned to level expectations.",
          suggestion: "Ensure rubric describes what ‘meeting the level’ looks like for each criterion."
        });
      }
    }
    if (p.includes("formative") || p.includes("practice")) {
      if (!hasAny(task, ["feedback", "revise", "revision", "try again", "practice"])) {
        issues.push({
          severity: "low",
          code: "FORMATIVE_SHOULD_SIGNAL_FEEDBACK",
          message: "Formative assessments should signal feedback and improvement opportunities.",
          suggestion: "Add a sentence that students will receive feedback and can revise/practice."
        });
      }
    }
  }

  const issueCount = issues.length;
  const ok = true;

  return {
    ok,
    generatedAt: nowISO(),
    meta: { skill, framework, level, purpose },
    stats: {
      taskWords: wordCount(task),
      rubricWords: wordCount(rubric),
      taskLines: lineCount(task),
      rubricLines: lineCount(rubric)
    },
    issueCount,
    issues,
    suggestions
  };
}

// ----------------------------
// Rule-based Fixer (safe + conservative)
// ----------------------------
function applyFixes({ extractedText, rubricText, meta, report }) {
  let task = normalizeWhitespace(extractedText);
  let rubric = normalizeWhitespace(rubricText);

  const skill = safeStr(meta?.skill || "").trim();
  const framework = safeStr(meta?.framework || "").trim();
  const level = safeStr(meta?.level || "").trim();
  const purpose = safeStr(meta?.purpose || "").trim();

  // Fix: add missing time line if absent
  if (task && !hasAny(task, ["minute", "minutes", "min", "time limit", "timed", "within"])) {
    if (skill.toLowerCase().includes("speaking")) {
      task += "\n\nTime: 3 minutes (approximately).";
    } else if (skill.toLowerCase().includes("writing")) {
      task += "\n\nLength: 150–200 words (approximately).";
    } else {
      task += "\n\nTime/Length: (Add an appropriate time or length requirement).";
    }
  }

  // Fix: add basic submission line if missing
  if (task && !hasAny(task, ["submit", "upload", "hand in", "turn in", "recording", "file"])) {
    if (skill.toLowerCase().includes("speaking")) {
      task += "\nSubmission: Present live in class OR submit an audio/video recording (teacher chooses).";
    } else if (skill.toLowerCase().includes("writing")) {
      task += "\nSubmission: Submit your final draft as a document or in the LMS text entry.";
    }
  }

  // Fix: add banding scaffold if rubric lacks it
  const hasBands =
    rubric &&
    hasAny(rubric, ["level 1", "level 2", "level 3", "level 4", "band", "meets", "approaches", "exceeds", "poor", "fair", "good", "excellent"]);

  if (rubric && !hasBands) {
    rubric =
      "Performance Bands:\n- Approaches Expectations\n- Meets Expectations\n- Exceeds Expectations\n\nRubric:\n" +
      rubric;
  }

  // Fix: if speaking and rubric lacks speaking criteria keywords, add a minimal criteria list header
  if (skill.toLowerCase().includes("speaking") && rubric && !hasAny(rubric, ["fluency", "pronunciation", "interaction", "coherence"])) {
    rubric =
      "Suggested Speaking Criteria (edit as needed): Fluency, Vocabulary/Grammar, Pronunciation/Intelligibility, Organization/Coherence, Interaction.\n\n" +
      rubric;
  }

  // Purpose note (helpful but non-intrusive)
  if (purpose && PURPOSE_DEFINITIONS[purpose] && task) {
    const note = `Purpose note: ${PURPOSE_DEFINITIONS[purpose]}`;
    if (!task.includes(note)) task += `\n\n${note}`;
  }

  // Metadata header (teacher-friendly)
  const headerLines = [];
  if (skill) headerLines.push(`Skill: ${skill}`);
  if (framework) headerLines.push(`Framework: ${framework}`);
  if (level) headerLines.push(`Level: ${level}`);
  if (purpose) headerLines.push(`Purpose: ${purpose}`);

  const header = headerLines.length ? headerLines.join("\n") + "\n\n" : "";

  return {
    fixedTaskText: header + task,
    fixedRubricText: rubric
  };
}

// ----------------------------
// DOCX + ZIP generation
// ----------------------------
async function buildDocxBuffer({ title, meta, taskText, rubricText }) {
  if (!docx) {
    throw new Error(
      "Missing dependency: 'docx'. Install with: npm i docx"
    );
  }

  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docx;

  const skill = safeStr(meta?.skill || "");
  const framework = safeStr(meta?.framework || "");
  const level = safeStr(meta?.level || "");
  const purpose = safeStr(meta?.purpose || "");

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: title || "Assessment Pack",
            heading: HeadingLevel.HEADING_1
          }),

          new Paragraph({ text: "" }),

          ...(skill || framework || level || purpose
            ? [
                new Paragraph({
                  children: [
                    new TextRun({ text: "Skill: ", bold: true }),
                    new TextRun({ text: skill || "-" })
                  ]
                }),
                new Paragraph({
                  children: [
                    new TextRun({ text: "Framework: ", bold: true }),
                    new TextRun({ text: framework || "-" })
                  ]
                }),
                new Paragraph({
                  children: [
                    new TextRun({ text: "Level: ", bold: true }),
                    new TextRun({ text: level || "-" })
                  ]
                }),
                new Paragraph({
                  children: [
                    new TextRun({ text: "Purpose: ", bold: true }),
                    new TextRun({ text: purpose || "-" })
                  ]
                }),
                new Paragraph({ text: "" })
              ]
            : []),

          new Paragraph({ text: "Task / Instructions", heading: HeadingLevel.HEADING_2 }),
          ...clampText(taskText, 12000)
            .split("\n")
            .map((line) => new Paragraph({ text: line })),

          new Paragraph({ text: "" }),

          new Paragraph({ text: "Rubric", heading: HeadingLevel.HEADING_2 }),
          ...clampText(rubricText, 12000)
            .split("\n")
            .map((line) => new Paragraph({ text: line }))
        ]
      }
    ]
  });

  return Packer.toBuffer(doc);
}

function sendZip({ res, zipName, files }) {
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);

  const archive = archiver("zip", { zlib: { level: 9 } });

  archive.on("error", (err) => {
    console.error("ZIP error:", err);
    if (!res.headersSent) res.status(500);
    res.end("Failed to create ZIP.");
  });

  archive.pipe(res);

  for (const f of files) {
    if (f.buffer) archive.append(f.buffer, { name: f.name });
    else archive.append(f.text || "", { name: f.name });
  }

  archive.finalize();
}

// ----------------------------
// Routes
// ----------------------------
app.get("/api/health", (req, res) => {
  res.json({ ok: true, name: "ESL Validity Tool Backend", time: nowISO() });
});

app.post("/api/report", (req, res) => {
  try {
    const extractedText = safeStr(req.body?.extractedText);
    const rubricText = safeStr(req.body?.rubricText);
    const meta = req.body?.meta || {};

    const report = buildReport({ extractedText, rubricText, meta });
    res.json(report);
  } catch (err) {
    console.error("Report error:", err);
    res.status(500).json({ ok: false, error: "Report generation failed." });
  }
});

app.post("/api/autofix", async (req, res) => {
  try {
    const extractedText = safeStr(req.body?.extractedText);
    const rubricText = safeStr(req.body?.rubricText);
    const meta = req.body?.meta || {};
    const mode = (safeStr(req.body?.mode) || "fix").toLowerCase(); // "fix" or "asis"

    const report = buildReport({ extractedText, rubricText, meta });

    // If as-is: do not apply fixes, but still package everything
    const taskText = normalizeWhitespace(extractedText);
    const rubText = normalizeWhitespace(rubricText);

    let finalTask = taskText;
    let finalRubric = rubText;

    if (mode !== "asis" && mode !== "as-is") {
      const fixed = applyFixes({ extractedText: taskText, rubricText: rubText, meta, report });
      finalTask = fixed.fixedTaskText;
      finalRubric = fixed.fixedRubricText;
    }

    const docxBuffer = await buildDocxBuffer({
      title: "Assessment Pack",
      meta,
      taskText: finalTask,
      rubricText: finalRubric
    });

    const reportJson = JSON.stringify(report, null, 2);
    const reportTxt =
      `ESL Assessment Validity Report\n` +
      `Generated: ${report.generatedAt}\n` +
      `Issue count: ${report.issueCount}\n` +
      `Mode: ${mode}\n\n` +
      `Meta:\n` +
      `- Skill: ${report.meta.skill || "-"}\n` +
      `- Framework: ${report.meta.framework || "-"}\n` +
      `- Level: ${report.meta.level || "-"}\n` +
      `- Purpose: ${report.meta.purpose || "-"}\n\n` +
      `Issues:\n` +
      (report.issues.length
        ? report.issues
            .map((i, idx) => `${idx + 1}. [${i.severity}] ${i.message}\n   Suggestion: ${i.suggestion}`)
            .join("\n")
        : "No issues found.\n") +
      `\n\nSuggestions:\n` +
      (report.suggestions.length
        ? report.suggestions.map((s, idx) => `${idx + 1}. ${s.message}`).join("\n")
        : "None.\n");

    const zipName = mode === "asis" || mode === "as-is"
      ? "Assessment-Pack-AS-IS.zip"
      : "Assessment-Pack-FIXED.zip";

    return sendZip({
      res,
      zipName,
      files: [
        { name: "Assessment-Pack.docx", buffer: docxBuffer },
        { name: "Validity-Report.json", text: reportJson },
        { name: "Validity-Report.txt", text: reportTxt }
      ]
    });
  } catch (err) {
    console.error("Autofix pack error:", err);
    res.status(500).json({ ok: false, error: "Autofix pack generation failed." });
  }
});

// ----------------------------
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
