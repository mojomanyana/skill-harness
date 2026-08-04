import { describe, test, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Script } from "node:vm";
import { collectReport, renderReport, publicView, type ReportData } from "../src/report.js";

const readTemplate = () => readFileSync(join(process.cwd(), "assets", "report.template.html"), "utf8");
const readGradeScript = () => readFileSync(join(process.cwd(), "assets", "report.grade.js"), "utf8");

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
  - {id: A1, judge_verdict: PASS, judge_reason: points to max, override: null, note: '', reps: 5, passes: 4, clean: 4, flakiness: 0.4}
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

  test("collectReport surfaces reps/passes/clean/flakiness on the cell", () => {
    const data = collectReport(seedSkill());
    const cell = data.columns[0].cells.A1;
    expect(cell.reps).toBe(5);
    expect(cell.passes).toBe(4);
    expect(cell.clean).toBe(4);
    expect(cell.flakiness).toBe(0.4);
    // A cell with no reps recorded (N=1) leaves the fields undefined.
    expect(data.columns[0].cells.C2.reps).toBeUndefined();
    expect(data.columns[0].cells.C2.clean).toBeUndefined();
  });

  test("carries shipBar + critical for client-side re-grading", () => {
    const data = collectReport(seedSkill());
    expect(data.shipBar.min_pass).toBe(2);
    expect(data.critical).toEqual(["A1"]);
  });
});

describe("rendered report is valid JavaScript", () => {
  /**
   * Compile (never execute) every inline <script> in the rendered report.
   *
   * This guard exists because a `continue` inside a `forEach` callback shipped in
   * the template through 0.1.x and 0.2.0: a SyntaxError that takes down the whole
   * inline script, so `review` served a page whose matrix never rendered. Every
   * test around it passed, because they all asserted on the HTML *string* —
   * nothing ever asked whether the JavaScript could parse.
   */
  function compileInlineScripts(html: string): number {
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(scripts.length).toBeGreaterThan(0);
    for (const src of scripts) {
      // `new Script` compiles as a top-level script, so an illegal continue (or a
      // stray top-level return) throws exactly as it would in the browser.
      // Nothing is executed, so no DOM is needed.
      new Script(src);
    }
    return scripts.length;
  }

  test("the template's inline script parses", () => {
    const html = renderReport(readTemplate(), collectReport(seedSkill()), readGradeScript());
    expect(compileInlineScripts(html)).toBeGreaterThan(0);
  });

  test("it parses with no runs at all (empty columns)", () => {
    const skillDir = tmp();
    mkdirSync(join(skillDir, "tests"), { recursive: true });
    writeFileSync(join(skillDir, "tests", "specification.yaml"), SPEC);
    const html = renderReport(readTemplate(), collectReport(skillDir), readGradeScript());
    expect(compileInlineScripts(html)).toBeGreaterThan(0);
  });

  test("it still parses with lift data present", () => {
    const skillDir = seedSkill();
    const redDir = join(skillDir, "tests", "results", "pi-fireworks-deepseek", "2026-06-25T11-00-00-000Z");
    mkdirSync(redDir, { recursive: true });
    writeFileSync(
      join(redDir, "results.yaml"),
      `schema: 2
skill: ponytail
harness: pi
model: fireworks:deepseek
judge: {provider: fireworks, model: kimi}
timestamp: '2026-06-25T11:00:00.000Z'
label: null
mode: red
effective_grade: {passed: 0, total: 0, pct: 0, letter: '-', ship: false, note: ''}
scenarios:
  - {id: A1, judge_verdict: FAIL, judge_reason: b, suspect: false, override: null, note: ''}
  - {id: C2, judge_verdict: PASS, judge_reason: b, suspect: false, override: null, note: ''}
`
    );
    const html = renderReport(readTemplate(), collectReport(skillDir), readGradeScript());
    expect(compileInlineScripts(html)).toBeGreaterThan(0);
    expect(html).toMatch(/lift/);
  });
});

