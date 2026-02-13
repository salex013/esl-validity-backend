app.post("/api/autofix", async (req, res) => {
  try {
    const { extractedText, meta, rubricText } = req.body;

    if (!extractedText || !meta || !rubricText) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    // --- AI REWRITE ---
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert ESL assessment designer aligned with CLB descriptors."
        },
        {
          role: "user",
          content: `
Rewrite and improve this ESL assessment instruction clearly and professionally.
Skill: ${meta.skill}
Level: ${meta.level}
Purpose: ${meta.purpose}

Assessment Instructions:
${extractedText}

Rubric:
${rubricText}

Provide:
1. Improved Instructions
2. Improved Rubric
`
        }
      ]
    });

    const aiText = aiResponse.choices[0].message.content;

    // --- CREATE DOCX ---
    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              text: "ESL Assessment Pack",
              heading: HeadingLevel.HEADING_1
            }),
            new Paragraph(" "),
            new Paragraph({
              text: "Original Assessment Instructions",
              heading: HeadingLevel.HEADING_2
            }),
            new Paragraph(extractedText),
            new Paragraph(" "),
            new Paragraph({
              text: "Original Rubric",
              heading: HeadingLevel.HEADING_2
            }),
            new Paragraph(rubricText),
            new Paragraph(" "),
            new Paragraph({
              text: "AI Improved Version",
              heading: HeadingLevel.HEADING_2
            }),
            new Paragraph(aiText)
          ]
        }
      ]
    });

    const buffer = await Packer.toBuffer(doc);

    // CRITICAL: correct headers
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=Assessment-Pack.docx"
    );
    res.setHeader("Content-Length", buffer.length);

    return res.end(buffer);

  } catch (error) {
    console.error("AUTOFIX ERROR:", error);
    return res.status(500).json({ error: "Document generation failed." });
  }
});
