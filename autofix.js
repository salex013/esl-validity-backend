const express = require("express");
const router = express.Router();
const { Document, Packer, Paragraph, HeadingLevel, TextRun } = require("docx");

// Optional OpenAI (safe usage)
let OpenAI;
try {
  OpenAI = require("openai");
} catch (e) {
  console.log("OpenAI not installed — using rule-based only.");
}

const openai = process.env.OPENAI_API_KEY && OpenAI
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;


/* =====================================================
   RULE-BASED REWRITE (always available fallback)
===================================================== */

function ruleBasedRewrite(text, meta) {
  return `
Improved Assessment Version

Skill: ${meta.skill}
Level: ${meta.level}
Purpose: ${meta.purpose}

Refined Task Description:
Students will prepare and deliver a structured 3-minute presentation on a community issue of their choice. 
They must clearly introduce the issue, explain its impact, and propose at least one possible solution.

Assessment Criteria:
- Fluency and clarity of speech
- Appropriate vocabulary for CLB level
- Accurate pronunciation
- Logical organization of ideas
`;
}


/* =====================================================
   AI REWRITE (if key exists)
===================================================== */

async function aiRewrite(text, meta, rubricText) {
  const prompt = `
You are an ESL assessment specialist.

Original assessment:
${text}

Rubric:
${rubricText}

Meta:
Skill: ${meta.skill}
Level: ${meta.level}
Purpose: ${meta.purpose}

Rewrite this assessment to:
- Improve clarity
- Align tightly with rubric criteria
- Match CLB level expectations
- Be professional and structured
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
  });

  return response.choices[0].message.content;
}


/* =====================================================
   ROUTE
===================================================== */

router.post("/", async (req, res) => {
  try {
    const { extractedText, meta, rubricText } = req.body;

    if (!extractedText) {
      return res.status(400).json({ ok: false, error: "No extractedText provided" });
    }

    let rewritten;

    // Try AI if available
    if (openai) {
      try {
        rewritten = await aiRewrite(extractedText, meta, rubricText);
      } catch (aiError) {
        console.log("AI failed — using rule-based fallback");
        rewritten = ruleBasedRewrite(extractedText, meta);
      }
    } else {
      rewritten = ruleBasedRewrite(extractedText, meta);
    }

    // Build DOCX
    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              text: "Assessment Pack",
              heading: HeadingLevel.HEADING_1,
            }),
            new Paragraph(" "),
            new Paragraph({
              children: [new TextRun(rewritten)],
            }),
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="Assessment-Pack.docx"'
    );

    return res.send(buffer);

  } catch (error) {
    console.error("Autofix error:", error);
    return res.status(500).json({
      ok: false,
      error: "Autofix pack generation failed.",
    });
  }
});

module.exports = router;
