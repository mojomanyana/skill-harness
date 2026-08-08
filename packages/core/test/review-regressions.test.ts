import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stimulusDigest, gatesDigest } from "../src/sources.js";
import { repIndexOf, writeResults, readResults } from "../src/results.js";
import { adjudicateRun, planAdjudication, runAdjudication, formatAdjudicationPlan } from "../src/adjudication.js";
import { mergeTraces } from "../src/execution-trace.js";
import { selectAffected } from "../src/affected.js";
import type { ExecutionTraceV1 } from "../src/capture-trace-types.js";
import { loadSpec } from "../src/spec.js";
import type { Scenario } from "../src/spec.js";
import type { HarnessAdapter } from "../src/adapters/types.js";

/**
 * Regressions found by an independent review of this branch, each of which
 * survived a green 1,069-test suite. They share a shape worth naming: all are
 * INTEGRATION SEAMS — a positional format shared with stored data, an index
 * convention that differs across two files, a regex that predates a new artifact.
 * Unit tests covered each side; nothing covered the join.
 */

const scenario = (over: Partial<Scenario> = {}): Scenario => ({
  id: "A1", title: "t", critical: false, mode: "inline", turns: ["x"], checklist: ["y"],
  workspace: "none", remote: false, ...over,
});

describe("source digests are a STORED format", () => {
  // Frozen values. These hashes are recorded in every published results.yaml, so
  // changing them is a breaking change to data already on disk — it makes lint
  // demand paid re-runs for scenarios nobody edited. Appending an unconditional
  // element to the positional tuple did exactly that: 62 real findings became 261
  // across the reference corpus.
  //
  // If one of these fails, the fix is almost never "update the constant".
  it("stimulus digest is unchanged for a scenario declaring no optional fields", () => {
    expect(stimulusDigest(scenario())).toBe(
      "a7aa95e409f0cea58e4594dd31a40d6d9c52250b2b54cb9aa8805f8b84360978",
    );
  });

  it("gates digest is unchanged for a scenario declaring no trace assertions", () => {
    expect(gatesDigest(scenario({ mode: "seeded", fixture: "f", assert: { diff_contains: ["x"] } }))).toBe(
      "656b09db62ebaa99117ed329de947ab45a4db89526b82e23399775fa40c52b20",
    );
  });

  it("still distinguishes scenarios that DO declare the new fields", () => {
    // Conditional appending must not make the field invisible — that would be the
    // opposite bug: an edited extension list with no staleness signal.
    expect(stimulusDigest(scenario({ extensions: ["ext/a.ts"] }))).not.toBe(stimulusDigest(scenario()));
    expect(stimulusDigest(scenario({ extensions: ["ext/a.ts"] })))
      .not.toBe(stimulusDigest(scenario({ extensions: ["ext/b.ts"] })));

    const gated = scenario({ mode: "seeded", fixture: "f", assert: { diff_contains: ["x"] } });
    expect(gatesDigest({ ...gated, traceAssert: { forbid_calls: [{ tool: "write" }] } }))
      .not.toBe(gatesDigest(gated));
  });
});

describe("repIndexOf covers every rep-suffixed artifact", () => {
  it.each([
    ["A1.green.rep0.txt", 0],
    ["A1.green.rep2.judge.txt", 2],
    ["A1.green.rep1.diff.txt", 1],
    // The regression: `.trace.jsonl` was added without updating the regex, so
    // regate looked for an unsuffixed trace path that does not exist on a
    // multi-rep run and reported "trace missing" for traces sitting on disk.
    ["A1.green.rep0.trace.jsonl", 0],
    ["A1.force.rep11.trace.jsonl", 11],
  ])("reads %s as rep %i", (file, rep) => {
    expect(repIndexOf(file)).toBe(rep);
  });

  it.each(["A1.green.txt", "A1.green.trace.jsonl", "A1.green.judge.txt"])(
    "returns null for the unsuffixed %s",
    (file) => expect(repIndexOf(file)).toBeNull(),
  );
});

