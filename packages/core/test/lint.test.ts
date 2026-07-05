import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintSkill } from "../src/lint.js";

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
