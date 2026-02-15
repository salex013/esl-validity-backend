// src/autofix.js

async function runAutofix({ instructionsText, rubricText }) {

  return {
    improvedInstructions: instructionsText
      ? instructionsText + "\n\nPlease ensure instructions are measurable and aligned to criteria."
      : "",

    improvedRubric: rubricText
      ? rubricText + "\n\nDescriptors should clearly distinguish performance levels."
      : ""
  }
}

module.exports = runAutofix
