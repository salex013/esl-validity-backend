require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { callGroq, liteValidity } = require("./llm");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: "5mb" }));

// In-memory history store (simple + safe for now)
const history = [];

/* ==============================
   HEALTH
============================== */
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    name: "ESL Validity Tool Backend",
    groqConfigured: !!process.env.GROQ_API_KEY,
    adminConfigured: !!process.env.ADMIN_KEY
  });
});

/* ==============================
   VALIDITY REPORT
============================== */
app.post("/api/report", async (req, res) => {
  try {
    const {
      skill,
      levelFramework,
      level,
      purpose,
      instructionsText,
      rubricText,
      mode = "lite"
    } = req.body;

    let result;

    if (mode === "groq") {
      if (!process.env.GROQ_API_KEY) {
        return res.status(500).json({
          ok: false,
          error: "Groq not configured on server."
        });
      }

      const messages = [
        {
          role: "system",
          content:
            "You are an ESL assessment validity expert. Provide structured JSON output only."
        },
        {
          role: "user",
          content: `
Skill: ${skill}
Framework: ${levelFramework}
Level: ${level}
Purpose: ${purpose}

Instructions:
${instructionsText}

Rubric:
${rubricText}

Evaluate validity (clarity, alignment, measurability).
Return structured JSON.
`
        }
      ];

      const content = await callGroq({
        apiKey: process.env.GROQ_API_KEY,
        messages
      });

      try {
        result = JSON.parse(content);
      } catch {
        result = { mode: "groq", raw: content };
      }
    } else {
      result = liteValidity({
        skill,
        levelFramework,
        level,
        purpose,
        instructionsText,
        rubricText
      });
    }

    history.unshift({
      id: Date.now(),
      createdAt: new Date().toISOString(),
      skill,
      levelFramework,
      level,
      purpose,
      result
    });

    res.json({ ok: true, result });

  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

/* ==============================
   DESIGN ASSESSMENT
============================== */
app.post("/api/design", async (req, res) => {
  try {
    const {
      skill,
      levelFramework,
      level,
      purpose,
      idea
    } = req.body;

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({
        ok: false,
        error: "Groq not configured."
      });
    }

    const messages = [
      {
        role: "system",
        content:
          "You are an ESL assessment design expert. Create strong, valid assessment instructions and rubric."
      },
      {
        role: "user",
        content: `
Design an ESL assessment.

Skill: ${skill}
Framework: ${levelFramework}
Level: ${level}
Purpose: ${purpose}

Teacher idea:
${idea}

Ensure validity, reliability, positive washback.
Return structured JSON with:
- instructions
- rubric (3-5 criteria with levels)
`
      }
    ];

    const content = await callGroq({
      apiKey: process.env.GROQ_API_KEY,
      messages
    });

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { raw: content };
    }

    res.json({ ok: true, result: parsed });

  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Design error" });
  }
});

/* ==============================
   EXTRACT TEXT (placeholder)
============================== */
app.post("/api/extract", async (req, res) => {
  res.json({
    ok: true,
    message: "Text extraction endpoint placeholder."
  });
});

/* ==============================
   ADMIN HISTORY
============================== */
app.get("/api/history", (req, res) => {
  const adminKey =
    req.header("x-admin-key") ||
    (req.header("authorization") || "").replace("Bearer ", "");

  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const limit = parseInt(req.query.limit || "20", 10);

  res.json({
    ok: true,
    count: history.length,
    items: history.slice(0, limit)
  });
});

/* ==============================
   START
============================== */
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