describe("collectReport lift", () => {
  /** Add a red baseline run to a seeded skill, under the same model tag. */
  function addRedRun(skillDir: string, a1: string, c2: string): void {
    const redDir = join(skillDir, "tests", "results", "pi-fireworks-deepseek", "2026-06-25T11-00-00-000Z");
    mkdirSync(redDir, { recursive: true });
    writeFileSync(
      join(redDir, "results.yaml"),
      `schema: 2
skill: ponytail
harness: pi
model: fireworks:deepseek
judge: {provider: fireworks, model: kimi}
timestamp: '2026-06-25T11:00:00.000Z'
label: null
mode: red
effective_grade: {passed: 0, total: 0, pct: 0, letter: '-', ship: false, note: 'mode=red (not scored)'}
scenarios:
  - {id: A1, judge_verdict: ${a1}, judge_reason: baseline, suspect: false, override: null, note: ''}
  - {id: C2, judge_verdict: ${c2}, judge_reason: baseline, suspect: false, override: null, note: ''}
`
    );
  }

  test("attaches lift to the column once a red baseline exists", () => {
    const skillDir = seedSkill();
    addRedRun(skillDir, "FAIL", "PASS");
    const col = collectReport(skillDir).columns[0];
    // green: A1 PASS, C2 PASS-but-overridden-to-FAIL
    expect(col.lift).toBeDefined();
    expect(col.lift!.gained).toBe(1); // A1: FAIL -> PASS
    expect(col.lift!.regressed).toBe(1); // C2: PASS -> effective FAIL via override
    expect(col.liftHeadline).toMatch(/gained/);
  });

  test("leaves lift undefined with no red baseline — never a fabricated zero", () => {
    const col = collectReport(seedSkill()).columns[0];
    expect(col.lift).toBeUndefined();
    expect(col.liftHeadline).toBeUndefined();
  });

  test("publicView carries lift through without leaking paths", () => {
    const skillDir = seedSkill();
    addRedRun(skillDir, "FAIL", "FAIL");
    const view = publicView(collectReport(skillDir));
    expect(view.columns[0].lift!.gained).toBe(1);
    expect(JSON.stringify(view)).not.toMatch(/\/tmp\//);
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

describe("publicView reps", () => {
  test("surfaces reps/passes/clean/flakiness on the cell payload unstripped", () => {
    const data: ReportData = {
      skill: "ponytail",
      shipBar: { total: 2, min_pass: 2, no_critical_fail: true },
      critical: ["A1"],
      scenarios: [{ id: "A1", title: "hand-rolled max", critical: true }],
      columns: [
        {
          index: 0,
          label: "fireworks:deepseek",
          tag: "pi-fireworks-deepseek",
          runDir: "/tmp/should-not-leak",
          timestamp: "2026-06-25T12:00:00.000Z",
          mode: "green",
          grade: { passed: 0, total: 0, pct: 0, letter: "F", ship: false, note: "" },
          judge: { provider: "fireworks", model: "kimi" },
          cells: {
            A1: {
              judge_verdict: "FAIL",
              judge_reason: "flaky",
              suspect: true,
              reps: 5,
              passes: 4,
              clean: 4,
              flakiness: 0.4,
              override: null,
              note: "",
            },
          },
        },
      ],
    };
    const view = publicView(data);
    const cell = view.columns[0].cells.A1;
    expect(cell.reps).toBe(5);
    expect(cell.passes).toBe(4);
    expect(cell.clean).toBe(4);
    expect(cell.flakiness).toBe(0.4);
    const json = JSON.stringify(view);
    expect(json).toMatch(/"flakiness":0\.4/);
    expect(json).toMatch(/"clean":4/);
  });
});

describe("renderReport", () => {
  test("injects DATA json, grade script, and skill name, leaving no placeholder", () => {
    const data = collectReport(seedSkill());
    const tmpl = readFileSync(join(process.cwd(), "assets", "report.template.html"), "utf8");
    const gradeScript = readFileSync(join(process.cwd(), "assets", "report.grade.js"), "utf8");
    const html = renderReport(tmpl, data, gradeScript);
    expect(html).not.toContain("/*__DATA__*/null");
    expect(html).not.toContain("/*__GRADE__*/");
    expect(html).not.toContain("__SKILL__");
    expect(html).not.toContain("export function"); // export stripped for inline <script> validity
    expect(html).toContain("const DATA = {");
    expect(html).toContain("function gradeColumn(");
    expect(html).toContain("ponytail");
  });

  test("renders the Trends UI section, fully substituted", () => {
    const data = collectReport(seedSkill());
    const tmpl = readFileSync(join(process.cwd(), "assets", "report.template.html"), "utf8");
    const gradeScript = readFileSync(join(process.cwd(), "assets", "report.grade.js"), "utf8");
    const html = renderReport(tmpl, data, gradeScript);
    expect(html).toContain('id="trends-section"');
    expect(html).toContain('id="trends-toggle"');
    expect(html).toContain("renderTrends");
    expect(html).toContain("sparkline");
    expect(html).not.toContain("/*__DATA__*/null");
    expect(html).not.toContain("/*__GRADE__*/");
  });
});
