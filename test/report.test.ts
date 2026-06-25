import { describe, test, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectReport, renderReport, publicView } from "../src/report.js";

const tmps: string[] = [];
function tmp() {
  const d = mkdtempSync(join(tmpdir(), "sc-report-"));
  tmps.push(d);
  return d;
}
afterEach(() => {
  while (tmps.length) rmSync(tmps.pop()!, { recursive: true, force: true });
});

const SPEC = `
skill: ponytail
judge_persona: p
ship_bar: {total: 2, min_pass: 2, no_critical_fail: true}
critical: [A1]
scenarios:
  - id: A1
    title: hand-rolled max
    critical: true
    turns: ["x"]
    checklist: [ok]
  - id: C2
    title: already minimal
    turns: ["y"]
    checklist: [ok]
`;

function seedSkill(): string {
  const skillDir = tmp();
  mkdirSync(join(skillDir, "tests"), { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), "# ponytail");
  writeFileSync(join(skillDir, "tests", "specification.yaml"), SPEC);
  const runDir = join(skillDir, "tests", "results", "pi-fireworks-deepseek", "2026-06-25T12-00-00-000Z");
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, "A1.green.txt"), ">>> USER:\nx\n<<< ASSISTANT:\nuse max()");
  writeFileSync(
    join(runDir, "results.yaml"),
    `skill: ponytail
harness: pi
model: fireworks:deepseek
judge: {provider: fireworks, model: kimi}
timestamp: '2026-06-25T12:00:00.000Z'
grade: {passed: 2, total: 2, pct: 100, letter: A, ship: true, note: ''}
scenarios:
  - {id: A1, judge_verdict: PASS, judge_reason: points to max, override: null, note: ''}
  - {id: C2, judge_verdict: PASS, judge_reason: minimal, override: FAIL, note: 'I disagree'}
`
  );
  return skillDir;
}

describe("collectReport", () => {
  test("builds one column per model-tag with scenario cells", () => {
    const data = collectReport(seedSkill());
    expect(data.skill).toBe("ponytail");
    expect(data.scenarios.map((s) => s.id)).toEqual(["A1", "C2"]);
    expect(data.columns).toHaveLength(1);
    const col = data.columns[0];
    expect(col.label).toBe("fireworks:deepseek");
    expect(col.cells.A1.judge_verdict).toBe("PASS");
    expect(col.cells.C2.override).toBe("FAIL");
  });

  test("carries shipBar + critical for client-side re-grading", () => {
    const data = collectReport(seedSkill());
    expect(data.shipBar.min_pass).toBe(2);
    expect(data.critical).toEqual(["A1"]);
  });
});

describe("publicView", () => {
  test("omits absolute runDir paths", () => {
    const data = collectReport(seedSkill());
    const view = JSON.stringify(publicView(data));
    expect(view).not.toMatch(/runDir/);
    expect(view).not.toMatch(/\/tmp\//);
  });
});

describe("renderReport", () => {
  test("injects DATA json and skill name, leaving no placeholder", () => {
    const data = collectReport(seedSkill());
    const tmpl = readFileSync(join(process.cwd(), "assets", "report.template.html"), "utf8");
    const html = renderReport(tmpl, data);
    expect(html).not.toContain("/*__DATA__*/null");
    expect(html).not.toContain("__SKILL__");
    expect(html).toContain("const DATA = {");
    expect(html).toContain("ponytail");
  });
});
