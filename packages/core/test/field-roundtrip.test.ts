import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeResults, readResults, rebuildScenarioResult } from "../src/results.js";
import { regradeRun } from "../src/regrade.js";
import { regateRun } from "../src/regate.js";
import { rescoreRun } from "../src/rescore.js";
import { loadSpec } from "../src/spec.js";
import type { HarnessAdapter } from "../src/adapters/types.js";
import type { ObjectiveResult, AdjudicationResult, ScenarioResult } from "../src/results.js";

/**
 * Every command that REWRITES `results.yaml` must be checked against every
 * optional field, because a rewriter that drops one fails silently and in the
 * dangerous direction: a gated scenario reads as "no assertions declared", and an
 * unresolved judge disagreement reads as a settled verdict.
 *
 * This suite exists because `grade` really did drop `objective` — found by a real
 * smoke run, not by any of the 1,000 tests that passed at the time.
 *
 * The carry-forward contract differs per command, and that asymmetry is the point:
 *
 *   | command | `objective`            | `adjudication`         |
 *   |---------|------------------------|------------------------|
 *   | grade   | carried (gates not re-evaluated) | dropped (judgments replaced) |
 *   | regate  | RECOMPUTED (that is the job)     | carried (no judge was asked) |
 *   | rescore | carried (nothing re-measured)    | carried (nothing re-measured) |
 */

const SPEC = `skill: demo
judge_persona: p
ship_bar: { total: 1, min_pass: 1, no_critical_fail: true }
critical: []
scenarios:
  - id: A1
    title: one
    turns: ["x"]
    checklist: ["does the thing"]
    assert:
      trace:
        forbid_calls:
          - write
`;

const OBJECTIVE: ObjectiveResult = {
  status: "PASS",
  trace_version: 1,
  trace_sha256: "a".repeat(64),
  assertions: [{ kind: "forbid_call", status: "PASS", detail: "`write` not called" }],
};

const ADJUDICATION: AdjudicationResult = {
  state: "unresolved",
  trigger: "non_unanimous",
  judgments: [
    { ordinal: 1, judge: { provider: "claude-code", model: "j1" }, verdict: "PASS", reason: "a", suspect: false },
    { ordinal: 2, judge: { provider: "claude-code", model: "j2" }, verdict: "FAIL", reason: "b", suspect: false },
  ],
};

let skillDir: string;
let runDir: string;
let specPath: string;

const judge: HarnessAdapter = {
  name: "fake",
  available: async () => true,
  run: async () => "",
  judge: async () => "1. PASS\nVERDICT: PASS\nREASON: fine",
};

/** A trace artifact matching the spec's `forbid_calls: [write]` gate. */
function writeTrace() {
  writeFileSync(
    join(runDir, "A1.green.trace.jsonl"),
    `${JSON.stringify({
      trace_version: 1, pi_version: "0.83.0", subject: { provider: "fireworks", model: "x" },
      scenario_id: "A1", mode: "green", rep: 0, turn: 0,
      final_text: "done", tool_calls: [], changed_paths: [], cost_usd: 0,
      trace_sha256: "b".repeat(64),
    })}\n`,
    "utf8",
  );
}

beforeEach(() => {
  skillDir = mkdtempSync(join(tmpdir(), "sh-rt-"));
  runDir = join(skillDir, "tests", "results", "tag", "2026-08-08T00-00-00");
  mkdirSync(runDir, { recursive: true });
  specPath = join(skillDir, "tests", "specification.yaml");
  writeFileSync(specPath, SPEC, "utf8");
  writeFileSync(join(runDir, "A1.green.txt"), ">>> USER:\nx\n\n<<< ASSISTANT:\ndone\n", "utf8");
  writeFileSync(join(runDir, "A1.green.judge.txt"), "1. PASS\nVERDICT: PASS\nREASON: prior", "utf8");
  writeResults(runDir, {
    skill: "demo", harness: "pi", model: "fireworks:x",
    judge: { provider: "claude-code", model: "j1" },
    timestamp: "2026-08-08T00-00-00", label: null, mode: "green",
    scenarios: [{
      id: "A1", judge_verdict: "PASS", judge_reason: "ok", suspect: false,
      override: "PASS", note: "author says fine",
      objective: OBJECTIVE, adjudication: ADJUDICATION,
    }],
  }, { shipBar: { total: 1, min_pass: 1, no_critical_fail: true }, critical: [] });
});

