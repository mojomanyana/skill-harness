import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { regradeScenario, parseSpec, type HarnessAdapter, type JudgeReq } from "../src/index.js";
import { judgeOneRep, regradeRun } from "../src/regrade.js";
import { readJournal, readResults, writeResults } from "../src/index.js";
import { PROVIDER_FAILURE_MARKER } from "../src/provider-failure.js";

const tmps: string[] = [];
function tmp() { const d = mkdtempSync(join(tmpdir(), "sc-regrade-")); tmps.push(d); return d; }
afterEach(() => { while (tmps.length) rmSync(tmps.pop()!, { recursive: true, force: true }); });

const SPEC = `
skill: demo
judge_persona: a judge.
ship_bar: { total: 1, min_pass: 1 }
scenarios:
  - id: A1
    title: t
    turns: ["hi"]
    checklist: ["ok"]
`;
const scenarioOf = (text: string) => parseSpec(text, "s.yaml");

function judgeAdapter(raw: string): HarnessAdapter {
  return { name: "pi", available: async () => true, run: async () => "", judge: async (_: JudgeReq) => raw };
}

describe("regradeScenario", () => {
  it("re-judges a single green transcript, rewrites judge-raw, returns the verdict", async () => {
    const runDir = tmp();
    writeFileSync(join(runDir, "A1.green.txt"), "USER: hi\nASSISTANT: hello", "utf8");
    const spec = scenarioOf(SPEC);
    const r = await regradeScenario({
      runDir, spec, scenario: spec.scenarios[0],
      adapter: judgeAdapter("1. PASS — ok\nVERDICT: PASS\nREASON: fine"),
      judge: { provider: "claude-code", model: "opus" }, specDir: runDir, threshold: 0.5,
      now: () => "t",
    });
    expect(r.judge_verdict).toBe("PASS");
    expect(r.reps).toBeUndefined(); // single transcript → no reps fields
    expect(readFileSync(join(runDir, "A1.green.judge.txt"), "utf8")).toMatch(/VERDICT: PASS/);
  });

  it("re-judges all rep transcripts and re-aggregates", async () => {
    const runDir = tmp();
    writeFileSync(join(runDir, "A1.green.rep0.txt"), "t0", "utf8");
    writeFileSync(join(runDir, "A1.green.rep1.txt"), "t1", "utf8");
    writeFileSync(join(runDir, "A1.green.rep2.txt"), "t2", "utf8");
    const spec = scenarioOf(SPEC);
    const r = await regradeScenario({
      runDir, spec, scenario: spec.scenarios[0],
      adapter: judgeAdapter("1. PASS — ok\nVERDICT: PASS\nREASON: fine"),
      judge: { provider: "claude-code", model: "opus" }, specDir: runDir, threshold: 0.5,
      now: () => "t",
    });
    expect(r.reps).toBe(3);
    expect(r.judge_verdict).toBe("PASS");
    expect(existsSync(join(runDir, "A1.green.rep2.judge.txt"))).toBe(true);
  });

  it("rejects a non-contiguous recorded repetition set before judging", async () => {
    const runDir = tmp();
    // rep1 is missing (e.g. a killed run) — file INDEX 1 is rep2's file.
    writeFileSync(join(runDir, "A1.green.rep0.txt"), "t0", "utf8");
    writeFileSync(join(runDir, "A1.green.rep2.txt"), "t2", "utf8");
    const spec = scenarioOf(SPEC);
    await expect(regradeScenario({
      runDir, spec, scenario: spec.scenarios[0],
      adapter: judgeAdapter("1. PASS — ok\nVERDICT: PASS\nREASON: fine"),
      judge: { provider: "claude-code", model: "opus" }, specDir: runDir, threshold: 0.5,
      expectedReps: 3, now: () => "t",
    })).rejects.toThrow(/incomplete for 3 recorded rep/);
    expect(existsSync(join(runDir, "A1.green.rep0.judge.txt"))).toBe(false);
    expect(existsSync(join(runDir, "A1.green.rep2.judge.txt"))).toBe(false);
  });

  it("throws when there are no green transcripts", async () => {
    const runDir = tmp();
    const spec = scenarioOf(SPEC);
    await expect(regradeScenario({
      runDir, spec, scenario: spec.scenarios[0],
      adapter: judgeAdapter("VERDICT: PASS\nREASON: x"),
      judge: { provider: "claude-code", model: "opus" }, specDir: runDir, threshold: 0.5,
    })).rejects.toThrow(/no green transcripts/);
  });
});

