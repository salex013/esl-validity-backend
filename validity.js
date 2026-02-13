// validity.js
const CATEGORIES = {
  construct: { label: "Construct Validity", weight: 3 },
  content: { label: "Content Validity", weight: 3 },
  reliability: { label: "Reliability", weight: 2 },
  washback: { label: "Washback", weight: 2 },
  fairness: { label: "Fairness & Accessibility", weight: 2 },
  practicality: { label: "Practicality", weight: 1 }
};

export function buildDashboard(text, meta = {}, rubricText = "") {
  const combined = `${text}\n\n${rubricText}`.toLowerCase();

  const hasRubric = /rubric|criteria|descriptor|level|band/.test(combined);
  const hasTime = /time|minutes|min\./.test(combined);
  const hasOutcomes =
    /clb|cefr|learning outcome|outcome|benchmark/.test(combined) ||
    (meta.courseOutcomes || "").trim().length > 0;
  const hasAccom = /accommodation|accessibility|alternate format|extra time/.test(combined);
  const vague = /\b(good|clear|strong|effective|appropriate)\b/.test(combined);

  const readingHeavy = /read (the following|the passage)|paragraph|article|essay/.test(combined);
  const writingHeavy = /write (a paragraph|an essay|full sentences)|justify your answers|explain in writing/.test(combined);

  const skill = (meta.skill || "").toLowerCase();
  const contamination =
    (skill === "speaking" && readingHeavy) ||
    (skill === "listening" && writingHeavy);

  // Category riskPct (0..1) — v1 heuristics
  const construct = clamp01((contamination ? 0.75 : 0.15) + (/(instructions|task|you will)/.test(combined) ? 0 : 0.15));
  const content = clamp01((hasOutcomes ? 0.15 : 0.70) + (/unit|lesson|topic|theme/.test(combined) ? 0 : 0.10));
  const reliability = clamp01((hasRubric ? 0.15 : 0.75) + (vague ? 0.45 : 0));
  const washback = clamp01((/memorize|script|recite/.test(combined) ? 0.70 : 0.20) + (/feedback|revise|improve|reflection/.test(combined) ? 0 : 0.10));
  const fairness = clamp01((hasAccom ? 0.20 : 0.70) + (/instructions/.test(combined) ? 0 : 0.10));
  const practicality = clamp01((hasTime ? 0.20 : 0.40));

  const weights = { construct:3, content:3, reliability:2, washback:2, fairness:2, practicality:1 };
  const weightedRisk =
    construct*weights.construct +
    content*weights.content +
    reliability*weights.reliability +
    washback*weights.washback +
    fairness*weights.fairness +
    practicality*weights.practicality;

  const maxWeighted = Object.values(weights).reduce((a,b)=>a+b,0);
  const overallRiskPct = weightedRisk / maxWeighted;
  const trustScore = Math.round(100 * (1 - overallRiskPct));

  const overallLabel =
    trustScore >= 80 ? "strong" :
    trustScore >= 60 ? "needs_tuning" :
    trustScore >= 40 ? "moderate_concern" : "high_concern";

  const alerts = [];
  if (contamination) alerts.push("Construct contamination risk (task may measure unintended skills).");
  if (!hasOutcomes) alerts.push("Alignment unclear (add outcomes/CLB descriptors explicitly).");
  if (!hasRubric || vague) alerts.push("Reliability risk (rubric missing or descriptors too vague).");
  if (!hasAccom) alerts.push("Fairness/accessibility risk (add accommodations/alternate formats).");

  const cats = [
    { key: CATEGORIES.construct.label, pct: construct },
    { key: CATEGORIES.content.label, pct: content },
    { key: CATEGORIES.reliability.label, pct: reliability },
    { key: CATEGORIES.washback.label, pct: washback },
    { key: CATEGORIES.fairness.label, pct: fairness },
    { key: CATEGORIES.practicality.label, pct: practicality },
  ];

  const fixFirst = [...cats]
    .sort((a,b)=>b.pct - a.pct)
    .slice(0,3)
    .map(c => ({
      name: c.key,
      note: fixSuggestion(c.key, { contamination, hasOutcomes, hasRubric, vague, hasAccom, hasTime })
    }));

  return {
    meta,
    trustScore,
    overallLabel,
    overallRiskPct,
    alerts,
    cats,
    fixFirst,
    signals: { hasRubric, hasTime, hasOutcomes, hasAccom, vague, contamination }
  };
}

function fixSuggestion(cat, s) {
  if (cat === "Construct Validity") {
    return s.contamination
      ? "Reduce reading/writing load that isn’t central to the target skill; simplify prompts or deliver orally."
      : "Confirm scoring focuses on the intended skill (avoid over-weighting grammar for communicative tasks).";
  }
  if (cat === "Content Validity") {
    return !s.hasOutcomes
      ? "Add explicit CLB/learning outcome links (in the doc + rubric headings)."
      : "Check task sampling: does it reflect what was practiced in class?";
  }
  if (cat === "Reliability") {
    return (!s.hasRubric || s.vague)
      ? "Use analytic rubric with observable descriptors (replace ‘good/clear/strong’ with evidence-based language)."
      : "Add scoring notes + standardize prompt conditions for consistency.";
  }
  if (cat === "Washback") {
    return "Add preparation guidance that promotes strategy practice (planning, self-correction) instead of memorization-only.";
  }
  if (cat === "Fairness & Accessibility") {
    return !s.hasAccom
      ? "Add accommodations/alternate formats statement + clarify supports allowed."
      : "Check cultural/tech load and ensure instructions are plain-language for the level.";
  }
  if (cat === "Practicality") {
    return !s.hasTime
      ? "Specify timing + administration conditions to reduce variability and workload surprises."
      : "Confirm scoring time is realistic (consider checklist + short analytic rubric).";
  }
  return "Refine this category based on flagged risks.";
}

function clamp01(x){ return Math.max(0, Math.min(1, x)); }