describe("rep artifacts are 0-based end to end", () => {
  const SPEC = `skill: demo
judge_persona: p
ship_bar: { total: 1, min_pass: 1, no_critical_fail: true }
critical: []
scenarios:
  - id: A1
    title: one
    turns: ["x"]
    checklist: ["does the thing"]
`;
  let skillDir: string;
  let runDir: string;

  beforeEach(() => {
    skillDir = mkdtempSync(join(tmpdir(), "sh-rev-"));
    runDir = join(skillDir, "tests", "results", "tag", "2026-08-08T00-00-00");
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(skillDir, "tests", "specification.yaml"), SPEC, "utf8");
    writeFileSync(join(runDir, "A1.green.txt"), ">>> USER:\nx\n\n<<< ASSISTANT:\ndone\n", "utf8");
    // A split rep set: rep0 FAIL, rep1 PASS, rep2 PASS. Written 0-based, exactly
    // as `run.ts` writes them.
    writeFileSync(join(runDir, "A1.green.rep0.judge.txt"), "1. FAIL\nVERDICT: FAIL\nREASON: no", "utf8");
    writeFileSync(join(runDir, "A1.green.rep1.judge.txt"), "1. PASS\nVERDICT: PASS\nREASON: ok", "utf8");
    writeFileSync(join(runDir, "A1.green.rep2.judge.txt"), "1. PASS\nVERDICT: PASS\nREASON: ok", "utf8");
    writeResults(runDir, {
      skill: "demo", harness: "pi", model: "fireworks:x",
      judge: { provider: "claude-code", model: "j1" },
      timestamp: "2026-08-08T00-00-00", label: null, mode: "green",
      scenarios: [{
        id: "A1", judge_verdict: "PASS", judge_reason: "majority", suspect: false,
        override: null, note: "", reps: 3, passes: 2, clean: 3, flakiness: 0.67, pass_threshold: 0.5,
      }],
    }, { shipBar: { total: 1, min_pass: 1, no_critical_fail: true }, critical: [] });
  });

  it("sees a split rep set and fires the non_unanimous trigger", async () => {
    // The regression: `repVerdictsOf` looped 1..reps, so it read rep1+rep2 (both
    // PASS) and missed rep0's FAIL — a split cell read as unanimous and was never
    // re-judged. At reps:2 it found one file and returned undefined, so the
    // trigger could never fire at all.
    let calls = 0;
    const adapter: HarnessAdapter = {
      name: "fake", available: async () => true, run: async () => "",
      judge: async () => { calls++; return "1. PASS\nVERDICT: PASS\nREASON: fine"; },
    };
    const out = await adjudicateRun({
      runDir, spec: loadSpec(join(skillDir, "tests", "specification.yaml")), adapter,
      results: readResults(runDir),
      primaryJudge: { provider: "claude-code", model: "j1" },
      secondaryJudge: { provider: "claude-code", model: "j2" },
      specDir: join(skillDir, "tests"), now: () => "2026-08-08T00:00:00.000Z",
    });
    const cell = out.scenarios[0];
    expect(cell.adjudication).toBeDefined();
    expect(cell.adjudication!.trigger).toBe("non_unanimous");
    expect(calls).toBe(1);
  });
});

describe("a plan discloses which cells it cannot settle", () => {
  const plan = (tieBreakAvailable: boolean) =>
    planAdjudication({
      cells: [
        { id: "A1", verdict: "PASS", reason: "r", suspect: true },
        { id: "A2", verdict: "FAIL", reason: "r", suspect: false, repVerdicts: ["PASS", "FAIL"] },
      ],
      scenarios: [scenario({ id: "A1" }), scenario({ id: "A2" })],
      shipBar: { total: 2, min_pass: 2, no_critical_fail: true },
      critical: [],
      tieBreakAvailable,
    });

  it("names the misfired cell whose verdict one more judge cannot settle", () => {
    // A suspect judgment is not a clean vote, so a second judge reaches at most
    // one clean vote and `collapseJudgments` needs two: A1 comes back
    // `unresolved` → still `suspect` → still blocking SHIP, whatever it says.
    // The call is still made — that second opinion is what an author reads to
    // resolve the misfire by hand, and it is the ONLY way these cells resolve.
    // What was missing is this disclosure: the preflight offered A1 and A2 as if
    // a call would do the same job for both.
    const p = plan(false);
    expect(p.decisions.find((d) => d.id === "A1")!.triggers).toContain("contradictory");
    expect(p.needsTieBreak).toEqual(["A1"]);
    expect(p.triggered).toEqual(["A1", "A2"]);
    expect(p.maxAdditionalCalls).toBe(2);
  });

  it("has nothing to disclose once a tie-break judge can settle them", () => {
    expect(plan(true).needsTieBreak).toEqual([]);
  });

  it("says which cells those are, in the preflight, before anything is spent", () => {
    const text = formatAdjudicationPlan(plan(false), { secondary: { provider: "claude-code", model: "j2" } });
    expect(text).toMatch(/cannot be SETTLED[^\n]*A1/);
    expect(text).not.toMatch(/cannot be SETTLED[^\n]*A2/);
    expect(formatAdjudicationPlan(plan(true), {
      secondary: { provider: "claude-code", model: "j2" },
      tieBreak: { provider: "claude-code", model: "j3" },
    })).not.toContain("cannot be SETTLED");
  });

  it("still spends within the disclosed ceiling", async () => {
    const p = plan(false);
    const asked: string[] = [];
    const out = await runAdjudication({
      plan: p,
      cells: [
        { id: "A1", verdict: "PASS", reason: "r", suspect: true },
        { id: "A2", verdict: "FAIL", reason: "r", suspect: false, repVerdicts: ["PASS", "FAIL"] },
      ],
      primaryJudge: { provider: "claude-code", model: "j1" },
      secondaryJudge: { provider: "claude-code", model: "j2" },
      rejudge: async (id) => {
        asked.push(id);
        return { verdict: "PASS", reason: "ok", suspect: false };
      },
    });
    expect(asked).toEqual(["A1", "A2"]);
    expect(out.callsMade).toBeLessThanOrEqual(p.maxAdditionalCalls);
    // A1 keeps blocking, and keeps the second opinion attached for the author.
    expect(out.byId.get("A1")!.state).toBe("unresolved");
    expect(out.byId.get("A1")!.judgments).toHaveLength(2);
  });
});