describe("regradeRun", () => {
  it("regradeRun re-judges a run dir's green transcripts and rewrites results.yaml", async () => {
    const runDir = tmp();
    writeFileSync(join(runDir, "A1.green.txt"), "USER: hi\nASSISTANT: hello", "utf8");
    const spec = scenarioOf(SPEC);
    writeResults(runDir, {
      skill: "demo", harness: "pi", model: "fireworks:fake",
      judge: { provider: "claude-code", model: "opus" },
      timestamp: "2026-07-03T00:00:00Z", label: null, mode: "green",
      scenarios: [{ id: "A1", judge_verdict: "FAIL", judge_reason: "old", suspect: false, override: null, note: "keep me" }],
    }, { shipBar: spec.ship_bar, critical: spec.critical ?? [] });

    const out = await regradeRun({
      runDir, spec,
      adapter: judgeAdapter("1. PASS — ok\nVERDICT: PASS\nREASON: ok"),
      judge: { provider: "claude-code", model: "opus" }, specDir: runDir, now: () => "t",
    });

    expect(out.scenarios[0].judge_verdict).toBe("PASS");
    expect(out.scenarios[0].note).toBe("keep me"); // prior note carried over
    expect(out.timestamp).toBe("2026-07-03T00:00:00Z"); // original timestamp preserved

    const persisted = readResults(runDir);
    expect(persisted.effective_grade).toEqual(out.effective_grade); // persisted
    expect(persisted.scenarios[0].judge_verdict).toBe("PASS");
  });
});

describe("judgeOneRep", () => {
  it("judgeOneRep judges a transcript, writes judge-raw, journals, returns the outcome", async () => {
    const runDir = tmp();
    const spec = scenarioOf(SPEC);
    const o = await judgeOneRep({
      runDir, spec, scenario: spec.scenarios[0], transcript: "USER: hi\nASSISTANT: hello",
      adapter: judgeAdapter("1. PASS — ok\nVERDICT: PASS\nREASON: fine"),
      judge: { provider: "claude-code", model: "opus" }, specDir: runDir, mode: "green", rep: undefined, now: () => "t",
    });
    expect(o).toMatchObject({ verdict: "PASS", reason: "fine", suspect: false, metrics: { judge_calls: 1, judge_rejudge_calls: 0 } });
    expect(readFileSync(join(runDir, "A1.green.judge.txt"), "utf8")).toMatch(/VERDICT: PASS/);
    const jv = readJournal(runDir).filter((e) => e.event === "judge-verdict");
    expect(jv).toHaveLength(1);
    expect(jv[0]).toMatchObject({ id: "A1", verdict: "PASS" });
  });

  // I2: a provider outage recorded in a SAVED transcript (by run()'s marker, or
  // by runStructured's — see pi.ts) must stay ERROR through a re-judge. Before
  // this fix, judgeOneRep had no provider-failure check at all — the guard
  // run.ts applies before ever calling this function does not exist on the
  // grade/regrade path, which reads the transcript straight off disk. A
  // provider outage would be spent a judge call and turned into a model
  // verdict — infrastructure noise reported as a finding.
  //
  // Mutation: deleting the `providerFailureFromTranscript` check at the top of
  // judgeOneRep (regrade.ts) makes this test's `verdict` assertion fail (it
  // would come back "PASS", the judge would have been called once, and no
  // ERROR journal entry would exist).
  it("re-judges a provider-failure transcript to ERROR without spending a judge call", async () => {
    const runDir = tmp();
    const spec = scenarioOf(SPEC);
    let judgeCalls = 0;
    const adapter: HarnessAdapter = {
      name: "pi", available: async () => true, run: async () => "",
      judge: async (_: JudgeReq) => { judgeCalls += 1; return "1. PASS — ok\nVERDICT: PASS\nREASON: fine"; },
    };
    const transcript = `>>> USER:\nhi\n\n<<< ASSISTANT:\n\n${PROVIDER_FAILURE_MARKER} openai-codex: invalidated oauth token\n`;

    const o = await judgeOneRep({
      runDir, spec, scenario: spec.scenarios[0], transcript,
      adapter, judge: { provider: "claude-code", model: "opus" }, specDir: runDir, mode: "green", rep: undefined, now: () => "t",
    });

    expect(o.verdict).toBe("ERROR");
    expect(o.reason).toContain("openai-codex");
    expect(o.metrics.judge_calls).toBe(0);
    expect(judgeCalls).toBe(0);
    const jv = readJournal(runDir).filter((e) => e.event === "judge-verdict");
    expect(jv).toHaveLength(1);
    expect(jv[0]).toMatchObject({ id: "A1", verdict: "ERROR" });
  });

  it("emits a misfire-flag alongside judge-verdict when the judge's verdict disagrees with its own items", async () => {
    const runDir = tmp();
    const spec = scenarioOf(SPEC);
    // Item 2 FAILs but the overall verdict is PASS — detectMisfire flags this suspect.
    const o = await judgeOneRep({
      runDir, spec, scenario: spec.scenarios[0], transcript: "USER: hi\nASSISTANT: hello",
      adapter: judgeAdapter("1. PASS — ok\n2. FAIL — missing\nVERDICT: PASS\nREASON: looks ok"),
      judge: { provider: "claude-code", model: "opus" }, specDir: runDir, mode: "green", rep: undefined, now: () => "t",
    });
    expect(o).toMatchObject({ verdict: "PASS", reason: "looks ok", suspect: true, metrics: { judge_calls: 1, judge_rejudge_calls: 0 } });
    const events = readJournal(runDir);
    const jv = events.filter((e) => e.event === "judge-verdict");
    const misfire = events.filter((e) => e.event === "misfire-flag");
    expect(jv).toHaveLength(1);
    expect(jv[0]).toMatchObject({ id: "A1", verdict: "PASS", suspect: true });
    expect(misfire).toHaveLength(1);
    expect(misfire[0]).toMatchObject({ id: "A1", reason: "looks ok" });
  });
});
