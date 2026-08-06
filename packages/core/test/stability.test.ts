import { describe, test, expect, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeResults, type ResultsDraft, type ScenarioResult } from "../src/results.js";
import { collectStability, boundaryCells, stabilityNote, verdictPath } from "../src/stability.js";
import { formatScorecard } from "../src/run.js";
import { collectReport } from "../src/report.js";
import { readResults } from "../src/results.js";
import { lintSkill, failsGate } from "../src/lint.js";
import { loadSpec } from "../src/spec.js";
import { sourceHashes } from "../src/sources.js";

/**
 * Run-over-run stability.
 *
 * The case that motivated it, measured in the reference corpus: `plan` A5 went 3/3 PASS
 * to 0/3 FAIL between two consecutive full force runs, each run internally
 * `flakiness 0.00`. Within-run flakiness cannot see that, because it only ever looks at
 * one run.
 */

const SPEC = `
skill: golden
judge_persona: a judge.
ship_bar: { total: 2, min_pass: 2 }
critical: [A5]
scenarios:
  - id: A5
    title: holds the line
    turns: ["do it"]
    checklist: ["holds"]
  - id: B1
    title: something else
    turns: ["and this"]
    checklist: ["does it"]
`;

const tmps: string[] = [];
afterEach(() => { while (tmps.length) rmSync(tmps.pop()!, { recursive: true, force: true }); });

function skillTree(): { skillDir: string; specDir: string } {
  const skillDir = mkdtempSync(join(tmpdir(), "sh-stab-"));
  tmps.push(skillDir);
  const specDir = join(skillDir, "tests");
  mkdirSync(specDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), "---\nname: golden\n---\n\n## Hold the line\n", "utf8");
  writeFileSync(join(specDir, "specification.yaml"), SPEC, "utf8");
  return { skillDir, specDir };
}

interface CellSpec {
  id?: string;
  verdict: ScenarioResult["judge_verdict"];
  /** 3 reps all agreeing (the "unanimous" shape) unless overridden. */
  reps?: number;
  passes?: number;
  flakiness?: number;
  suspect?: boolean;
  override?: ScenarioResult["override"];
}

function cell(c: CellSpec): ScenarioResult {
  const reps = c.reps ?? 3;
  const passes = c.passes ?? (c.verdict === "PASS" ? reps : 0);
  return {
    id: c.id ?? "A5",
    judge_verdict: c.verdict,
    judge_reason: "because",
    suspect: c.suspect ?? false,
    override: c.override ?? null,
    note: c.override ? "author call" : "",
    reps,
    passes,
    clean: reps,
    flakiness: c.flakiness ?? 0,
    pass_threshold: 0.5,
  };
}

/** Write one run. `hashes` defaults to the real digests of the tree (so pairs compare). */
function run(
  skillDir: string,
  specDir: string,
  ts: string,
  cells: ScenarioResult[],
  opts: { mode?: string; hashes?: Record<string, string> | null; label?: string; partial?: boolean; tag?: string } = {},
): void {
  const mode = opts.mode ?? "force";
  const spec = loadSpec(join(specDir, "specification.yaml"));
  const runDir = join(specDir, "results", opts.tag ?? "pi-fake", ts.replace(/[:.]/g, "-"));
  mkdirSync(runDir, { recursive: true });
  const hashes =
    opts.hashes === null
      ? undefined
      : opts.hashes ?? sourceHashes({ skillDir, specDir, scenarios: spec.scenarios, judgePersona: spec.judge_persona });
  const draft: ResultsDraft = {
    skill: "golden", harness: "pi", model: "fireworks:fake",
    judge: { provider: "claude-code", model: "opus" },
    timestamp: ts, label: opts.label ?? null, mode,
    ...(opts.partial ? { partial: true } : {}),
    ...(hashes ? { source_hashes: hashes } : {}),
    scenarios: cells,
  };
  writeResults(runDir, draft, mode === "red" ? null : { shipBar: spec.ship_bar, critical: spec.critical });
}

/** The A5 cell of the first (and usually only) group. */
function a5(skillDir: string, window?: number) {
  return collectStability(skillDir, window ? { window } : {}).find((s) => s.id === "A5")!;
}