describe("merging turns keeps issue order and completion order distinct", () => {
  const t = (turn: number, calls: Array<[string, number, number]>): ExecutionTraceV1 => ({
    trace_version: 1, pi_version: "0.83.0", subject: { provider: "p", model: "m" },
    scenario_id: "A1", mode: "green", rep: 0, turn, final_text: `t${turn}`,
    tool_calls: calls.map(([id, issueIndex, completionIndex]) => ({
      id, name: "read", args: {}, issueIndex, completionIndex, isError: false,
      result: { bytes: 0, sha256: "x" },
    })),
    changed_paths: [], cost_usd: null,
  });

  it("preserves a batch that completed out of the order it was issued", () => {
    // The regression: both indices were assigned from the same counter, so every
    // merged call came out with `completionIndex === issueIndex`. The persisted
    // trace then described a sequential execution that did not happen — and
    // correlating by `toolCallId` exists precisely because batched calls do not
    // complete in issue order.
    const merged = mergeTraces([t(1, [["a", 0, 1], ["b", 1, 0]]), t(2, [["c", 0, 0]])])!;
    expect(merged.tool_calls.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(merged.tool_calls.map((c) => c.issueIndex)).toEqual([0, 1, 2]);
    expect(merged.tool_calls.map((c) => c.completionIndex)).toEqual([1, 0, 2]);
  });

  it("keeps a call that never completed marked as never completed", () => {
    const merged = mergeTraces([t(1, [["a", 0, -1], ["b", 1, 0]]), t(2, [["c", 0, 0]])])!;
    expect(merged.tool_calls.map((c) => c.completionIndex)).toEqual([-1, 0, 1]);
  });
});

describe("an uncovered instruction file cannot be ruled out", () => {
  const skillDir = "/repo/skills/plan";
  const specDir = `${skillDir}/tests`;
  const scenarios = [
    scenario({ id: "A1", covers: ["../SKILL.md#planning"] }),
    scenario({ id: "A2", covers: ["../SKILL.md#planning"] }),
  ];
  const diffFor = (file: string) =>
    `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1,0 +2,3 @@\n+new prose\n`;

  it("selects everything when changed skill prose is covered by nothing", () => {
    // `continue` here was silent under-inclusion: the file mapped to no section,
    // so no scenario was selected AND it never reached `unmappedFiles` — the
    // output claimed a clean partial selection for an edit it had not considered.
    const out = selectAffected({
      scenarios, specDir, repoRoot: "/repo",
      diff: diffFor("skills/plan/REFERENCE.md"),
    });
    expect(out.conservative).toBe(true);
    expect(out.conservativeReason).toContain("REFERENCE.md");
    expect(out.selected.map((s) => s.id).sort()).toEqual(["A1", "A2"]);
  });

  it("still ignores changed source files and other skills' prose", () => {
    for (const file of ["src/run.ts", "skills/build/SKILL.md", "skills/plan/tests/specification.yaml"]) {
      const out = selectAffected({ scenarios, specDir, repoRoot: "/repo", diff: diffFor(file) });
      expect(out.conservative, file).toBe(false);
    }
  });
});
