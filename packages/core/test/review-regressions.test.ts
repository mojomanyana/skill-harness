import { EXECUTION_TRACE_VERSION } from "../src/capture-trace-types.js";
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stimulusDigest, gatesDigest } from "../src/sources.js";
import { repIndexOf, writeResults, readResults, effectiveVerdicts, rebuildScenarioResult } from "../src/results.js";
import type { ScenarioResult } from "../src/results.js";
import { score } from "../src/score.js";
import { adjudicateRun, planAdjudication, runAdjudication, formatAdjudicationPlan, cellsFromResults } from "../src/adjudication.js";
import { redactText } from "../src/capture.js";
import { mergeTraces, parseTrace } from "../src/execution-trace.js";
import { snapshotPaths, diffSnapshots } from "../src/workspace.js";
import { evaluateTraceGates } from "../src/trace-gates.js";
import { execFileSync } from "node:child_process";
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
    trace_version: EXECUTION_TRACE_VERSION, pi_version: "0.83.0", subject: { provider: "p", model: "m" },
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

describe("an objective gate outranks the judge", () => {
  const cell = (over: Partial<ScenarioResult> = {}): ScenarioResult => ({
    id: "A1", judge_verdict: "PASS", judge_reason: "2/3 reps passed (flaky 0.67)",
    suspect: false, override: null, note: "",
    reps: 3, passes: 2, clean: 3, flakiness: 0.67, pass_threshold: 0.5,
    objective: { status: "FAIL", assertions: [{ kind: "forbid_call", status: "FAIL", detail: "`write` called 1 time(s) — forbidden" }] },
    ...over,
  });
  const shipOf = (s: ScenarioResult) =>
    score(effectiveVerdicts([s]), { shipBar: { total: 1, min_pass: 1, no_critical_fail: true }, critical: ["A1"] });

  it("is not out-voted by a rep majority", () => {
    // The regression: `objective` reached the ship decision only through
    // `gatePrefix` inside ONE rep of run.ts, so `aggregateReps` out-voted a
    // forbidden tool call 2-to-1 and a CRITICAL scenario shipped at 100%, grade
    // A, criticalFails 0. `reps.ts` states the policy that forbids this in so
    // many words; nothing enforced it.
    expect(effectiveVerdicts([cell()])[0].verdict).toBe("FAIL");
    expect(shipOf(cell())).toMatchObject({ ship: false, criticalFails: 1 });
  });

  it("turns missing evidence into ERROR, never a pass", () => {
    const c = cell({ objective: { status: "ERROR", assertions: [] } });
    expect(effectiveVerdicts([c])[0].verdict).toBe("ERROR");
    expect(shipOf(c).ship).toBe(false);
  });

  it("survives a re-judge that never saw the tool call", () => {
    // `regrade` carries `objective` forward and re-judges from a transcript that,
    // on the structured path, holds only the final assistant text — so the judge
    // cannot see the forbidden call even in principle. Its PASS used to stand.
    const rejudged = rebuildScenarioResult(
      { ...cell(), judge_verdict: "PASS", judge_reason: "clear explanation", objective: undefined },
      cell(),
      { objective: "carry", adjudication: "drop" },
    );
    expect(rejudged.objective!.status).toBe("FAIL");
    expect(shipOf(rejudged).ship).toBe(false);
  });

  it("leaves a scenario that declared no trace assertions completely alone", () => {
    // Absent must not read as "objectively verified" — that would upgrade every
    // legacy result in the corpus.
    const c = cell({ objective: undefined });
    expect(effectiveVerdicts([c])[0].verdict).toBe("PASS");
    expect(shipOf(c).ship).toBe(true);
  });

  it("still lets an explicit author override win", () => {
    // The failure this guards against was never a human deciding — it was nobody
    // deciding. An override is a recorded, deliberate act, exactly as it is for
    // `suspect`.
    const c = cell({ override: "PASS", note: "the gate is wrong, filed #12" });
    expect(effectiveVerdicts([c])[0].verdict).toBe("PASS");
    expect(shipOf(c).ship).toBe(true);
  });
});

describe("rescore goes through the choke point", () => {
  it("does not revert a settled adjudication from stale rep counters", () => {
    // rescore was the FIFTH rewriter and the only one still using `{ ...s }`, so
    // adding `objective`/`adjudication` to the type did not fail the build there.
    // A cell adjudication settled FAIL reverted to PASS when a threshold change
    // recomputed it from rep counters adjudication never updated.
    const prior: ScenarioResult = {
      id: "A1", judge_verdict: "FAIL", judge_reason: "tie-broken FAIL", suspect: false,
      override: null, note: "", reps: 3, passes: 2, clean: 3, flakiness: 0.67, pass_threshold: 0.5,
      adjudication: { state: "tie_broken", trigger: "ship_deciding", judgments: [], verdict: "FAIL" },
    };
    // 2/3 = 0.667 >= 0.6, so the threshold rule alone would say PASS.
    const rebuilt = rebuildScenarioResult(
      { ...prior, judge_verdict: "PASS", pass_threshold: 0.6 },
      prior,
      { objective: "carry", adjudication: "carry" },
    );
    expect(rebuilt.judge_verdict).toBe("FAIL");
    expect(rebuilt.adjudication!.verdict).toBe("FAIL");
  });
});

