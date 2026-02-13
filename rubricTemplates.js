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
        "Fully addresses the task; detailed and relevant; meaning consistently clear.",
        "Addresses the task; mostly relevant; meaning clear with minor lapses.",
        "Partially addresses the task; some unclear/off-topic; meaning sometimes breaks down.",
        "Does not address the task adequately; minimal/unclear; meaning often breaks down."
      ]},
      { name:"Fluency & Coherence", levels:[
        "Flows naturally; ideas logically connected; linking words used effectively.",
        "Generally smooth; some pauses; mostly organized; basic linking words used.",
        "Frequent pauses; ideas loosely connected; limited linking words.",
        "Very hesitant; hard to follow; minimal ability to connect ideas."
      ]},
      { name:"Vocabulary", levels:[
        "Range of topic vocabulary; precise meaning; minor errors only.",
        "Appropriate topic vocabulary; meaning usually clear; some imprecision.",
        "Limited range; repetitive; meaning sometimes unclear due to word choice.",
        "Very limited vocabulary; frequent breakdowns in meaning."
      ]},
      { name:"Grammar Control", levels:[
        "Variety of structures; errors minor and rarely affect meaning.",
        "Mostly correct basic structures; some errors but meaning remains clear.",
        "Frequent errors in basic structures; sometimes interfere with meaning.",
        "Persistent errors; meaning often difficult to understand."
      ]},
      { name:"Pronunciation", levels:[
        "Mostly easy to understand; minor issues do not interfere.",
        "Generally understandable; occasional listener strain; meaning mostly clear.",
        "Often difficult to understand; mispronunciations affect comprehension.",
        "Very difficult to understand; listener frequently cannot follow."
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
        "Fully addresses purpose/audience; ideas developed with relevant detail.",
        "Addresses purpose/audience; ideas have some development and support.",
        "Partially addresses purpose; limited development; some unclear ideas.",
        "Does not address purpose; minimal or unclear ideas."
      ]},
      { name:"Organization", levels:[
        "Clear structure; logical paragraphs; transitions guide the reader.",
        "Mostly organized; minor issues; basic transitions used.",
        "Inconsistent organization; weak transitions; reader confusion at times.",
        "Little organization; hard to follow; minimal transitions."
      ]},
      { name:"Vocabulary", levels:[
        "Range of appropriate vocabulary; precise word choice supports meaning.",
        "Appropriate vocabulary; some repetition or imprecision.",
        "Limited vocabulary; frequent repetition; clarity affected.",
        "Very limited vocabulary; meaning often unclear."
      ]},
      { name:"Grammar", levels:[
        "Varied sentence forms; errors minor and rarely affect understanding.",
        "Basic structures mostly correct; errors but meaning remains clear.",
        "Frequent errors; sometimes interfere with meaning.",
        "Persistent errors; meaning often unclear."
      ]},
      { name:"Mechanics", levels:[
        "Minor spelling/punctuation errors; readability strong.",
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
        "Finds many details; inferences sometimes weak.",
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