describe("a flip on unchanged sources is a boundary cell", () => {
  test("two unanimous runs with opposite verdicts — the case flakiness 0.00 cannot see", () => {
    const { skillDir, specDir } = skillTree();
    run(skillDir, specDir, "2026-08-05T00:00:00Z", [cell({ verdict: "PASS" }), cell({ id: "B1", verdict: "PASS" })]);
    run(skillDir, specDir, "2026-08-06T00:00:00Z", [cell({ verdict: "FAIL" }), cell({ id: "B1", verdict: "PASS" })]);

    const s = a5(skillDir);
    expect(s.state).toBe("boundary");
    expect(s.compared).toBe(1);
    expect(s.flips).toBe(1);
    expect(s.volatility).toBe(1);
    expect(s.unanimousFlips).toBe(1);
    expect(s.flipsAcrossSkillEdit).toBe(0);
    expect(verdictPath(s)).toBe("PASS!→FAIL!");
    expect(stabilityNote(s)).toMatch(/INTERNALLY UNANIMOUS/);
    expect(stabilityNote(s)).toMatch(/one draw, not a measurement/);

    // The scenario that held is not reported, and is not conflated with it.
    const b1 = collectStability(skillDir).find((x) => x.id === "B1")!;
    expect(b1.state).toBe("stable");
    expect(boundaryCells(collectStability(skillDir)).map((c) => c.id)).toEqual(["A5"]);
  });

  test("a single-rep flip is reported, but never called unanimous — one draw is not agreement", () => {
    const { skillDir, specDir } = skillTree();
    run(skillDir, specDir, "2026-08-05T00:00:00Z", [cell({ verdict: "PASS", reps: 1 })]);
    run(skillDir, specDir, "2026-08-06T00:00:00Z", [cell({ verdict: "FAIL", reps: 1 })]);
    const s = a5(skillDir);
    expect(s.flips).toBe(1);
    expect(s.unanimousFlips).toBe(0);
    expect(verdictPath(s)).toBe("PASS→FAIL");
  });

  test("volatility counts flips per comparable step, not per run", () => {
    const { skillDir, specDir } = skillTree();
    run(skillDir, specDir, "2026-08-01T00:00:00Z", [cell({ verdict: "PASS" })]);
    run(skillDir, specDir, "2026-08-02T00:00:00Z", [cell({ verdict: "PASS" })]);
    run(skillDir, specDir, "2026-08-03T00:00:00Z", [cell({ verdict: "FAIL" })]);
    const s = a5(skillDir);
    expect([s.compared, s.flips, s.volatility]).toEqual([2, 1, 0.5]);
  });
});

