import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintSkill } from "../src/lint.js";
import { createWorkspace } from "../src/workspace.js";
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
  it("ship_bar.total non-positive (0) → ship_bar finding", () => {
    const f = lintSkill(skill(`skill: d\njudge_persona: j.\nship_bar: { total: 0, min_pass: 1 }\nscenarios:\n  - id: A1\n    title: t\n    turns: ["h"]\n    checklist: ["ok"]\n`));
    expect(f.some((x) => x.code === "ship_bar" && /total must be >= 1/.test(x.message))).toBe(true);
  });
  it("ship_bar.min_pass non-positive (0) → ship_bar finding", () => {
    const f = lintSkill(skill(`skill: d\njudge_persona: j.\nship_bar: { total: 1, min_pass: 0 }\nscenarios:\n  - id: A1\n    title: t\n    turns: ["h"]\n    checklist: ["ok"]\n`));
    expect(f.some((x) => x.code === "ship_bar" && /min_pass must be >= 1/.test(x.message))).toBe(true);
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
  describe("mistyped fixture markers", () => {
    const seededSpec = `skill: d\njudge_persona: j.\nship_bar: { total: 1, min_pass: 1 }\nscenarios:\n  - id: A1\n    title: t\n    mode: seeded\n    fixture: fixtures/repo\n    turns: ["h"]\n    checklist: ["ok"]\n`;

    /** A seeded skill whose fixture contains the given top-level directories. */
    function withFixtureDirs(...dirs: string[]): string {
      return skill(seededSpec, (dir) => {
        const fx = join(dir, "tests", "fixtures", "repo");
        mkdirSync(fx, { recursive: true });
        writeFileSync(join(fx, "a.ts"), "1\n", "utf8");
        for (const d of dirs) mkdirSync(join(fx, d), { recursive: true });
      });
    }

    it("a one-letter typo yields exactly one finding, with the right suggestion", () => {
      const f = lintSkill(withFixtureDirs("_uncommited")).filter((x) => x.code === "fixture-marker");
      expect(f).toHaveLength(1);
      expect(f[0].scenario).toBe("A1");
      expect(f[0].message).toContain("`_uncommited/`");
      expect(f[0].message).toContain("did you mean `_uncommitted/`?");
    });

    it("catches a case-only difference", () => {
      const f = lintSkill(withFixtureDirs("_Staged")).filter((x) => x.code === "fixture-marker");
      expect(f).toHaveLength(1);
      expect(f[0].message).toContain("did you mean `_staged/`?");
    });

    it("the real markers are never flagged", () => {
      expect(lintSkill(withFixtureDirs("_staged", "_uncommitted")).filter((x) => x.code === "fixture-marker")).toEqual([]);
    });

    it("leaves __dunder__ directories alone — they are ordinary content", () => {
      // A blanket ^_ rule would reject fixtures that legitimately carry __tests__
      // or __pycache__. Only a SINGLE leading underscore is a marker claim.
      expect(lintSkill(withFixtureDirs("__tests__", "__pycache__")).filter((x) => x.code === "fixture-marker")).toEqual([]);
    });

    it("ignores nested markers — markers are top-level only, by design", () => {
      const d = skill(seededSpec, (dir) => {
        const fx = join(dir, "tests", "fixtures", "repo");
        mkdirSync(join(fx, "pkg", "_uncommited"), { recursive: true });
      });
      // workspace.ts treats `pkg/_staged/` as ordinary content, so flagging it here
      // would be a false positive on a fixture the runtime accepts.
      expect(lintSkill(d).filter((x) => x.code === "fixture-marker")).toEqual([]);
    });

    it("names a far-off directory without inventing a suggestion", () => {
      const f = lintSkill(withFixtureDirs("_helpers")).filter((x) => x.code === "fixture-marker");
      expect(f).toHaveLength(1);
      expect(f[0].message).toContain("`_helpers/`");
      expect(f[0].message).not.toContain("did you mean");
    });

    it("reports every offender, deterministically ordered", () => {
      const f = lintSkill(withFixtureDirs("_uncommited", "_stagd")).filter((x) => x.code === "fixture-marker");
      expect(f).toHaveLength(2);
      expect(f.map((x) => x.message.match(/`(_[a-zA-Z]+)\/`/)![1])).toEqual(["_stagd", "_uncommited"]);
    });

    it("lint flags exactly what createWorkspace refuses — the two can never disagree", () => {
      // If lint were more lenient, it would bless a fixture the runtime then rejects
      // mid-run; if stricter, it would block a fixture that works.
      const d = withFixtureDirs("_uncommited");
      const fx = join(d, "tests", "fixtures", "repo");
      expect(lintSkill(d).some((x) => x.code === "fixture-marker")).toBe(true);
      expect(() => createWorkspace({ fixture: fx }, { specDir: "/x" })).toThrow(/unknown marker directory/);
    });
  });

  it("assert.post_test missing → fixture finding (free lint beats a paid run)", () => {
    // A missing post-test fails its scenario at run time, but only after a full
    // model run has been paid for. lint is the offline gate that catches it first.
    const y = `skill: d\njudge_persona: j.\nship_bar: { total: 1, min_pass: 1 }\nscenarios:\n  - id: A1\n    title: t\n    mode: seeded\n    fixture: fixtures/repo\n    turns: ["h"]\n    checklist: ["ok"]\n    assert:\n      post_test: post/A1.test.ts\n`;
    const d = skill(y, (dir) => mkdirSync(join(dir, "tests", "fixtures", "repo"), { recursive: true }));
    const f = lintSkill(d);
    expect(f.some((x) => x.code === "fixture" && x.scenario === "A1" && /post_test not found/.test(x.message))).toBe(true);
  });
  it("assert.post_test present → no finding", () => {
    const y = `skill: d\njudge_persona: j.\nship_bar: { total: 1, min_pass: 1 }\nscenarios:\n  - id: A1\n    title: t\n    mode: seeded\n    fixture: fixtures/repo\n    turns: ["h"]\n    checklist: ["ok"]\n    assert:\n      post_test: post/A1.test.ts\n`;
    const d = skill(y, (dir) => {
      mkdirSync(join(dir, "tests", "fixtures", "repo"), { recursive: true });
      mkdirSync(join(dir, "tests", "post"), { recursive: true });
      writeFileSync(join(dir, "tests", "post", "A1.test.ts"), "// hidden gate\n", "utf8");
    });
    expect(lintSkill(d).some((x) => x.code === "fixture")).toBe(false);
  });
  it("a post_test directory is not a file → still a finding", () => {
    const y = `skill: d\njudge_persona: j.\nship_bar: { total: 1, min_pass: 1 }\nscenarios:\n  - id: A1\n    title: t\n    mode: seeded\n    fixture: fixtures/repo\n    turns: ["h"]\n    checklist: ["ok"]\n    assert:\n      post_test: post\n`;
    const d = skill(y, (dir) => {
      mkdirSync(join(dir, "tests", "fixtures", "repo"), { recursive: true });
      mkdirSync(join(dir, "tests", "post"), { recursive: true });
    });
    expect(lintSkill(d).some((x) => x.code === "fixture" && /post_test not found/.test(x.message))).toBe(true);
  });
  it("dangling symlink under tests/results/ does not throw (never-throws contract)", () => {
    const d = skill(GOOD, (dir) => {
      const resultsRoot = join(dir, "tests", "results");
      mkdirSync(resultsRoot, { recursive: true });
      symlinkSync("/nonexistent", join(resultsRoot, "badlink"));
    });
    expect(() => lintSkill(d)).not.toThrow();
    expect(lintSkill(d)).toEqual([]);
  });
});

