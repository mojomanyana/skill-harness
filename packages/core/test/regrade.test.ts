import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { regradeScenario, parseSpec, type HarnessAdapter, type JudgeReq } from "../src/index.js";
import { judgeOneRep, regradeRun } from "../src/regrade.js";
import { readJournal, readResults, writeResults } from "../src/index.js";
import yaml from "js-yaml";
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
const reply = (votes: Array<"PASS" | "FAIL">, verdict: "PASS" | "FAIL", reason: string) => JSON.stringify({
  votes: votes.map((vote, i) => ({ criterion: i + 1, vote, reason: "ok" })), verdict, reason,
});

describe("regradeScenario", () => {
  it("re-judges a single green transcript, rewrites judge-raw, returns the verdict", async () => {
    const runDir = tmp();
    writeFileSync(join(runDir, "A1.green.txt"), "USER: hi\nASSISTANT: hello", "utf8");
    const spec = scenarioOf(SPEC);
    const r = await regradeScenario({
      runDir, spec, scenario: spec.scenarios[0],
      adapter: judgeAdapter(reply(["PASS"], "PASS", "fine")),
      judge: { provider: "claude-code", model: "opus" }, specDir: runDir, threshold: 0.5,
      now: () => "t",
    });
    expect(r.judge_verdict).toBe("PASS");
    expect(r.reps).toBeUndefined(); // single transcript → no reps fields
    expect(readFileSync(join(runDir, "A1.green.judge.txt"), "utf8")).toContain('"verdict":"PASS"');
  });

  it("re-judges all rep transcripts and re-aggregates", async () => {
    const runDir = tmp();
    writeFileSync(join(runDir, "A1.green.rep0.txt"), "t0", "utf8");
    writeFileSync(join(runDir, "A1.green.rep1.txt"), "t1", "utf8");
    writeFileSync(join(runDir, "A1.green.rep2.txt"), "t2", "utf8");
    const spec = scenarioOf(SPEC);
    const r = await regradeScenario({
      runDir, spec, scenario: spec.scenarios[0],
      adapter: judgeAdapter(reply(["PASS"], "PASS", "fine")),
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
      adapter: judgeAdapter(reply(["PASS"], "PASS", "fine")),
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
      adapter: judgeAdapter(reply(["PASS"], "PASS", "x")),
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
      adapter: judgeAdapter(reply(["PASS"], "PASS", "ok")),
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

function retainedVoteRun() {
  const runDir = tmp();
  const spec = scenarioOf(SPEC);
  const judge = { provider: "openai-codex", model: "recorded" };
  // Seed historical 0.22.3 bytes directly: a current writer correctly upgrades
  // missing-vote PASSs, which would no longer exercise retained-record repair.
  const prior: import("../src/results.js").ResultsFile = {
    schema: 2, harness_version: "0.22.3", effective_grade: { passed: 1, total: 1, pct: 100, letter: "A", ship: true, note: "" },
    skill: spec.skill, harness: "pi", model: "fake", judge, timestamp: "original", label: null, mode: "force",
    scenarios: [{ id: "A1", criterion_count: 1, judge_verdict: "PASS", judge_reason: "old", suspect: false, override: null, note: "", reps: 2, passes: 2, clean: 2, flakiness: 0, pass_threshold: 1,
      rep_judgments: [1, 0].map(repetition => ({ repetition, recorded_verdict: "PASS", judgments: [{ ordinal: 1, judge, verdict: "PASS", reason: "old", suspect: false, criteria: [{ index: 1, verdict: "ERROR", reason: "unparsed" }] }] })),
    }],
  };
  writeFileSync(join(runDir, "results.yaml"), yaml.dump(prior));
  for (const rep of [0, 1]) {
    writeFileSync(join(runDir, `A1.force.rep${rep}.txt`), `transcript ${rep}`);
    writeFileSync(join(runDir, `A1.force.rep${rep}.judge.txt`), `old raw ${rep}`);
  }
  return { runDir, spec, judge, prior };
}

describe("criterion-vote recovery", () => {
  it("accepts unordered retained repetition panels", async () => {
    const { runDir, spec, judge } = retainedVoteRun();
    let calls = 0;
    const adapter = { ...judgeAdapter(""), judge: async () => { calls++; return reply(["PASS"], "PASS", "fine"); } };
    const out = await regradeRun({ runDir, spec, judge, adapter, specDir: runDir, onlyUnparsed: true });
    expect(calls).toBe(2);
    expect(out.scenarios[0].rep_judgments?.map(panel => panel.repetition)).toEqual([0, 1]);
  });

  it("rejects schema-3 criterion-count drift before judge calls or artifact writes", async () => {
    const { runDir, spec, judge, prior } = retainedVoteRun();
    const objective = { status: "PASS" as const, assertions: [{ kind: "skill_delivered", status: "PASS" as const, detail: "observed" }] };
    prior.schema = 3;
    prior.scenarios[0].objective = objective;
    prior.scenarios[0].rep_judgments!.forEach(panel => { panel.objective = objective; });
    prior.scenarios[0].rep_judgments![1].judgments[0].criteria![0].verdict = "PASS";
    const h = "a".repeat(64);
    prior.subject_invocations = [0, 1].map(repetition => ({ scenario_id: "A1", repetition, prompt: {
      capture_version: "prompt-provenance-v1", request_index: 0, raw_sha256: h, normalized_sha256: h,
      normalization_rule: "cwd-line-v1", bytes: 1, contract_sha256: h, contract_bytes: 1,
      contract_occurrences: 0, mechanism: "none", status: "PASS",
    } }));
    writeFileSync(join(runDir, "results.yaml"), yaml.dump(prior));
    const before = readFileSync(join(runDir, "results.yaml"), "utf8");
    spec.scenarios[0].checklist.push("new criterion");
    let calls = 0;
    const adapter = { ...judgeAdapter(""), judge: async () => { calls++; return reply(["PASS", "PASS"], "PASS", "fine"); } };
    await expect(regradeRun({ runDir, spec, judge, adapter, specDir: runDir, onlyUnparsed: true })).rejects.toThrow(/criterion count.*full grade/);
    expect(calls).toBe(0);
    expect(readFileSync(join(runDir, "results.yaml"), "utf8")).toBe(before);
    expect(readFileSync(join(runDir, "A1.force.rep1.judge.txt"), "utf8")).toBe("old raw 1");
  });

  it.each(["PASS", "FAIL"] as const)("preserves untouched adjudication, bounded by the all-clean policy (%s)", async verdict => {
    const { runDir, spec, judge, prior } = retainedVoteRun();
    const cleanPanel = prior.scenarios[0].rep_judgments!.find(panel => panel.repetition === 0)!;
    cleanPanel.judgments[0].criteria![0].verdict = "PASS";
    cleanPanel.judgments[0].verdict = "FAIL";
    cleanPanel.judgments[0].suspect = true;
    cleanPanel.judgments.push(...[2, 3].map(ordinal => ({ ...cleanPanel.judgments[0], ordinal, verdict: "PASS" as const, suspect: false })));
    prior.scenarios[0].adjudication = { repetition: 0, state: "confirmed", trigger: "contradictory", verdict: "PASS", judgments: cleanPanel.judgments };
    writeFileSync(join(runDir, "results.yaml"), yaml.dump(prior));
    const out = await regradeRun({ runDir, spec, judge, adapter: judgeAdapter(reply([verdict], verdict, "fine")), specDir: runDir, onlyUnparsed: true });
    expect(out.scenarios[0].clean).toBe(2);
    expect(out.scenarios[0].rep_judgments?.[0]).toEqual(cleanPanel);
    expect(out.scenarios[0].adjudication?.state).toBe(verdict === "PASS" ? "confirmed" : "unresolved");
    expect(out.scenarios[0].judge_verdict).toBe(verdict);
    expect(out.scenarios[0].adjudication?.verdict).toBe(verdict === "PASS" ? "PASS" : undefined);
  });

  it("preserves a settled FAIL adjudication during schema-3 selective repair", async () => {
    const { runDir, spec, judge, prior } = retainedVoteRun();
    const recorded = prior.scenarios[0];
    const failedPanel = recorded.rep_judgments!.find(panel => panel.repetition === 0)!;
    failedPanel.recorded_verdict = "FAIL";
    failedPanel.judgments[0].verdict = "FAIL";
    failedPanel.judgments[0].criteria![0].verdict = "FAIL";
    failedPanel.judgments.push({ ...failedPanel.judgments[0], ordinal: 2 });
    recorded.adjudication = { repetition: 0, state: "confirmed", trigger: "ship_deciding", verdict: "FAIL", judgments: failedPanel.judgments };
    recorded.judge_verdict = "FAIL";
    recorded.passes = 1;
    recorded.flakiness = 1;
    const objective = { status: "PASS" as const, assertions: [{ kind: "skill_delivered", status: "PASS" as const, detail: "observed" }] };
    prior.schema = 3;
    recorded.objective = objective;
    recorded.rep_judgments!.forEach(panel => { panel.objective = objective; });
    const h = "a".repeat(64);
    prior.subject_invocations = [0, 1].map(repetition => ({ scenario_id: "A1", repetition, prompt: {
      capture_version: "prompt-provenance-v1", request_index: 0, raw_sha256: h, normalized_sha256: h,
      normalization_rule: "cwd-line-v1", bytes: 1, contract_sha256: h, contract_bytes: 1,
      contract_occurrences: 0, mechanism: "none", status: "PASS",
    } }));
    writeFileSync(join(runDir, "results.yaml"), yaml.dump(prior));
    const raw = reply(["PASS"], "PASS", "fine");
    let calls = 0;
    const adapter = { ...judgeAdapter(""), judge: async () => { calls++; return raw; } };
    const out = await regradeRun({ runDir, spec, judge, adapter, specDir: runDir, onlyUnparsed: true });
    expect(calls).toBe(1);
    expect(out.scenarios[0].adjudication).toEqual(recorded.adjudication);
    expect(out.scenarios[0].judge_verdict).toBe("FAIL");
    expect(out.scenarios[0].suspect).toBe(false);
    expect(out.scenarios[0].rep_judgments?.[0]).toEqual(failedPanel);
    expect(readResults(runDir)).toEqual(out);
    expect(readFileSync(join(runDir, "A1.force.rep0.judge.txt"), "utf8")).toBe("old raw 0");
    expect(readFileSync(join(runDir, "A1.force.rep1.judge.txt"), "utf8")).toBe(raw);
  });

  it.each([true, false])("retries missing criterion votes once (retry succeeds: %s)", async (succeeds) => {
    const runDir = tmp();
    const spec = scenarioOf(SPEC.replace('checklist: ["ok"]', 'checklist: ["ok", "complete"]'));
    const requests: JudgeReq[] = [];
    const broken = "VERDICT: PASS\nREASON: prose";
    const repaired = reply(["PASS", "PASS"], "PASS", "fine");
    const adapter: HarnessAdapter = {
      ...judgeAdapter(broken),
      judge: async (req) => { requests.push(req); return requests.length === 2 && succeeds ? repaired : broken; },
    };
    const outcome = await judgeOneRep({
      runDir, spec, scenario: spec.scenarios[0], transcript: "saved response",
      adapter, judge: { provider: "openai-codex", model: "recorded" },
      specDir: runDir, mode: "force", rep: undefined, now: () => "t",
    });
    expect(requests).toHaveLength(2);
    expect(requests[1].prompt).toContain(requests[0].prompt);
    expect(requests[1].prompt).toMatch(/reply was not valid.*reply with only the JSON object/i);
    expect(outcome.judgment?.judgeRetries).toBe(1);
    expect(outcome.judgment?.criteria?.map(v => v.verdict)).toEqual(succeeds ? ["PASS", "PASS"] : ["ERROR", "ERROR"]);
    expect(outcome.metrics?.judge_calls).toBe(2);
    const retained = readFileSync(join(runDir, "A1.force.judge.txt"), "utf8");
    expect(retained).toContain(broken);
    expect(retained).toContain(succeeds ? repaired : broken);
  });

  it("regrades only ERROR-criterion reps, preserving clean siblings and scenarios", async () => {
    const runDir = tmp();
    const spec = scenarioOf(SPEC.replace("total: 1, min_pass: 1", "total: 2, min_pass: 2") + `
  - id: A2
    title: clean
    turns: ["bye"]
    checklist: ["ok"]
`);
    const recordedJudge = { provider: "openai-codex", model: "recorded" };
    const judgment = (verdict: "PASS" | "ERROR") => ({ ordinal: 1, judge: recordedJudge, verdict: "PASS" as const, reason: "old", suspect: false, criteria: [{ index: 1, verdict, reason: "old" }] });
    const cleanPanel = { repetition: 0, recorded_verdict: "PASS" as const, judgments: [judgment("PASS")] };
    const prior = writeResults(runDir, {
      skill: spec.skill, harness: "pi", model: "fake", judge: recordedJudge,
      timestamp: "original", label: null, mode: "force",
      scenarios: [
        { id: "A1", judge_verdict: "PASS", judge_reason: "old", suspect: false, override: null, note: "keep", reps: 2, passes: 2, clean: 2, flakiness: 0, pass_threshold: 1,
          rep_judgments: [cleanPanel, { repetition: 1, recorded_verdict: "PASS", judgments: [judgment("ERROR")] }] },
        { id: "A2", judge_verdict: "PASS", judge_reason: "old", suspect: false, override: null, note: "", rep_judgments: [cleanPanel] },
      ],
    }, { shipBar: spec.ship_bar, critical: [] });
    // Clean transcripts deliberately absent: no reason to require them for this repair.
    writeFileSync(join(runDir, "A1.force.rep1.txt"), "broken-vote transcript");
    writeFileSync(join(runDir, "A1.force.rep0.judge.txt"), "clean raw bytes");
    const requests: JudgeReq[] = [];
    const adapter: HarnessAdapter = {
      ...judgeAdapter(""), judge: async req => { requests.push(req); return reply(["FAIL"], "FAIL", "missing"); },
    };
    const out = await regradeRun({
      runDir, spec, adapter, judge: recordedJudge, specDir: runDir, onlyUnparsed: true, now: () => "t",
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].model).toEqual(recordedJudge);
    expect(requests[0].prompt).toContain("broken-vote transcript");
    expect(out.scenarios[0].rep_judgments?.[0]).toEqual(cleanPanel);
    expect(out.scenarios[1]).toEqual(prior.scenarios[1]);
    expect(out.scenarios[0].rep_judgments?.[1].judgments[0].criteria?.[0].verdict).toBe("FAIL");
    expect(out.scenarios[0].judge_verdict).toBe("FAIL");
    expect(out.scenarios[0].metrics?.judge_calls).toBe(1);
    expect(out.scenarios[0].note).toBe("keep");
    expect(readFileSync(join(runDir, "A1.force.rep0.judge.txt"), "utf8")).toBe("clean raw bytes");
    const bytes = readFileSync(join(runDir, "results.yaml"), "utf8");
    await regradeRun({ runDir, spec, adapter, judge: recordedJudge, specDir: runDir, onlyUnparsed: true });
    expect(requests).toHaveLength(1);
    expect(readFileSync(join(runDir, "results.yaml"), "utf8")).toBe(bytes);
  });
});

describe("judgeOneRep", () => {
  it("judgeOneRep judges a transcript, writes judge-raw, journals, returns the outcome", async () => {
    const runDir = tmp();
    const spec = scenarioOf(SPEC);
    const o = await judgeOneRep({
      runDir, spec, scenario: spec.scenarios[0], transcript: "USER: hi\nASSISTANT: hello",
      adapter: judgeAdapter(reply(["PASS"], "PASS", "fine")),
      judge: { provider: "claude-code", model: "opus" }, specDir: runDir, mode: "green", rep: undefined, now: () => "t",
    });
    expect(o).toMatchObject({ verdict: "PASS", reason: "fine", suspect: false, metrics: { judge_calls: 1, judge_rejudge_calls: 0 } });
    expect(readFileSync(join(runDir, "A1.green.judge.txt"), "utf8")).toContain('"verdict":"PASS"');
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
      judge: async (_: JudgeReq) => { judgeCalls += 1; return reply(["PASS"], "PASS", "fine"); },
    };
    const transcript = `${PROVIDER_FAILURE_MARKER} openai-codex: invalidated oauth token\n\n>>> USER:\nhi\n\n<<< ASSISTANT:\n\n`;

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
      adapter: judgeAdapter(reply(["FAIL"], "PASS", "looks ok")),
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
