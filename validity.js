// src/validity.js
'use strict';

// Uses Groq OpenAI-compatible API when mode="groq"
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_BASE_URL = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

function requiredFieldsReport(input) {
  const missing = [];
  const need = ['skill', 'levelFramework', 'level', 'purpose', 'instructionsText', 'rubricText'];
  for (const k of need) {
    if (!input?.[k] || String(input[k]).trim().length === 0) missing.push(k);
  }
  return missing;
}

function liteReport(input) {
  const missing = requiredFieldsReport(input);

  const issues = [];
  if (missing.length) {
    issues.push(`Missing required fields: ${missing.join(', ')}`);
  }

  // Very lightweight heuristics
  if (input?.instructionsText && String(input.instructionsText).length < 40) {
    issues.push('Instructions are very short; may be unclear for students.');
  }
  if (input?.rubricText && String(input.rubricText).length < 30) {
    issues.push('Rubric text is very short; may not be measurable.');
  }

  const strengths = [];
  if (input?.instructionsText) strengths.push('Instructions provided.');
  if (input?.rubricText) strengths.push('Rubric provided.');

  const suggestions = [];
  if (!/time|minute/i.test(input?.instructionsText || '')) {
    suggestions.push('Consider adding a time limit (e.g., 3 minutes) to make expectations clearer.');
  }
  if (!/criteria|clarity|organization|vocabulary|pronunciation/i.test(input?.rubricText || '')) {
    suggestions.push('Consider listing 3–5 clear criteria (e.g., clarity, organization, vocabulary, pronunciation).');
  }

  return {
    mode: 'lite',
    summary: missing.length
      ? 'Basic check found missing fields and/or short text.'
      : 'No major issues detected by lite checks.',
    strengths,
    issues,
    suggestions,
    scores: {
      clarity: missing.length ? 0 : 2,
      alignment: missing.length ? 0 : 2,
      measurability: missing.length ? 0 : 1,
      fairness_accessibility: 1,
      overall: missing.length ? 0 : 2,
    },
    riskLevel: missing.length ? 'high' : issues.length ? 'medium' : 'low',
    metadata: {
      skill: input?.skill,
      levelFramework: input?.levelFramework,
      level: input?.level,
      purpose: input?.purpose,
    },
  };
}

async function groqChatJSON(systemPrompt, userPrompt) {
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not set on the server.');
  }

  const resp = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`Groq error ${resp.status}: ${txt || resp.statusText}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content || '';

  // Extract JSON safely (handles extra text around it)
  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('Model did not return JSON.');
  }

  const jsonStr = content.slice(firstBrace, lastBrace + 1);
  return JSON.parse(jsonStr);
}

async function groqReport(input) {
  const systemPrompt =
    `You are an expert ESL/EAP assessment designer and evaluator. ` +
    `Return ONLY valid JSON (no markdown).`;

  const userPrompt = `
Evaluate the following assessment for validity and quality.
Return JSON with:
{
  "summary": string,
  "strengths": [string],
  "issues": [string],
  "suggestions": [string],
  "scores": {
    "clarity": 0-3,
    "alignment": 0-3,
    "measurability": 0-3,
    "fairness_accessibility": 0-3,
    "overall": 0-3
  },
  "riskLevel": "low"|"medium"|"high",
  "metadata": {
    "skill": string,
    "levelFramework": string,
    "level": string,
    "purpose": string
  }
}

Assessment input:
skill: ${String(input?.skill || '')}
levelFramework: ${String(input?.levelFramework || '')}
level: ${String(input?.level || '')}
purpose: ${String(input?.purpose || '')}

instructionsText:
${String(input?.instructionsText || '')}

rubricText:
${String(input?.rubricText || '')}
`.trim();

  const out = await groqChatJSON(systemPrompt, userPrompt);

  // Minimal normalization / safety
  out.metadata = out.metadata || {
    skill: input?.skill,
    levelFramework: input?.levelFramework,
    level: input?.level,
    purpose: input?.purpose,
  };
  out.scores = out.scores || {};
  out.mode = 'groq';

  return out;
}

async function runReport(input, opts = {}) {
  const mode = (opts.mode || 'groq').toLowerCase() === 'lite' ? 'lite' : 'groq';

  if (mode === 'lite') return liteReport(input);

  // Groq mode with fallback to lite if something goes wrong
  try {
    return await groqReport(input);
  } catch (e) {
    const fallback = liteReport(input);
    fallback.mode = 'lite';
    fallback.summary = `Groq failed; returned lite fallback. (${e?.message || 'unknown error'})`;
    return fallback;
  }
}

module.exports = { runReport };
