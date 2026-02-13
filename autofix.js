export function autoFix(text, meta, dashboard) {
  let revised = text;

  revised = revised.replace(/\bgood\b/gi, "generally accurate and appropriate");
  revised = revised.replace(/\bclear\b/gi, "easy to understand with minor lapses");
  revised = revised.replace(/\bstrong\b/gi, "consistent and well-supported");

  const standardization = `
Standardization Notes:
Skill: ${meta.skill}
Level: ${meta.level}
Purpose: ${meta.purpose}

- Clearly specify time limits.
- Clarify supports allowed.
- Score observable performance evidence.
`;

  return {
    revisedText: revised,
    standardization
  };
}