const cell = () => readResults(runDir).scenarios[0];

describe("writeResults / readResults", () => {
  it("round-trips both optional fields through YAML unchanged", () => {
    const c = cell();
    expect(c.objective).toEqual(OBJECTIVE);
    expect(c.adjudication).toEqual(ADJUDICATION);
  });
});

describe("grade (regradeRun)", () => {
  it("carries `objective` forward — a re-judge does not re-evaluate trace gates", async () => {
    // The regression. Dropping this downgraded a gated scenario to "no assertions
    // declared", which reads as safer than it is.
    await regradeRun({ runDir, spec: loadSpec(specPath), adapter: judge, judge: { provider: "claude-code", model: "j1" }, specDir: join(skillDir, "tests") });
    expect(cell().objective).toEqual(OBJECTIVE);
  });

  it("preserves the author's override and note", async () => {
    await regradeRun({ runDir, spec: loadSpec(specPath), adapter: judge, judge: { provider: "claude-code", model: "j1" }, specDir: join(skillDir, "tests") });
    expect(cell().override).toBe("PASS");
    expect(cell().note).toBe("author says fine");
  });

  it("drops `adjudication` deliberately — it described the judgments just replaced", async () => {
    await regradeRun({ runDir, spec: loadSpec(specPath), adapter: judge, judge: { provider: "claude-code", model: "j1" }, specDir: join(skillDir, "tests") });
    expect(cell().adjudication).toBeUndefined();
  });
});

describe("regate (regateRun)", () => {
  it("carries `adjudication` forward — regate asks no judge anything", async () => {
    writeTrace();
    await regateRun({ runDir, spec: loadSpec(specPath), adapter: judge, judge: { provider: "claude-code", model: "j1" }, specDir: join(skillDir, "tests") });
    expect(cell().adjudication).toEqual(ADJUDICATION);
  });

  it("recomputes `objective` rather than carrying it — that IS the job", async () => {
    writeTrace();
    await regateRun({ runDir, spec: loadSpec(specPath), adapter: judge, judge: { provider: "claude-code", model: "j1" }, specDir: join(skillDir, "tests") });
    const o = cell().objective!;
    expect(o.status).toBe("PASS");
    // Freshly evaluated against the saved trace, so the hash is the trace's, not
    // the stale one recorded before.
    expect(o.trace_sha256).toBe("b".repeat(64));
  });

  it("preserves the author's override and note", async () => {
    writeTrace();
    await regateRun({ runDir, spec: loadSpec(specPath), adapter: judge, judge: { provider: "claude-code", model: "j1" }, specDir: join(skillDir, "tests") });
    expect(cell().override).toBe("PASS");
    expect(cell().note).toBe("author says fine");
  });
});

describe("rescore (rescoreRun)", () => {
  it("carries BOTH fields — it re-measures nothing", () => {
    rescoreRun({ runDir, spec: loadSpec(specPath) });
    expect(cell().objective).toEqual(OBJECTIVE);
    expect(cell().adjudication).toEqual(ADJUDICATION);
  });
});