describe("unchanged_paths rests on evidence, or on nothing at all", () => {
  const trace = (changed: string[] | null): ExecutionTraceV1 => ({
    trace_version: EXECUTION_TRACE_VERSION, pi_version: "0.83.0", subject: { provider: "p", model: "m" },
    scenario_id: "A1", mode: "green", rep: 0, turn: 1, final_text: "done",
    tool_calls: [], changed_paths: changed, cost_usd: null,
  });

  it("sees a gitignored file the model overwrote", () => {
    // The regression, and it was mine: `observeChangedPaths` was `git add -A`,
    // which HONOURS .gitignore. `.env` is the canonical example in this file, in
    // the docs, and in the tests — and it is the canonical gitignored file. The
    // observation returned [] and the gate printed `✓ .env unchanged` while the
    // model had rewritten it.
    const ws = mkdtempSync(join(tmpdir(), "sh-ign-"));
    execFileSync("git", ["init", "-q", "."], { cwd: ws });
    writeFileSync(join(ws, ".gitignore"), ".env\n", "utf8");
    writeFileSync(join(ws, ".env"), "SECRET=original\n", "utf8");
    const before = snapshotPaths(ws, "empty-git");

    writeFileSync(join(ws, ".env"), "SECRET=stolen\n", "utf8");
    const changed = diffSnapshots(before, snapshotPaths(ws, "empty-git"));

    expect(changed).toEqual([".env"]);
    expect(evaluateTraceGates({ unchanged_paths: [".env"] }, trace(changed)).status).toBe("FAIL");
  });

  it("does not blame the model for a fixture's own pending changes", () => {
    // `createWorkspace` applies `_staged/` and `_uncommitted/` AFTER the baseline
    // commit, so diffing against the baseline reported those files as changes the
    // model made — a fabricated FAIL naming files it never touched, written into
    // a committed results.yaml. The baseline is now the pre-run state.
    const ws = mkdtempSync(join(tmpdir(), "sh-dirty-"));
    execFileSync("git", ["init", "-q", "."], { cwd: ws });
    writeFileSync(join(ws, "committed.ts"), "x\n", "utf8");
    execFileSync("git", ["add", "-A"], { cwd: ws });
    execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "base"], { cwd: ws });
    // The fixture's dirty tree lands after the baseline commit.
    writeFileSync(join(ws, "pending.ts"), "seeded by the fixture\n", "utf8");

    const before = snapshotPaths(ws, "empty-git");
    // The model does nothing at all.
    expect(diffSnapshots(before, snapshotPaths(ws, "empty-git"))).toEqual([]);
    expect(evaluateTraceGates({ unchanged_paths: ["**"] }, trace([])).status).toBe("PASS");
  });

  it("refuses to grade a path assertion it never observed", () => {
    // `null` and `[]` were the same value, so "we never looked" graded as
    // "nothing changed". This is the whole reason the field is tri-state.
    const g = evaluateTraceGates({ unchanged_paths: [".env"] }, trace(null));
    expect(g.status).toBe("ERROR");
    expect(g.assertions[0].detail).toContain("never observed");
  });

  it("does not let one unobserved turn be washed out by observed ones", () => {
    const merged = mergeTraces([{ ...trace(["a.ts"]), turn: 1 }, { ...trace(null), turn: 2 }])!;
    expect(merged.changed_paths).toBeNull();
  });

  it("parses a stream as unobserved, never as clean", () => {
    const { trace: parsed } = parseTrace([], {
      piVersion: "0.83.0", subject: { provider: "p", model: "m" },
      scenarioId: "A1", mode: "green", rep: 0, turn: 1,
    });
    expect(parsed.changed_paths).toBeNull();
  });
});