function withRun(
  skillDir: string,
  scenarios: any[],
  tamper?: (r: any) => void,
  tag = "pi-fake",
  ts = "2026-07-01T00-00-00Z",
) {
  const runDir = join(skillDir, "tests", "results", tag, ts);
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
  it("override WITH note and a preserved transcript → no consistency finding", () => {
    const d = skill(GOOD);
    const runDir = withRun(d, [
      { id: "A1", judge_verdict: "FAIL", judge_reason: "x", suspect: false, override: "PASS", note: "resolved: looks fine" },
    ]);
    writeFileSync(join(runDir, "A1.green.txt"), "transcript", "utf8");
    expect(lintSkill(d).some((x) => x.code === "consistency")).toBe(false);
  });
  it("schema-2 results.yaml with override key OMITTED (undefined) → no false consistency finding", () => {
    const d = skill(GOOD);
    withRun(d, clean, (r) => { delete r.scenarios[0].override; });
    expect(lintSkill(d).some((x) => x.code === "consistency")).toBe(false);
  });
  it("consistency findings accumulate across multiple run dirs (different tag/timestamp)", () => {
    const d = skill(GOOD);
    withRun(d, clean, undefined, "pi-fake", "2026-07-01T00-00-00Z"); // consistent
    withRun(d, clean, (r) => { r.effective_grade.pct = 0; r.effective_grade.ship = false; }, "pi-other", "2026-07-02T00-00-00Z"); // tampered
    const findings = lintSkill(d).filter((x) => x.code === "consistency");
    expect(findings.some((x) => /2026-07-02T00-00-00Z/.test(x.message))).toBe(true);
    expect(findings.some((x) => /2026-07-01T00-00-00Z/.test(x.message))).toBe(false);
  });
  it("malformed schema-2 results.yaml (scenarios: null) → consistency finding, does not throw", () => {
    const d = skill(GOOD);
    const runDir = join(d, "tests", "results", "pi-fake", "2026-07-01T00-00-00Z");
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, "results.yaml"), yaml.dump({ schema: 2, scenarios: null }), "utf8");
    expect(() => lintSkill(d)).not.toThrow();
    const f = lintSkill(d);
    expect(f.some((x) => x.code === "consistency" && /unreadable or malformed/.test(x.message))).toBe(true);
  });
  it("unparseable results.yaml (merge-conflict markers) → consistency finding, does not throw", () => {
    const d = skill(GOOD);
    const runDir = join(d, "tests", "results", "pi-fake", "2026-07-01T00-00-00Z");
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, "results.yaml"), "<<<<<<< HEAD\nfoo: 1\n=======\nfoo: 2\n>>>>>>> branch\n", "utf8");
    expect(() => lintSkill(d)).not.toThrow();
    const f = lintSkill(d);
    expect(f.some((x) => x.code === "consistency" && /unreadable or malformed/.test(x.message))).toBe(true);
  });
  it("schema-1 results.yaml is skipped (no false-positive)", () => {
    const d = skill(GOOD);
    const runDir = join(d, "tests", "results", "pi-fake", "2026-07-01T00-00-00Z");
    mkdirSync(runDir, { recursive: true });
    // Raw v1 shape (no `schema` key) per migrateResults in results.ts: top-level `grade`
    // (not `effective_grade`), scenarios carry judge_verdict/override/note directly.
    // The grade below is deliberately WRONG relative to a v2 recompute of the scenario
    // (PASS should score ship:true/pct:100) — proving the schema-1 skip, not a lucky match.
    const v1 = {
      skill: "demo", harness: "pi", model: "fireworks:fake",
      judge: { provider: "anthropic", model: "opus" },
      timestamp: "2026-07-01T00:00:00Z",
      grade: { passed: 0, total: 1, pct: 0, letter: "F", ship: false, note: "mode=green" },
      scenarios: [{ id: "A1", judge_verdict: "PASS", judge_reason: "ok", override: null, note: "" }],
    };
    writeFileSync(join(runDir, "results.yaml"), yaml.dump(v1), "utf8");
    expect(lintSkill(d).some((x) => x.code === "consistency")).toBe(false);
  });
});