describe("an edit is not a flip", () => {
  test("a changed rubric makes the step incomparable, and says which source changed", () => {
    const { skillDir, specDir } = skillTree();
    run(skillDir, specDir, "2026-08-05T00:00:00Z", [cell({ verdict: "PASS" })]);
    // The rubric the second run was judged under differs — the verdicts answer
    // different questions, so their disagreement measures nothing.
    const spec = loadSpec(join(specDir, "specification.yaml"));
    const edited = sourceHashes({ skillDir, specDir, scenarios: spec.scenarios, judgePersona: "a DIFFERENT judge." });
    run(skillDir, specDir, "2026-08-06T00:00:00Z", [cell({ verdict: "FAIL" })], { hashes: edited });

    const s = a5(skillDir);
    expect(s.state).toBe("unmeasured");
    expect(s.flips).toBe(0);
    expect(s.volatility).toBeNull();
    expect(s.pairs[0].status).toBe("sources");
    expect(s.pairs[0].changedSources).toContain("the judge persona");
    expect(stabilityNote(s)).toMatch(/an edit, not a flip/);
    expect(verdictPath(s)).toBe("PASS!⋯FAIL!"); // ⋯ = this step was not evidence
  });

  test("a SKILL.md edit does NOT hide the flip — it labels it (the measured A5 case)", () => {
    const { skillDir, specDir } = skillTree();
    run(skillDir, specDir, "2026-08-05T00:00:00Z", [cell({ verdict: "PASS" })]);
    // Exactly the real shape: SKILL.md changed (an edit aimed at another scenario),
    // this scenario's own stimulus and rubric identical.
    const spec = loadSpec(join(specDir, "specification.yaml"));
    const after = sourceHashes({ skillDir, specDir, scenarios: spec.scenarios, judgePersona: spec.judge_persona });
    run(skillDir, specDir, "2026-08-06T00:00:00Z", [cell({ verdict: "FAIL" })], {
      hashes: { ...after, "SKILL.md": "0".repeat(64) },
    });

    const s = a5(skillDir);
    expect(s.state).toBe("boundary");
    expect(s.flips).toBe(1);
    expect(s.flipsAcrossSkillEdit).toBe(1);
    const note = stabilityNote(s);
    expect(note).toMatch(/SKILL\.md changed/);
    expect(note).toMatch(/side effect of that edit or a boundary cell/);
    expect(note).toMatch(/the record cannot say which/);
  });

  test("different reps/threshold is not a flip either — one draw vs a majority of three", () => {
    const { skillDir, specDir } = skillTree();
    run(skillDir, specDir, "2026-08-05T00:00:00Z", [cell({ verdict: "PASS", reps: 1 })]);
    run(skillDir, specDir, "2026-08-06T00:00:00Z", [cell({ verdict: "FAIL", reps: 3 })]);
    const s = a5(skillDir);
    expect(s.state).toBe("unmeasured");
    expect(s.pairs[0].status).toBe("aggregation");
    expect(stabilityNote(s)).toMatch(/aggregated differently/);
  });
});

describe("what cannot be a side of a flip", () => {
  test("an ERROR is harness noise, not a verdict", () => {
    const { skillDir, specDir } = skillTree();
    run(skillDir, specDir, "2026-08-05T00:00:00Z", [cell({ verdict: "PASS" })]);
    run(skillDir, specDir, "2026-08-06T00:00:00Z", [cell({ verdict: "ERROR" })]);
    const s = a5(skillDir);
    expect(s.pairs[0].status).toBe("inconclusive");
    expect(s.state).toBe("unmeasured");
  });

  test("an unresolved misfire is judge noise; an override resolves it", () => {
    const { skillDir, specDir } = skillTree();
    run(skillDir, specDir, "2026-08-05T00:00:00Z", [cell({ verdict: "PASS" })]);
    run(skillDir, specDir, "2026-08-06T00:00:00Z", [cell({ verdict: "FAIL", suspect: true })]);
    expect(a5(skillDir).pairs[0].status).toBe("inconclusive");

    const { skillDir: d2, specDir: s2 } = skillTree();
    run(d2, s2, "2026-08-05T00:00:00Z", [cell({ verdict: "PASS" })]);
    run(d2, s2, "2026-08-06T00:00:00Z", [cell({ verdict: "FAIL", suspect: true, override: "PASS" })]);
    const s = a5(d2);
    // The author's PASS is the verdict, so there is no flip to report.
    expect(s.pairs[0].status).toBe("compared");
    expect(s.state).toBe("stable");
    expect(verdictPath(s)).toBe("PASS!→PASS!(override)");
  });

  test("a run with no recorded hashes cannot be shown to have measured the same thing", () => {
    const { skillDir, specDir } = skillTree();
    run(skillDir, specDir, "2026-08-05T00:00:00Z", [cell({ verdict: "PASS" })], { hashes: null });
    run(skillDir, specDir, "2026-08-06T00:00:00Z", [cell({ verdict: "FAIL" })], { hashes: null });
    const s = a5(skillDir);
    expect(s.pairs[0].status).toBe("unverified");
    expect(stabilityNote(s)).toMatch(/cannot be compared/);
  });

  test("a legacy combined-key run against a split-key one is unverifiable, not unchanged", () => {
    const { skillDir, specDir } = skillTree();
    // 0.3.x recorded one combined `scenario:<id>` digest; 0.4.0+ records split facets.
    // The two hash different byte layouts, so equality across them is meaningless.
    run(skillDir, specDir, "2026-08-05T00:00:00Z", [cell({ verdict: "PASS" })], {
      hashes: { "SKILL.md": "a".repeat(64), "scenario:A5": "b".repeat(64) },
    });
    run(skillDir, specDir, "2026-08-06T00:00:00Z", [cell({ verdict: "FAIL" })]);
    expect(a5(skillDir).pairs[0].status).toBe("unverified");
  });
});

