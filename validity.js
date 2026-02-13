function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function toText(x) {
  return (x || "").toString().trim();
}

function hasAny(text, needles) {
  const t = text.toLowerCase();
  return needles.some((n) => t.includes(n));
}

function pct(n) {
  return clamp(Math.round(n), 0, 100);
}

function scoreAssessment({ extractedText, rubricText, meta }) {
  const task = toText(extractedText);
  const rubric = toText(rubricText);

  const skill = (meta?.skill || "").toString();
  const level = (meta?.level || "").toString();
  const purpose = (meta?.purpose || "").toString();

  // Signals (very explainable / heuristic — good for teacher-facing tools)
  const signals = {
    hasRubric: rubric.length > 20,
    hasTime: hasAny(task, ["minute", "minutes", "min", "time:", "timed", "duration"]),
    hasOutcomes: hasAny(task + " " + rubric, ["clb", "canadian language benchmarks", "learning outcome", "outcome:", "descriptor"]),
    hasAccom: hasAny(task + " " + rubric, ["accommodation", "accommodations", "extra time", "support", "alternate format", "assistive", "caption", "screen reader"]),
    vague: !hasAny(task, ["you will", "students will", "task:", "instructions", "steps", "deliver", "record", "write", "present", "submit"]) || task.length < 80,
    contamination: hasAny(task, ["essay", "academic paragraph", "research paper", "citations"]) && (skill.toLowerCase().includes("speaking") || skill.toLowerCase().includes("listening"))
  };

  // Category scores (higher = better)
  // Start from 50 and add/subtract using signals.
  let construct = 50;
  if (signals.hasOutcomes) construct += 15;
  if (!signals.vague) construct += 10;
  if (signals.contamination) construct -= 20;
  if (!signals.hasRubric) construct -= 15;

  let content = 50;
  if (signals.hasOutcomes) content += 20;
  if (signals.hasRubric) content += 10;
  if (task.length > 200) content += 5;
  if (signals.vague) content -= 15;

  let reliability = 50;
  if (signals.hasRubric) reliability += 20;
  if (hasAny(rubric, ["level", "4", "3", "2", "1", "meets", "approaches", "exceeds"])) reliability += 10;
  if (hasAny(rubric, ["clear", "specific", "observable"])) reliability += 5;
  if (!signals.hasRubric) reliability -= 25;
  if (signals.vague) reliability -= 10;

  let washback = 50;
  // positive washback cues
  if (hasAny(task, ["draft", "revise", "self-check", "peer feedback", "practice", "reflection"])) washback += 15;
  // negative washback cues
  if (hasAny(task, ["memorize", "no notes", "no practice"])) washback -= 10;

  let fairness = 50;
  if (signals.hasAccom) fairness += 25;
  if (hasAny(task + " " + rubric, ["plain language", "examples", "model", "visual", "rubric shared"])) fairness += 10;
  if (!signals.hasAccom) fairness -= 15;

  let practicality = 50;
  if (signals.hasTime) practicality += 15;
  if (hasAny(task, ["materials", "resources", "technology needed", "room setup"])) practicality += 10;
  if (task.length > 1200) practicality -= 10;

  construct = pct(construct);
  content = pct(content);
  reliability = pct(reliability);
  washback = pct(washback);
  fairness = pct(fairness);
  practicality = pct(practicality);

  const categoryScores = {
    constructValidity: construct,
    contentValidity: content,
    reliability,
    washback,
    fairnessAccessibility: fairness,
    practicality
  };

  // Overall trust score: weighted
  const trustScore = pct(
    0.22 * construct +
      0.22 * content +
      0.20 * reliability +
      0.14 * fairness +
      0.12 * practicality +
      0.10 * washback
  );

  // Overall risk = inverse trust + penalties for key red flags
  let overallRiskPct = 100 - trustScore;
  if (!signals.hasRubric) overallRiskPct += 10;
  if (!signals.hasOutcomes) overallRiskPct += 10;
  if (!signals.hasAccom) overallRiskPct += 6;
  if (signals.contamination) overallRiskPct += 8;
  overallRiskPct = pct(overallRiskPct);

  const overallLabel =
    trustScore >= 80 ? "strong" :
    trustScore >= 65 ? "moderate" :
    trustScore >= 50 ? "needs_tuning" :
    "high_concern";

  const alerts = [];
  if (signals.contamination) alerts.push("Construct contamination risk (task may measure unintended skills).");
  if (!signals.hasOutcomes) alerts.push("Alignment unclear (add outcomes/CLB descriptors explicitly).");
  if (!signals.hasRubric || reliability < 60) alerts.push("Reliability risk (rubric missing or descriptors too vague).");
  if (!signals.hasAccom || fairness < 60) alerts.push("Fairness/accessibility risk (add accommodations/alternate formats).");
  if (!signals.hasTime) alerts.push("Practicality risk (time/duration not specified).");

  // “Fix first” = lowest 3 categories with short guidance
  const fixMap = [
    { key: "contentValidity", label: "Content Validity", note: "Add explicit CLB/learning outcome links (in task + rubric headings)." },
    { key: "fairnessAccessibility", label: "Fairness & Accessibility", note: "Add accommodations/alternate formats statement + clarify supports allowed." },
    { key: "constructValidity", label: "Construct Validity", note: "Reduce reading/writing load that isn’t central to the target skill; simplify prompts." },
    { key: "reliability", label: "Reliability", note: "Make rubric descriptors observable; add anchors/examples; reduce ambiguous wording." },
    { key: "washback", label: "Washback", note: "Add practice + feedback loop (draft → revise → reflect) to encourage learning-focused behaviors." },
    { key: "practicality", label: "Practicality", note: "Specify time, materials, administration steps, and scoring time expectations." }
  ];

  const sorted = [...fixMap].sort((a, b) => categoryScores[a.key] - categoryScores[b.key]);
  const fixFirst = sorted.slice(0, 3).map((x) => `${x.label} — ${x.note}`);

  // Handy “dashboard payload”
  return {
    ok: true,
    meta: { skill, level, purpose },
    trustScore,
    overallLabel,
    overallRiskPct,
    categoryScores: {
      "Construct Validity": construct,
      "Content Validity": content,
      "Reliability": reliability,
      "Washback": washback,
      "Fairness & Accessibility": fairness,
      "Practicality": practicality
    },
    alerts,
    fixFirst,
    signals
  };
}

module.exports = { scoreAssessment };
