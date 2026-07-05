import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintSkill } from "../src/lint.js";
import { writeResults, readResults } from "../src/index.js";
import yaml from "js-yaml";

const tmps: string[] = [];
function skill(specYaml: string, extra?: (dir: string) => void): string {
  const d = mkdtempSync(join(tmpdir(), "sc-lint-"));
  tmps.push(d);
  writeFileSync(join(d, "SKILL.md"), "---\nname: x\n---\n", "utf8");
  mkdirSync(join(d, "tests"), { recursive: true });
  writeFileSync(join(d, "tests", "specification.yaml"), specYaml, "utf8");
  extra?.(d);
  return d;
}
afterEach(() => { while (tmps.length) rmSync(tmps.pop()!, { recursive: true, force: true }); });

const GOOD = `skill: demo\njudge_persona: a judge.\nship_bar: { total: 1, min_pass: 1 }\ncritical: [A1]\nscenarios:\n  - id: A1\n    title: t\n    turns: ["hi"]\n    checklist: ["ok"]\n`;

describe("lintSkill static checks", () => {
  it("clean spec → no findings", () => {
    expect(lintSkill(skill(GOOD))).toEqual([]);
  });
  it("invalid spec → one code:spec finding (does not throw)", () => {
    const f = lintSkill(skill(`skill: demo\n`)); // missing judge_persona/ship_bar/scenarios
    expect(f).toHaveLength(1);
    expect(f[0].code).toBe("spec");
  });
  it("ship_bar min_pass > total → ship_bar finding", () => {
    const f = lintSkill(skill(`skill: d\njudge_persona: j.\nship_bar: { total: 1, min_pass: 2 }\nscenarios:\n  - id: A1\n    title: t\n    turns: ["h"]\n    checklist: ["ok"]\n`));
    expect(f.some((x) => x.code === "ship_bar" && /min_pass/.test(x.message))).toBe(true);
  });
  it("ship_bar total > scenario count → ship_bar finding", () => {
    const f = lintSkill(skill(`skill: d\njudge_persona: j.\nship_bar: { total: 5, min_pass: 1 }\nscenarios:\n  - id: A1\n    title: t\n    turns: ["h"]\n    checklist: ["ok"]\n`));
    expect(f.some((x) => x.code === "ship_bar" && /total/.test(x.message))).toBe(true);
  });
  it("unknown critical id → critical finding", () => {
    const f = lintSkill(skill(`skill: d\njudge_persona: j.\nship_bar: { total: 1, min_pass: 1 }\ncritical: [ZZ]\nscenarios:\n  - id: A1\n    title: t\n    turns: ["h"]\n    checklist: ["ok"]\n`));
    expect(f.some((x) => x.code === "critical" && /ZZ/.test(x.message))).toBe(true);
  });
  it("seeded fixture dir missing → fixture finding", () => {
    const y = `skill: d\njudge_persona: j.\nship_bar: { total: 1, min_pass: 1 }\nscenarios:\n  - id: A1\n    title: t\n    mode: seeded\n    fixture: fixtures/missing\n    turns: ["h"]\n    checklist: ["ok"]\n`;
    const f = lintSkill(skill(y));
    expect(f.some((x) => x.code === "fixture" && x.scenario === "A1")).toBe(true);
  });
  it("seeded fixture dir present → no fixture finding", () => {
    const y = `skill: d\njudge_persona: j.\nship_bar: { total: 1, min_pass: 1 }\nscenarios:\n  - id: A1\n    title: t\n    mode: seeded\n    fixture: fixtures/repo\n    turns: ["h"]\n    checklist: ["ok"]\n`;
    const d = skill(y, (dir) => mkdirSync(join(dir, "tests", "fixtures", "repo"), { recursive: true }));
    expect(lintSkill(d).some((x) => x.code === "fixture")).toBe(false);
  });
});

function withRun(skillDir: string, scenarios: any[], tamper?: (r: any) => void) {
  const runDir = join(skillDir, "tests", "results", "pi-fake", "2026-07-01T00-00-00Z");
  mkdirSync(runDir, { recursive: true });
  // write a consistent results.yaml via the real writer:
  writeResults(runDir, {
    skill: "demo", harness: "pi", model: "fireworks:fake",
    judge: { provider: "anthropic", model: "opus" }, timestamp: "2026-07-01T00:00:00Z",
    label: null, mode: "green", scenarios,
  }, { shipBar: { total: 1, min_pass: 1, no_critical_fail: true }, critical: ["A1"] });
  if (tamper) {
    const r = readResults(runDir);
    tamper(r);
    writeFileSync(join(runDir, "results.yaml"), yaml.dump(r), "utf8");
  }
  return runDir;
}

describe("lintSkill results-consistency", () => {
  const clean = [{ id: "A1", judge_verdict: "PASS", judge_reason: "ok", suspect: false, override: null, note: "" }];
  it("no committed results → consistency skipped (no findings)", () => {
    expect(lintSkill(skill(GOOD)).some((x) => x.code === "consistency")).toBe(false);
  });
  it("consistent results → no consistency finding", () => {
    const d = skill(GOOD); withRun(d, clean);
    expect(lintSkill(d).some((x) => x.code === "consistency")).toBe(false);
  });
  it("tampered effective_grade → consistency finding", () => {
    const d = skill(GOOD);
    withRun(d, clean, (r) => { r.effective_grade.pct = 0; r.effective_grade.ship = false; });
    expect(lintSkill(d).some((x) => x.code === "consistency" && /grade/.test(x.message))).toBe(true);
  });
  it("override without note → consistency finding", () => {
    const d = skill(GOOD);
    withRun(d, [{ id: "A1", judge_verdict: "FAIL", judge_reason: "x", suspect: false, override: "PASS", note: "" }]);
    expect(lintSkill(d).some((x) => x.code === "consistency" && /override/.test(x.message) && /note/.test(x.message))).toBe(true);
  });
});