describe("what gets compared with what", () => {
  test("green and force are separate histories — placement is not a rep", () => {
    const { skillDir, specDir } = skillTree();
    run(skillDir, specDir, "2026-08-05T00:00:00Z", [cell({ verdict: "PASS" })], { mode: "green" });
    run(skillDir, specDir, "2026-08-06T00:00:00Z", [cell({ verdict: "FAIL" })], { mode: "force" });
    const all = collectStability(skillDir).filter((s) => s.id === "A5");
    expect(all.map((s) => [s.mode, s.state])).toEqual([
      ["green", "unmeasured"],
      ["force", "unmeasured"],
    ]);
    expect(boundaryCells(all)).toEqual([]);
  });

  test("a red baseline is not history for a scored cell", () => {
    const { skillDir, specDir } = skillTree();
    run(skillDir, specDir, "2026-08-05T00:00:00Z", [cell({ verdict: "PASS" })], { mode: "force" });
    run(skillDir, specDir, "2026-08-05T12:00:00Z", [cell({ verdict: "FAIL" })], { mode: "red" });
    run(skillDir, specDir, "2026-08-06T00:00:00Z", [cell({ verdict: "PASS" })], { mode: "force" });
    const s = a5(skillDir);
    expect(s.points).toHaveLength(2); // the red run is not a point at all
    expect(s.state).toBe("stable");
  });

  test("separate model tags never share a history", () => {
    const { skillDir, specDir } = skillTree();
    run(skillDir, specDir, "2026-08-05T00:00:00Z", [cell({ verdict: "PASS" })], { tag: "pi-a" });
    run(skillDir, specDir, "2026-08-06T00:00:00Z", [cell({ verdict: "FAIL" })], { tag: "pi-b" });
    expect(boundaryCells(collectStability(skillDir))).toEqual([]);
  });

  test("the window counts runs that hold the scenario, so an --only run elsewhere costs no slot", () => {
    const { skillDir, specDir } = skillTree();
    run(skillDir, specDir, "2026-08-01T00:00:00Z", [cell({ verdict: "PASS" })]);
    // A partial run that only exercised B1: it is real evidence about B1 and says
    // nothing about A5, so it must not push A5's older run out of the window.
    run(skillDir, specDir, "2026-08-02T00:00:00Z", [cell({ id: "B1", verdict: "FAIL" })], { partial: true });
    run(skillDir, specDir, "2026-08-03T00:00:00Z", [cell({ verdict: "FAIL" })]);
    const s = a5(skillDir, 2);
    expect(s.points.map((p) => p.timestamp)).toEqual(["2026-08-01T00:00:00Z", "2026-08-03T00:00:00Z"]);
    expect(s.flips).toBe(1);
  });

  test("one run is `unmeasured`, never `stable` — absence of evidence is not evidence", () => {
    const { skillDir, specDir } = skillTree();
    run(skillDir, specDir, "2026-08-05T00:00:00Z", [cell({ verdict: "PASS" })]);
    const s = a5(skillDir);
    expect(s.state).toBe("unmeasured");
    expect(s.volatility).toBeNull();
    expect(stabilityNote(s)).toMatch(/no run-over-run comparison exists yet/);
  });

  test("a skill with no runs at all yields cells, all unmeasured, and never throws", () => {
    const { skillDir } = skillTree();
    expect(collectStability(skillDir)).toEqual([]);
  });
});