describe("consistency vs spec growth", () => {
  it("a run predating a spec reshape (different scenario set) is not consistency-flagged", async () => {
    const { mkdtempSync, cpSync, readFileSync: rf, writeFileSync: wf } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join: j, dirname: dn } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const { parseSpec, runSkillModel } = await import("../src/index.js");
    const here = dn(fileURLToPath(import.meta.url));
    const skillDir = mkdtempSync(j(tmpdir(), "sc-growth-"));
    cpSync(j(here, "fixtures", "golden-skill"), skillDir, { recursive: true });
    const specPath = j(skillDir, "tests", "specification.yaml");
    const spec = parseSpec(rf(specPath, "utf8"), specPath);
    await runSkillModel({
      spec, skillDir, specPath,
      adapter: { name: "pi", available: async () => true,
        run: async (r) => r.turns.map((t) => `>>> USER:\n${t}\n\n<<< ASSISTANT:\nHello!\n`).join("\n"),
        judge: async () => "1. PASS ok\nVERDICT: PASS\nREASON: fine" },
      model: { provider: "fireworks", model: "fake" }, modelToken: "fireworks:fake",
      judge: { provider: "claude-code", model: "opus" },
      mode: "green", timestamp: "2026-08-03T03-00-00-000Z", now: () => "2026-08-03T03:00:00.000Z", label: "pre-growth",
    });
    // grow the spec: add a scenario + raise the bar
    const grown = rf(specPath, "utf8")
      .replace("total: 2", "total: 3").replace("min_pass: 2", "min_pass: 3")
      + '\n  - id: A9\n    title: new one\n    turns: ["go"]\n    checklist: ["does it"]\n';
    wf(specPath, grown);
    const findings = lintSkill(skillDir).filter((f) => f.code === "consistency");
    expect(findings).toEqual([]);
  });
});
