import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType
} from "docx";

export async function buildDocx(meta, fix, dashboard) {
  const children = [];

  children.push(new Paragraph({ text: "Improved Assessment Package (v1)", heading: HeadingLevel.TITLE }));
  children.push(p(`Skill: ${meta.skill} | Level: ${meta.level} | Purpose: ${meta.purpose}`));
  children.push(p(`Trust Score: ${dashboard.trustScore}/100 | Overall: ${labelToHuman(dashboard.overallLabel)}`));
  children.push(spacer());

  children.push(new Paragraph({ text: "Dashboard Alerts", heading: HeadingLevel.HEADING_2 }));
  if (dashboard.alerts?.length) {
    for (const a of dashboard.alerts) children.push(p(`• ${a}`));
  } else {
    children.push(p("• No major red flags detected in v1 scan."));
  }

  children.push(spacer());
  children.push(new Paragraph({ text: "Category Risks (v1 estimate)", heading: HeadingLevel.HEADING_2 }));
  for (const c of dashboard.cats || []) {
    children.push(p(`${c.key}: ${Math.round((c.pct || 0) * 100)}% risk`));
  }

  children.push(spacer());
  children.push(new Paragraph({ text: "Standardization & Administration Notes", heading: HeadingLevel.HEADING_2 }));
  children.push(...blockToParas(fix.standardization));

  children.push(spacer());
  children.push(new Paragraph({ text: "Revised Assessment Text", heading: HeadingLevel.HEADING_2 }));
  children.push(...blockToParas(fix.revisedText));

  children.push(spacer());
  children.push(new Paragraph({ text: "Rubric", heading: HeadingLevel.HEADING_2 }));
  if (fix.revisedRubric.kind === "pasted") {
    children.push(...blockToParas(fix.revisedRubric.text));
  } else {
    children.push(new Paragraph({ text: fix.revisedRubric.template.title, heading: HeadingLevel.HEADING_3 }));
    children.push(rubricToTable(fix.revisedRubric.template));
  }

  children.push(spacer());
  children.push(new Paragraph({ text: "Change Log (v1)", heading: HeadingLevel.HEADING_2 }));
  children.push(...blockToParas(JSON.stringify(fix.changeLog, null, 2)));

  const doc = new Document({
    sections: [{ children }]
  });

  return await Packer.toBuffer(doc);
}

function p(text) {
  return new Paragraph({ children: [new TextRun({ text: String(text || ""), size: 22 })] });
}

function spacer() {
  return new Paragraph({ text: "" });
}

function blockToParas(block) {
  return String(block || "")
    .split("\n")
    .map(line => new Paragraph({ children: [new TextRun({ text: line, size: 22 })] }));
}

function rubricToTable(rubric) {
  const bands = rubric.bands || ["4", "3", "2", "1"];
  const criteria = rubric.criteria || [];

  const headerRow = new TableRow({
    children: [cell("Criteria"), ...bands.map(cell)]
  });

  const rows = criteria.map(c => new TableRow({
    children: [
      cell(c.name || ""),
      ...(c.levels || []).slice(0, bands.length).map(cell)
    ]
  }));

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...rows]
  });
}

function cell(text) {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text: String(text || ""), size: 22 })] })]
  });
}

function labelToHuman(label) {
  const map = {
    strong: "Strong",
    needs_tuning: "Needs tuning",
    moderate_concern: "Moderate concern",
    high_concern: "High concern"
  };
  return map[label] || label;
}
