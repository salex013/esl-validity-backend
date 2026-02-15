// src/validity.js

async function runValidity({ skill, levelFramework, level, purpose, instructionsText, rubricText }) {

  // Basic validation
  if (!skill || !levelFramework || !level) {
    throw new Error("Missing required fields")
  }

  // Simple structured output (you can plug Groq here later)
  return {
    summary: `This ${skill} task aligns with ${levelFramework} Level ${level}.`,
    strengths: [
      "Clear task purpose",
      "Appropriate performance expectations"
    ],
    improvements: [
      "Clarify rubric descriptors",
      "Specify measurable outcomes"
    ],
    overallRating: "Appropriate with minor refinements suggested"
  }
}

module.exports = runValidity