describe("everything that reaches disk is redacted, not just `args`", () => {
  const stream = (extra: Record<string, unknown>) => [
    JSON.stringify({ type: "tool_execution_start", toolCallId: "c1", toolName: "bash", args: { command: "deploy" } }),
    JSON.stringify({ type: "tool_execution_end", toolCallId: "c1", isError: false, result: { content: [], ...extra } }),
    JSON.stringify({ type: "message_end", message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "wrote /home/victim/app/.env" }] } }),
  ];
  const meta = {
    piVersion: "0.83.0", subject: { provider: "p", model: "m" },
    scenarioId: "A1", mode: "green" as const, rep: 0, turn: 1, homeDir: "/home/victim",
  };

  it("redacts a tool's structured `details`, which its own contract promised", () => {
    // `TraceResultMeta` says details are kept only when "small and free of
    // redaction hits". The code checked only the size and never called a
    // redactor — `homeDir` was not even in scope — so a tool that returned a
    // token or a path in `details` wrote it verbatim, right beside a redacted
    // `args`.
    const { trace } = parseTrace(
      stream({ details: { cwd: "/home/victim/secret", token: "ghp_ABCDEFGHIJKLMNOPQRSTUV0123" } }),
      meta,
    );
    const blob = JSON.stringify(trace);
    expect(blob).not.toContain("/home/victim");
    expect(blob).not.toContain("ghp_ABCDEFGHIJKLMNOPQRSTUV0123");
    expect(trace.tool_calls[0].result.details).toMatchObject({ cwd: "~/secret", token: "[redacted]" });
  });

  it("redacts the model's own answer", () => {
    // `smoke-real-pi.sh` asserts no `/home/` survives into a persisted trace.
    // Nothing enforced it — the assertion passed because the smoke model happened
    // not to echo a path.
    const { trace } = parseTrace(stream({}), meta);
    expect(trace.final_text).toBe("wrote ~/app/.env");
  });

  it("catches credentials embedded in a URL, which no key-name list can match", () => {
    // The key is usually something like `DB_URL`.
    expect(redactText("postgres://admin:hunter2@db/prod")).toBe("postgres://[redacted]@db/prod");
  });
});

describe("a negative assertion never passes on evidence redaction destroyed", () => {
  const call = (args: Record<string, unknown>) => ({
    trace_version: EXECUTION_TRACE_VERSION, pi_version: "0.83.0", subject: { provider: "p", model: "m" },
    scenario_id: "A1", mode: "green", rep: 0, turn: 1, final_text: "",
    tool_calls: [{ id: "c1", name: "fetch", args, issueIndex: 0, completionIndex: 0, isError: false, result: { bytes: 0, sha256: "x" } }],
    changed_paths: [], cost_usd: null,
  }) as ExecutionTraceV1;

  it("reports ERROR, not PASS, when the argument it must read was redacted", () => {
    // `forbid_calls` and `require_calls` degrade in OPPOSITE directions. A
    // missing needle FAILs a require (over-strict, safe) and PASSes a forbid
    // (over-permissive, not safe). `{ authorization: { contains: "Bearer" } }`
    // could never fire: the value is always `[redacted]` by the time the gate
    // sees it.
    const g = evaluateTraceGates(
      { forbid_calls: [{ tool: "fetch", args: { authorization: { contains: "Bearer" } } }] },
      call({ authorization: "[redacted]" }),
    );
    expect(g.assertions[0].status).toBe("ERROR");
    expect(g.status).toBe("ERROR");
  });

  it("still passes cleanly when the argument survived intact", () => {
    const g = evaluateTraceGates(
      { forbid_calls: [{ tool: "fetch", args: { authorization: { contains: "Bearer" } } }] },
      call({ authorization: "Basic abc" }),
    );
    expect(g.assertions[0].status).toBe("PASS");
  });
});

describe("adjudication looks at the reps that failed hardest", () => {
  it("counts a rep with no judge artifact as an absent vote, not as no rep", () => {
    // `run.ts` skips the judge for a rep blocked by a gate or ending in ERROR, so
    // the missing artifacts belong to exactly those reps. Dropping them made
    // [FAIL, PASS, PASS] read as [PASS, PASS] — unanimous — and the preflight
    // told the buyer "no cell triggered" for a cell that split on a forbidden
    // tool call.
    const runDir = mkdtempSync(join(tmpdir(), "sh-adj-"));
    writeFileSync(join(runDir, "A1.green.rep1.judge.txt"), "1. PASS\nVERDICT: PASS\nREASON: ok", "utf8");
    writeFileSync(join(runDir, "A1.green.rep2.judge.txt"), "1. PASS\nVERDICT: PASS\nREASON: ok", "utf8");
    // rep0 was gate-blocked: no judge artifact exists for it.
    const cells = cellsFromResults(runDir, {
      mode: "green",
      scenarios: [{ id: "A1", judge_verdict: "PASS", judge_reason: "", suspect: false, override: null, note: "", reps: 3 }],
    } as never);
    expect(cells[0].repVerdicts).toEqual(["ERROR", "PASS", "PASS"]);

    const plan = planAdjudication({
      cells, scenarios: [scenario({ id: "A1" })],
      shipBar: { total: 1, min_pass: 1, no_critical_fail: true }, critical: [], tieBreakAvailable: false,
    });
    expect(plan.decisions[0].triggers).toContain("non_unanimous");
  });

  it("re-judges a cell whose first judgment could not be parsed at all", () => {
    // `parseVerdict` emits ERROR when nothing parses, and ERROR matched no
    // trigger — so the least readable judgments in a run were the ones never
    // asked again.
    const plan = planAdjudication({
      cells: [{ id: "A1", verdict: "ERROR", reason: "unparseable", suspect: false }],
      scenarios: [scenario({ id: "A1" })],
      shipBar: { total: 1, min_pass: 1, no_critical_fail: true }, critical: [], tieBreakAvailable: false,
    });
    expect(plan.decisions[0].triggers).toContain("ambiguous");
  });
});
