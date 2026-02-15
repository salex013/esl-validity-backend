// src/autofix.js
'use strict';

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_BASE_URL = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

function liteAutofix(input) {
  const instructionsText = String(input?.instructionsText || '').trim();
  const rubricText = String(input?.rubricText || '').trim();

  const improvedInstructions =
    instructionsText ||
    'Students will complete the task described below. Include a clear time limit, required content, and what to submit.';

  const improvedRubric =
    rubricText ||
    'Assessed on clarity, organization, vocabulary, and pronunciation. (Add 3 performance levels: developing / competent / strong.)';

  const notes = [];
  if (!/time|minute/i.test(improvedInstructions)) notes.push('Add a time limit (e.g., 2–3 minutes).');
  if (!/submit|record|present|write/i.test(improvedInstructions)) notes.push('Add what students must submit/do.');
  if (improvedRubric.length < 60) notes.push('Rubric is short; add 3 levels and descriptors.');

  return {
    mode: 'lite',
    fixed: {
      instructionsText: improvedInstructions,
      rubricText: improvedRubric,
    },
    notes,
  };
}

async function groqChatJSON(systemPrompt, userPrompt) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY is not set on the server.');

  const resp = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.3,
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

  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('Model did not return JSON.');
  }

  return JSON.parse(content.slice(firstBrace, lastBrace + 1));
}

async function groqAutofix(input) {
  const systemPrompt =
    `You are an expert ESL assessment editor. Return ONLY valid JSON (no markdown).`;

  const userPrompt = `
Improve the assessment instructions and rubric to be clearer, measurable, and CLB/CEFR-friendly.
Return JSON in this shape:
{
  "fixed": {
    "instructionsText": string,
    "rubricText": string
  },
  "notes": [string]
}

Input:
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
  out.mode = 'groq';
  return out;
}

async function runAutofix(input, opts = {}) {
  const mode = (opts.mode || 'groq').toLowerCase() === 'lite' ? 'lite' : 'groq';
  if (mode === 'lite') return liteAutofix(input);

  try {
    return await groqAutofix(input);
  } catch (e) {
    const fallback = liteAutofix(input);
    fallback.mode = 'lite';
    fallback.notes = [
      ...(fallback.notes || []),
      `Groq failed; returned lite fallback. (${e?.message || 'unknown error'})`,
    ];
    return fallback;
  }
}

module.exports = { runAutofix };
