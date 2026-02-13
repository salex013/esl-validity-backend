// validity.js
// Lightweight heuristic scoring for ESL assessment validity.
// Deterministic + transparent (no LLM calls).

function clamp01(n) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function pct(n) {
  return clamp01(n);
}

function hasAny(text, needles) {
  const t = (text || "").toLowerCase();
  return needles.some((n) => t.includes(n));
}

function countAny(text, needles) {
  const t = (text || "").toLowerCase();
  let c = 0;
  for (const n of needles) if (t.includes(n)) c++;
  return c;
}

function extractCriteria(rubricText) {
  const t = (rubricText || "").replace(/\s+/g, " ").trim();
  // Try "Criteria:" list
  const m = t.match(/criteria\s*:\s*([^\.]+)\./i);
  if (m && m[1]) {
    return m[1].split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10);
  }
  // Fallback: comma-separated first line
  const firstLine = (rubricText || "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)[0] || "";
  const parts = firstLine.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2 && parts.length <= 10) return parts.slice(0, 10);
  return [];
}

function scoreAssessment({ extractedText, meta, rubricText }) {
  const task = (extractedText || "").trim();
  const rubric = (rubricText || "").trim();
  const skill = (meta?.skill || "").toString();
  const level = (meta?.level || "").toString();
  const purpose = (meta?.purpose || "").toString();

  // Signals
  const hasRubric = !!rubric;
  const hasTime = hasAny(task, ["minute", "minutes", "min", "time:", "timed", "duration"]);
  const hasOutcomes = hasAny(task + " " + rubric, [
    "clb",
    "can do",
    "learning outcome",
    "outcome",
    "benchmark",
    "descriptor"
  ]);
  const hasAccom = hasAny(task + " " + rubric, [
    "accommodation",
    "accommodations",
    "extra time",
    "assistive",
    "alternative format",
    "accessibility",
    "aoda"
  ]);
  const vague =
    countAny(task + " " + rubric, [
      "good",
      "nice",
      "better",
      "best",
      "excellent",
      "ok",
      "adequate",
      "poor"
    ]) >= 3;

  const contamination =
    skill.toLowerCase() === "speaking"
      ? hasAny(task, ["write", "paragraph", "essay", "reading passage"])
      : skill.toLowerCase() === "writing"
        ? hasAny(task, ["presentation", "oral", "speaking"])
        : false;

  const signals = { hasRubric, hasTime, hasOutcomes, hasAccom, vague, contamination };

  // Category scoring (0..1)
  let construct = 0.65;
  if (!skill) construct -= 0.1;
  if (!hasOutcomes) construct -= 0.15;
  if (contamination) construct -= 0.25;
  if (purpose.toLowerCase() === "placement") construct -= 0.05;
  construct = pct(construct);

  let content = 0.7;
  if (!hasOutcomes) content -= 0.2;
  if (task.length < 80) content -= 0.1;
  if (rubric && rubric.length < 80) content -= 0.05;
  content = pct(content);

  let reliability = 0.6;
  if (!hasRubric) reliability -= 0.25;
  if (!hasTime) reliability -= 0.1;
  if (vague) reliability -= 0.15;
  reliability = pct(reliability);

  let washback = 0.35;
  if (hasAny(task + " " + rubric, ["strategy", "self-correction", "reflection", "draft", "revise", "practice"]))
    washback += 0.25;
  if (purpose.toLowerCase() === "formative") washback += 0.15;
  washback = pct(washback);

  let fairness = 0.7;
  if (!hasAccom) fairness -= 0.25;
  if (hasAny(task, ["only", "must", "no help", "no support"]) && purpose.toLowerCase() !== "placement")
    fairness -= 0.1;
  fairness = pct(fairness);

  let practicality = 0.45;
  if (hasTime) practicality += 0.15;
  if (hasAny(task, ["materials:", "resources:", "record", "device"])) practicality += 0.1;
  practicality = pct(practicality);

  const cats = [
    { key: "Construct Validity", pct: construct },
    { key: "Content Validity", pct: content },
    { key: "Reliability", pct: reliability },
    { key: "Washback", pct: washback },
    { key: "Fairness & Accessibility", pct: fairness },
    { key: "Practicality", pct: practicality }
  ];

  // Overall risk: weighted average of "risk" (1 - pct)
  const weights = {
    "Construct Validity": 0.25,
    "Content Validity": 0.2,
    "Reliability": 0.2,
    "Washback": 0.1,
    "Fairness & Accessibility": 0.15,
    "Practicality": 0.1
  };

  let risk = 0;
  let wsum = 0;
  for (const c of cats) {
    const w = weights[c.key] || 0;
    risk += (1 - c.pct) * w;
    wsum += w;
  }
  const overallRiskPct = wsum ? clamp01(risk / wsum) : 0.5;

  // Trust score (0..100)
  let trustScore = Math.round((1 - overallRiskPct) * 100);
  if (!hasRubric) trustScore -= 8;
  if (!hasOutcomes) trustScore -= 8;
  if (contamination) trustScore -= 6;
  if (!hasAccom) trustScore -= 6;
  trustScore = Math.max(0, Math.min(100, trustScore));

  let overallLabel = "good";
  if (trustScore < 70) overallLabel = "needs_tuning";
  if (trustScore < 50) overallLabel = "high_concern";

  const alerts = [];
  if (contamination) alerts.push("Construct contamination risk (task may measure unintended skills).");
  if (!hasOutcomes) alerts.push("Alignment unclear (add outcomes/CLB descriptors explicitly).");
  if (!hasRubric || vague) alerts.push("Reliability risk (rubric missing or descriptors too vague).");
  if (!hasAccom) alerts.push("Fairness/accessibility risk (add accommodations/alternate formats).");

  const fixMap = {
    "Construct Validity":
      "Reduce extra skill load that isn’t central to the target construct; simplify prompts or allow oral delivery.",
    "Content Validity":
      "Add explicit CLB/learning outcome links (in the task + rubric headings) and ensure coverage matches the construct.",
    "Reliability":
      "Tighten descriptors (observable behaviors), standardize admin conditions, and add clear scoring rules/examples.",
    "Washback":
      "Add practice-oriented criteria (strategies, reflection) and feedback guidance aligned to the learning goals.",
    "Fairness & Accessibility":
      "Add accommodations statement + clarify supports allowed; consider alternate formats and flexible timing.",
    "Practicality":
      "Specify time, materials, and steps; streamline administration and scoring."
  };

  const fixFirst = [...cats]
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 3)
    .map((c) => ({ name: c.key, note: fixMap[c.key] }));

  const criteria = extractCriteria(rubricText);

  return {
    meta: { skill, level, purpose },
    trustScore,
    overallLabel,
    overallRiskPct,
    alerts,
    cats,
    fixFirst,
    signals,
    extracted: { criteria }
  };
}

module.exports = { scoreAssessment };
