export function getRubricTemplate(meta = {}) {
  const skill = (meta.skill || "").toLowerCase();

  if (skill === "speaking") return speaking(meta);
  if (skill === "writing") return writing(meta);
  if (skill === "listening") return listening(meta);
  if (skill === "reading") return reading(meta);

  return generic(meta);
}

function speaking(meta) {
  return {
    title: `Analytic Rubric (Speaking) — ${meta.level || ""}`,
    bands: ["4 - Exceeds", "3 - Meets", "2 - Approaches", "1 - Needs Work"],
    criteria: [
      { name:"Task Achievement", levels:[
        "Fully addresses the task; responses are detailed and relevant; meaning is consistently clear.",
        "Addresses the task; responses are mostly relevant; meaning is clear with minor lapses.",
        "Partially addresses the task; some responses are unclear or off-topic; meaning sometimes breaks down.",
        "Does not address the task adequately; responses are minimal or unclear; meaning often breaks down."
      ]},
      { name:"Fluency & Coherence", levels:[
        "Speech flows naturally; ideas are logically connected; uses linking words effectively.",
        "Generally smooth; some pauses; ideas are mostly organized; uses basic linking words.",
        "Frequent pauses; ideas may be repetitive or loosely connected; limited linking words.",
        "Very hesitant; hard to follow; limited ability to connect ideas."
      ]},
      { name:"Vocabulary", levels:[
        "Uses a range of topic vocabulary; word choice supports precise meaning; occasional minor errors.",
        "Uses appropriate topic vocabulary; meaning is usually clear; some imprecise word choice.",
        "Limited range; repetitive word choice; meaning sometimes unclear due to word choice.",
        "Very limited vocabulary; frequent breakdowns in meaning."
      ]},
      { name:"Grammar Control", levels:[
        "Uses a variety of structures; errors are minor and rarely affect meaning.",
        "Uses basic structures with some variety; errors occur but meaning remains clear.",
        "Frequent errors in basic structures; errors sometimes interfere with meaning.",
        "Persistent errors; meaning is often difficult to understand."
      ]},
      { name:"Pronunciation", levels:[
        "Mostly easy to understand; pronunciation supports communication; minor issues do not interfere.",
        "Generally understandable; occasional strain for listener; meaning remains mostly clear.",
        "Often difficult to understand; frequent mispronunciations affect comprehension.",
        "Very difficult to understand; listener frequently cannot follow meaning."
      ]}
    ]
  };
}

function writing(meta) {
  return {
    title: `Analytic Rubric (Writing) — ${meta.level || ""}`,
    bands: ["4 - Exceeds", "3 - Meets", "2 - Approaches", "1 - Needs Work"],
    criteria: [
      { name:"Task Achievement", levels:[
        "Fully addresses purpose and audience; ideas are developed with relevant details.",
        "Addresses purpose and audience; ideas have some development and support.",
        "Partially addresses purpose; limited development; some irrelevant or unclear ideas.",
        "Does not address purpose; minimal or unclear ideas."
      ]},
      { name:"Organization", levels:[
        "Clear structure; paragraphs/sections are logical; linking words guide the reader.",
        "Mostly organized; some minor issues; uses basic transitions.",
        "Organization is inconsistent; weak transitions; reader may get confused.",
        "Little organization; hard to follow; minimal transitions."
      ]},
      { name:"Vocabulary", levels:[
        "Uses a range of appropriate vocabulary; word choice supports precise meaning.",
        "Uses appropriate vocabulary; occasional repetition or imprecise word choice.",
        "Limited vocabulary; frequent repetition; imprecision affects clarity.",
        "Very limited vocabulary; meaning is often unclear."
      ]},
      { name:"Grammar", levels:[
        "Varied sentence forms; errors are minor and rarely affect understanding.",
        "Mostly correct basic structures; some errors but meaning remains clear.",
        "Frequent errors; errors sometimes interfere with meaning.",
        "Persistent errors; meaning often unclear."
      ]},
      { name:"Mechanics", levels:[
        "Minor spelling/punctuation errors; readability is strong.",
        "Some errors; generally readable.",
        "Frequent errors; readability affected.",
        "Errors significantly reduce readability."
      ]}
    ]
  };
}

function listening(meta) {
  return {
    title: `Listening Criteria — ${meta.level || ""}`,
    bands: ["4 - Exceeds", "3 - Meets", "2 - Approaches", "1 - Needs Work"],
    criteria: [
      { name:"Main Ideas", levels:[
        "Identifies main ideas accurately and consistently.",
        "Usually identifies main ideas with minor gaps.",
        "Sometimes identifies main ideas; frequent gaps.",
        "Rarely identifies main ideas accurately."
      ]},
      { name:"Key Details", levels:[
        "Accurately identifies key supporting details.",
        "Identifies many details; some inaccuracies.",
        "Limited detail understanding; frequent inaccuracies.",
        "Very limited understanding of details."
      ]},
      { name:"Strategies", levels:[
        "Uses strategies effectively (predicting, note-taking, checking).",
        "Uses some strategies; effectiveness varies.",
        "Limited strategy use; needs prompting.",
        "Does not use strategies; struggles to follow."
      ]}
    ]
  };
}

function reading(meta) {
  return {
    title: `Reading Criteria — ${meta.level || ""}`,
    bands: ["4 - Exceeds", "3 - Meets", "2 - Approaches", "1 - Needs Work"],
    criteria: [
      { name:"Main Ideas & Purpose", levels:[
        "Accurately identifies main ideas and author purpose.",
        "Usually identifies main ideas; minor gaps.",
        "Sometimes identifies main ideas; confusion is common.",
        "Rarely identifies main ideas."
      ]},
      { name:"Details & Inference", levels:[
        "Accurately locates details and makes reasonable inferences.",
        "Finds many details; inferences are sometimes weak.",
        "Finds limited details; inferences often incorrect.",
        "Struggles to locate details or infer meaning."
      ]},
      { name:"Vocabulary in Context", levels:[
        "Uses context clues effectively to interpret unknown words.",
        "Sometimes uses context clues; occasional errors.",
        "Limited use of context clues; frequent errors.",
        "Cannot interpret unknown vocabulary using context."
      ]}
    ]
  };
}

function generic(meta) {
  return {
    title: `Analytic Rubric — ${meta.level || ""}`,
    bands: ["4 - Exceeds", "3 - Meets", "2 - Approaches", "1 - Needs Work"],
    criteria: [
      { name:"Task Achievement", levels:[
        "Fully meets task requirements with clear evidence.",
        "Meets most requirements with adequate evidence.",
        "Partially meets requirements; limited evidence.",
        "Does not meet requirements; minimal evidence."
      ]},
      { name:"Clarity & Organization", levels:[
        "Well organized; easy to follow.",
        "Mostly organized; minor lapses.",
        "Inconsistent organization; hard to follow at times.",
        "Disorganized; difficult to follow."
      ]}
    ]
  };
}
