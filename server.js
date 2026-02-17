import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json({ limit: "3mb" }));

const PORT = process.env.PORT || 3000;
const GROQ_KEY = (process.env.GROQ_API_KEY || "").trim();

/* ------------------------------
   Helpers
--------------------------------*/

function ok(res, payload) {
  res.json({ ok: true, ...payload });
}
function fail(res, code, message, details) {
  res.status(code).json({ ok: false, error: message, details });
}

function requireGroq(res) {
  if (!GROQ_KEY) {
    fail(res, 500, "GROQ_API_KEY is not set on the server.");
    return false;
  }
  return true;
}

/**
 * Extract the first valid JSON object from a string.
 * Handles models that wrap JSON in text/code fences.
 */
function extractJsonObject(text) {
  if (!text) return null;

  // Strip code fences if present
  const cleaned = text
    .replace(/```json/gi, "```")
    .replace(/```/g, "")
    .trim();

  // Find first "{" and then try to parse a balanced object
  const start = cleaned.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (depth === 0) {
      const candidate = cleaned.slice(start, i + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function callGroqJson({ system, user, temperature = 0.2 }) {
  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_KEY}`,
    },
    body: JSON.stringify({
      model: "mixtral-8x7b-32768",
      temperature,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  const data = await resp.json();

  if (!resp.ok) {
    throw new Error(
      data?.error?.message || `Groq error: ${resp.status} ${resp.statusText}`
    );
  }

  const text = data?.choices?.[0]?.message?.content || "";
  const json = extractJsonObject(text);

  return { raw: text, json };
}

/* ------------------------------
   JSON Schemas (what we force the model to return)
--------------------------------*/

const SYSTEM_JSON_ONLY = `
You are an expert ESL assessment designer and language testing specialist.
You must return ONLY valid JSON.
No markdown. No explanations. No code fences.
All strings must be properly escaped.
If something is unknown, return an empty string.
`;

// Shared rubric table shape (renderable like SLATE)
const RUBRIC_TABLE_SHAPE = `
Rubric table format:
rubric = {
  "title": string,
  "columns": [
    {"key":"exceeds","label":"Exceeds expectations (80%+)"}, 
    {"key":"meets","label":"Meets expectations (70–79%)"},
    {"key":"developing","label":"Needs some improvement (60–69%)"},
    {"key":"notyet","label":"Did not achieve (59% or lower)"}
  ],
  "rows": [
    {
      "criterion": string,
      "outOf": string, 
      "descriptors": {
        "exceeds": string,
        "meets": string,
        "developing": string,
        "notyet": string
      }
    }
  ]
}
`;

// Validity scan report shape
const ANALYZE_SCHEMA = `
Return JSON with this exact top-level structure:
{
  "meta": {
    "framework": string,
    "level": string,
    "skill": string,
    "purpose": string
  },
  "scores": {
    "alignment": {"rating": number, "notes": string},
    "constructValidity": {"rating": number, "notes": string},
    "contentValidity": {"rating": number, "notes": string},
    "fairnessAccessibility": {"rating": number, "notes": string},
    "washback": {"rating": number, "notes": string},
    "practicality": {"rating": number, "notes": string},
    "reliabilityProxy": {"rating": number, "notes": string}
  },
  "issues": [
    {"category": string, "severity": "low"|"medium"|"high", "evidence": string, "fix": string}
  ],
  "recommendations": [
    {"priority": 1|2|3, "action": string, "rationale": string}
  ],
  "improved": {
    "instructions": {
      "title": string,
      "studentFacing": string,
      "teacherNotes": string
    },
    "rubric": <rubric table object>
  },
  "report": {
    "summary": string,
    "detailed": string
  }
}
Also include the rubric table object exactly as described below:
${RUBRIC_TABLE_SHAPE}
`;

// Build-new schema
const GENERATE_SCHEMA = `
Return JSON with this exact top-level structure:
{
  "meta": {
    "framework": string,
    "level": string,
    "skill": string,
    "purpose": string,
    "assessmentType": string
  },
  "package": {
    "instructions": {
      "title": string,
      "studentFacing": string,
      "teacherNotes": string
    },
    "rubric": <rubric table object>,
    "validityRationale": {
      "alignment": string,
      "construct": string,
      "washback": string,
      "fairnessAccessibility": string,
      "practicality": string,
      "reliabilityProxy": string
    }
  }
}
Also include the rubric table object exactly as described below:
${RUBRIC_TABLE_SHAPE}
`;

/* ------------------------------
   Routes
--------------------------------*/

app.get("/", (req, res) => {
  ok(res, {
    name: "ESL Validity Tool Backend",
    timestamp: new Date().toISOString(),
    groqConfigured: Boolean(GROQ_KEY),
  });
});

app.get("/api/health", (req, res) => {
  ok(res, { groqConfigured: Boolean(GROQ_KEY) });
});

app.get("/api/routes", (req, res) => {
  // Quick way to “see what handlers exist”
  const routes = [];
  app._router.stack.forEach((m) => {
    if (m.route) {
      const methods = Object.keys(m.route.methods).map((x) => x.toUpperCase());
      routes.push({ path: m.route.path, methods });
    }
  });
  ok(res, { routes });
});

/**
 * Build NEW package (your "Build" mode)
 * Expects:
 * {
 *   "meta": { skill, levelFramework, level, purpose, assessmentType, description, learningOutcomes }
 * }
 */
app.post("/api/generate", async (req, res) => {
  try {
    if (!requireGroq(res)) return;

    const meta = req.body?.meta || {};
    const {
      skill = "",
      levelFramework = "",
      level = "",
      purpose = "",
      assessmentType = "",
      description = "",
      learningOutcomes = "",
    } = meta;

    const user = `
Create a professional ESL assessment package.

Context:
- Skill: ${skill}
- Framework: ${levelFramework}
- Level: ${level}
- Purpose: ${purpose}
- Assessment type: ${assessmentType}

Task prompt / description:
${description}

Learning outcomes:
${learningOutcomes}

Requirements:
- Instructions must be student-facing, clear, and formatted with headings + bullets.
- Rubric must be a table with 4 performance bands.
- Criteria must match the skill and be observable.
- Include teacher notes (admin / scoring guidance).
- Add validity rationale text (alignment, construct, washback, fairness, practicality, reliability proxy).

${GENERATE_SCHEMA}
`;

    const { raw, json } = await callGroqJson({
      system: SYSTEM_JSON_ONLY,
      user,
      temperature: 0.2,
    });

    if (!json) {
      return fail(res, 502, "Model did not return valid JSON.", { raw });
    }

    ok(res, { data: json });
  } catch (err) {
    fail(res, 500, "Server error in /api/generate", { message: err.message });
  }
});

/**
 * Scan + improve EXISTING assessment (your "Scan" mode)
 * Expects:
 * {
 *   "meta": { framework, level, skill, purpose },
 *   "instructions": "text...",
 *   "rubric": "text..."
 * }
 */
app.post("/api/analyze", async (req, res) => {
  try {
    if (!requireGroq(res)) return;

    const meta = req.body?.meta || {};
    const instructions = (req.body?.instructions || "").toString();
    const rubric = (req.body?.rubric || "").toString();

    const framework = meta.framework || meta.levelFramework || "";
    const level = meta.level || "";
    const skill = meta.skill || "";
    const purpose = meta.purpose || "";

    const user = `
Analyze and improve the following ESL assessment materials.

Context:
- Skill: ${skill}
- Framework: ${framework}
- Level: ${level}
- Purpose: ${purpose}

EXISTING INSTRUCTIONS:
${instructions}

EXISTING RUBRIC:
${rubric}

Tasks:
1) Score and explain: alignment, construct validity, content validity, fairness/accessibility, washback, practicality, reliability proxy.
2) Identify concrete issues with evidence and fixes.
3) Produce improved versions:
   - Professional student instructions (clean headings and bullets)
   - Professional rubric as a table (4 bands, observable descriptors)

${ANALYZE_SCHEMA}
`;

    const { raw, json } = await callGroqJson({
      system: SYSTEM_JSON_ONLY,
      user,
      temperature: 0.2,
    });

    if (!json) {
      return fail(res, 502, "Model did not return valid JSON.", { raw });
    }

    ok(res, { data: json });
  } catch (err) {
    fail(res, 500, "Server error in /api/analyze", { message: err.message });
  }
});

// 404
app.use((req, res) => {
  fail(res, 404, "Route not found");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log("GROQ_API_KEY set:", Boolean(GROQ_KEY));
});