describe("lint reports boundary cells as notes, not failures", () => {
  test("the finding is severity info, names the remedy nowhere, and does not fail the gate", () => {
    const { skillDir, specDir } = skillTree();
    run(skillDir, specDir, "2026-08-05T00:00:00Z", [cell({ verdict: "PASS" }), cell({ id: "B1", verdict: "PASS" })]);
    run(skillDir, specDir, "2026-08-06T00:00:00Z", [cell({ verdict: "FAIL" }), cell({ id: "B1", verdict: "PASS" })]);

    const findings = lintSkill(skillDir);
    const notes = findings.filter((f) => f.code === "stability");
    expect(notes).toHaveLength(1);
    expect(notes[0].severity).toBe("info");
    expect(notes[0].scenario).toBe("A5");
    expect(notes[0].message).toMatch(/pi-fake mode=force/);
    expect(failsGate(notes[0])).toBe(false);
    // Nothing else in this tree is wrong, so the gate stays green.
    expect(findings.filter(failsGate)).toEqual([]);
  });

  test("every pre-existing code still fails the gate — severity is additive, not a relaxation", () => {
    const { skillDir, specDir } = skillTree();
    writeFileSync(join(specDir, "specification.yaml"), SPEC.replace("min_pass: 2", "min_pass: 9"), "utf8");
    const findings = lintSkill(skillDir);
    expect(findings.some((f) => f.code === "ship_bar" && failsGate(f))).toBe(true);
  });
});

describe("the surfaces a reader actually looks at", () => {
  /** Two force runs of A5 with opposite unanimous verdicts, plus a steady B1. */
  function flippedTree() {
    const t = skillTree();
    run(t.skillDir, t.specDir, "2026-08-05T00:00:00Z", [cell({ verdict: "PASS" }), cell({ id: "B1", verdict: "PASS" })]);
    run(t.skillDir, t.specDir, "2026-08-06T00:00:00Z", [cell({ verdict: "FAIL" }), cell({ id: "B1", verdict: "PASS" })]);
    return t;
  }

  test("the scorecard qualifies the verdicts above it", () => {
    const { skillDir, specDir } = flippedTree();
    const runDir = join(specDir, "results", "pi-fake", "2026-08-06T00-00-00Z");
    const card = formatScorecard({ runDir, results: readResults(runDir) }, undefined, collectStability(skillDir));
    expect(card).toMatch(/⇄ A5 flipped its verdict/);
    // The steady scenario is not annotated: a marker on every cell buries the signal.
    expect(card).not.toMatch(/⇄ B1/);
    // And `flaky 0.00` is exactly what it printed beside the flipping cell.
    expect(card).not.toMatch(/A5.*flaky/);
  });

  test("the scorecard carries no other model's history", () => {
    const { skillDir, specDir } = flippedTree();
    const runDir = join(specDir, "results", "pi-fake", "2026-08-06T00-00-00Z");
    const foreign = collectStability(skillDir).map((c) => ({ ...c, tag: "pi-someone-else" }));
    // The CLI filters by tag + mode before passing them in; this asserts the scorecard
    // prints what it is given, so that filter is the only place the rule lives.
    const card = formatScorecard({ runDir, results: readResults(runDir) }, undefined,
      foreign.filter((c) => c.tag === "pi-fake"));
    expect(card).not.toMatch(/⇄/);
  });

  test("the review matrix marks the boundary cell and only that cell", () => {
    const { skillDir } = flippedTree();
    const [column] = collectReport(skillDir).columns;
    expect(column.cells.A5.stability).toMatchObject({ flips: 1, compared: 1, volatility: 1 });
    expect(column.cells.A5.stability!.note).toMatch(/INTERNALLY UNANIMOUS/);
    expect(column.cells.B1.stability).toBeUndefined();
  });

  test("a column shows only its own mode's history", () => {
    const { skillDir, specDir } = skillTree();
    // A green run, then two force runs that flip. The column is the newest run (force),
    // and its cell must not inherit a flip computed across the green boundary.
    run(skillDir, specDir, "2026-08-01T00:00:00Z", [cell({ verdict: "FAIL" })], { mode: "green" });
    run(skillDir, specDir, "2026-08-05T00:00:00Z", [cell({ verdict: "PASS" })]);
    run(skillDir, specDir, "2026-08-06T00:00:00Z", [cell({ verdict: "PASS" })]);
    const [column] = collectReport(skillDir).columns;
    expect(column.mode).toBe("force");
    expect(column.cells.A5.stability).toBeUndefined(); // force history held
  });
});