describe("the dangerous direction", () => {
  it("an unresolved adjudication that survives a rewrite still blocks SHIP", () => {
    // If a rewriter drops `adjudication` AND `suspect`, a blocked run silently
    // ships. `rescore` re-measures nothing, so both must survive.
    writeResults(runDir, {
      ...readResults(runDir),
      scenarios: [{ ...cell(), override: null, suspect: true }],
    }, { shipBar: { total: 1, min_pass: 1, no_critical_fail: true }, critical: [] });

    rescoreRun({ runDir, spec: loadSpec(specPath) });
    const after = readResults(runDir);
    expect(after.scenarios[0].suspect).toBe(true);
    expect(after.scenarios[0].adjudication?.state).toBe("unresolved");
    expect(after.effective_grade.ship).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The choke point itself
// ---------------------------------------------------------------------------

describe("rebuildScenarioResult", () => {
  const fresh = (): ScenarioResult => ({
    id: "A1", judge_verdict: "FAIL", judge_reason: "fresh reason", suspect: false,
    override: null, note: "",
    reps: 3, passes: 1, clean: 3, flakiness: 0.9, pass_threshold: 0.5,
    objective: { status: "FAIL", assertions: [{ kind: "require_call", status: "FAIL", detail: "fresh" }] },
    adjudication: { state: "confirmed", trigger: "ambiguous", judgments: [], verdict: "FAIL" },
  });
  const prior = (): ScenarioResult => ({
    id: "A1", judge_verdict: "PASS", judge_reason: "old", suspect: true,
    override: "PASS", note: "author note",
    objective: OBJECTIVE, adjudication: ADJUDICATION,
  });

  it("always carries the author's override and note — never policy", () => {
    for (const p of [
      { objective: "carry", adjudication: "carry" },
      { objective: "fresh", adjudication: "fresh" },
      { objective: "drop", adjudication: "drop" },
    ] as const) {
      const r = rebuildScenarioResult(fresh(), prior(), p);
      expect(r.override).toBe("PASS");
      expect(r.note).toBe("author note");
    }
  });

  it("takes verdict, reason, suspect and aggregation shape from the fresh result", () => {
    const r = rebuildScenarioResult(fresh(), prior(), { objective: "carry", adjudication: "carry" });
    expect(r.judge_verdict).toBe("FAIL");
    expect(r.judge_reason).toBe("fresh reason");
    expect(r.suspect).toBe(false);
    expect(r.reps).toBe(3);
    expect(r.flakiness).toBe(0.9);
    expect(r.pass_threshold).toBe(0.5);
  });

  it.each([
    ["carry", OBJECTIVE],
    ["fresh", fresh().objective],
    ["drop", undefined],
  ] as const)("applies objective policy %s", (policy, expected) => {
    const r = rebuildScenarioResult(fresh(), prior(), { objective: policy, adjudication: "carry" });
    expect(r.objective).toEqual(expected);
  });

  it.each([
    ["carry", ADJUDICATION],
    ["fresh", fresh().adjudication],
    ["drop", undefined],
  ] as const)("applies adjudication policy %s", (policy, expected) => {
    const r = rebuildScenarioResult(fresh(), prior(), { objective: "carry", adjudication: policy });
    expect(r.adjudication).toEqual(expected);
  });

  it("OMITS a dropped field rather than setting it to undefined", () => {
    // Absent must stay absent: a result with no evidence has to serialise
    // byte-identically to one written before the field existed.
    const r = rebuildScenarioResult(fresh(), prior(), { objective: "drop", adjudication: "drop" });
    expect("objective" in r).toBe(false);
    expect("adjudication" in r).toBe(false);
  });

  it("carries nothing when there is no prior result", () => {
    const r = rebuildScenarioResult(fresh(), undefined, { objective: "carry", adjudication: "carry" });
    expect(r.objective).toBeUndefined();
    expect(r.override).toBeNull();
    expect(r.note).toBe("");
  });

  it("emits no key outside ScenarioResult's own field set", () => {
    // The runtime backstop for the compile-time exhaustive destructure: if a new
    // field is added and routed through here, it appears in this list and the
    // assertion names it.
    const known = new Set([
      "id", "judge_verdict", "judge_reason", "suspect", "override", "note",
      "reps", "passes", "clean", "flakiness", "pass_threshold",
      "objective", "adjudication",
    ]);
    const r = rebuildScenarioResult(fresh(), prior(), { objective: "carry", adjudication: "carry" });
    expect(Object.keys(r).filter((k) => !known.has(k))).toEqual([]);
  });

  it("omits aggregation fields a single-rep result never had", () => {
    const single: ScenarioResult = { id: "A1", judge_verdict: "PASS", judge_reason: "ok", suspect: false, override: null, note: "" };
    const r = rebuildScenarioResult(single, undefined, { objective: "drop", adjudication: "drop" });
    expect(Object.keys(r).sort()).toEqual(["id", "judge_reason", "judge_verdict", "note", "override", "suspect"]);
  });
});
