export function buildDashboard(text, meta) {
  const lower = text.toLowerCase();

  const hasRubric = /rubric|criteria|level/.test(lower);
  const hasTime = /minute|time/.test(lower);
  const vague = /\b(good|clear|strong|effective|appropriate)\b/.test(lower);

  let risk = 0;
  if (!hasRubric) risk += 30;
  if (!hasTime) risk += 10;
  if (vague) risk += 20;

  const trustScore = Math.max(0, 100 - risk);

  return {
    trustScore,
    hasRubric,
    hasTime,
    vague
  };
}
