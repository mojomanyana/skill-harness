import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { executionFacts } from "../src/judge-evidence.js";
import { traceSha256, serializeTrace } from "../src/execution-trace.js";
import { EXECUTION_TRACE_VERSION, type ExecutionTraceV1 } from "../src/capture-trace-types.js";
import { runSkillModel } from "../src/run.js";
import { regradeRun } from "../src/regrade.js";
import { regateRun } from "../src/regate.js";
import { loadSpec, type Spec } from "../src/spec.js";
import { tracePath, transcriptPath, preserveTranscript } from "../src/results.js";
import type { HarnessAdapter } from "../src/adapters/types.js";

const subject = { provider: "fixture", model: "subject" };
const judge = { provider: "local", model: "judge" };
const identity = { scenarioId: "R1", mode: "force", repetition: 0, turns: 1 };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const answer = "I consulted release-v2.txt: capacity is 64.";
const transcript = `>>> USER:\nWhat is capacity?\n\n<<< ASSISTANT:\n${answer}\n`;
function trace(over: Partial<ExecutionTraceV1> = {}): ExecutionTraceV1 {
  const value: ExecutionTraceV1 = {
    trace_version: EXECUTION_TRACE_VERSION, pi_version: "1.0.4", subject, scenario_id: "R1", mode: "force", rep: 0, turn: 0,
    final_text: answer, final_status: "complete", changed_paths: null, cost_usd: null,
    tool_calls: [{ id: "r1", name: "read", args: { path: "release-v2.txt", token: "DO-NOT-SEND" }, issueIndex: 0, completionIndex: 0, isError: false,
      result: { bytes: 44, sha256: hash("capacity 64"), details: { secret: "DO-NOT-SEND" } } }], ...over,
  };
  return { ...value, trace_sha256: traceSha256(value) };
}
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function corpus(gate = false) {
  const dir = mkdtempSync(join(tmpdir(), "judge-evidence-")); dirs.push(dir);
  mkdirSync(join(dir, "tests"));
  writeFileSync(join(dir, "SKILL.md"), "---\nname: demo\ndescription: demo\n---\nUse evidence.");
  const path = join(dir, "tests/specification.yaml");
  writeFileSync(path, `skill: demo\njudge_persona: judge\nship_bar: {total: 1, min_pass: 1}\nscenarios:\n  - id: R1\n    title: Read evidence\n    turns: [What is capacity?]\n    checklist: [Correct sourced answer]\n${gate ? '    assert:\n      trace:\n        require_calls: [{tool: absent}]\n' : ''}`);
  return { dir, path, spec: loadSpec(path) };
}
function fake() {
  const prompts: string[] = [];
  const adapter: HarnessAdapter = {
    name: "fake", preferStructured: true, available: async () => true, version: async () => "1.0.4",
    run: async () => { throw new Error("structured only"); },
    runStructured: async req => ({ transcript, traces: [trace({ rep: req.rep ?? 0 })] }),
    judge: async req => { prompts.push(req.prompt); return JSON.stringify({ votes: [{ criterion: 1, vote: "PASS", reason: "supported" }], verdict: "PASS", reason: "supported" }); },
  };
  return { adapter, prompts };
}
async function run(c: ReturnType<typeof corpus>, f: ReturnType<typeof fake>, reps = 1) {
  return runSkillModel({ spec: c.spec, skillDir: c.dir, specPath: c.path, adapter: f.adapter, model: subject, modelToken: "fixture:subject", judge, mode: "force", reps, timestamp: "2026-10-15T00:00:00.000Z" });
}

describe("judge execution evidence", () => {
  it("distinguishes completed, error and unfinished calls without disclosing commands or results", () => {
    const t = trace();
    t.tool_calls.push({ ...t.tool_calls[0], id: "b", name: "bash", args: { command: "DO-NOT-SEND" }, issueIndex: 1, completionIndex: 1, isError: true });
    t.tool_calls.push({ ...t.tool_calls[0], id: "u", issueIndex: 2, completionIndex: -1 });
    t.trace_sha256 = traceSha256(t);
    const facts = executionFacts([t], identity, { source: "saved", expectedSha256: t.trace_sha256 });
    expect(facts.calls.map(call => call.state)).toEqual(["completed", "error", "unfinished"]);
    expect(facts.coverage).toBe("partial");
    expect(JSON.stringify(facts)).not.toContain("DO-NOT-SEND");
    expect(executionFacts([t], identity, { source: "saved" }).status).toBe("unknown");
    expect(executionFacts([t], identity, { source: "saved", expectedSha256: "0".repeat(64) }).status).toBe("invalid");
    expect(executionFacts([trace({ rep: 1 })], identity, { source: "live" }).status).toBe("invalid");
    expect(executionFacts([trace({ tool_calls: null as never })], identity, { source: "live" }).status).toBe("invalid");
  });

  it("bounds projection and refuses absence claims for incomplete or legacy capture", () => {
    const base = trace();
    const t = trace({ tool_calls: Array.from({ length: 40 }, (_, i) => ({ ...base.tool_calls[0], id: `c${i}`, issueIndex: i, completionIndex: i })) });
    const facts = executionFacts([t], identity, { source: "live" });
    expect(facts).toMatchObject({ observedCalls: 40, omittedCalls: 8, coverage: "partial" });
    expect(facts.calls).toHaveLength(32);
    expect(executionFacts([trace({ final_status: undefined })], identity, { source: "live" }).coverage).toBe("partial");
    expect(executionFacts([trace({ capture_errors: ["lost event"] })], identity, { source: "live" }).coverage).toBe("partial");
  });

  it("run and regrade share bound facts, preserve exact judge inputs and reject mutated evidence before calls", async () => {
    const c = corpus(), f = fake();
    const result = await run(c, f);
    expect(result.results.scenarios[0].judge_verdict).toBe("PASS");
    const firstInput = result.results.scenarios[0].rep_judgments![0].judgments[0].input!;
    const inputBytes = readFileSync(join(result.runDir, firstInput.artifact), "utf8");
    expect(hash(inputBytes)).toBe(firstInput.sha256);
    expect(JSON.parse(inputBytes).prompts).toEqual(f.prompts);
    preserveTranscript(join(c.dir, "tests/results"), result.runDir, "R1");
    expect(readFileSync(join(c.dir, "tests/results/.gitignore"), "utf8")).toContain(firstInput.artifact);
    expect(f.prompts[0]).toContain('"path":"release-v2.txt"');
    expect(f.prompts[0]).not.toContain("DO-NOT-SEND");
    const grade = () => regradeRun({ runDir: result.runDir, spec: c.spec, adapter: f.adapter, judge, specDir: join(c.dir, "tests") });
    const regraded = await grade();
    expect(regraded.scenarios[0].judge_verdict).toBe("PASS");
    expect(f.prompts[1]).toBe(f.prompts[0]);
    writeFileSync(transcriptPath(result.runDir, "R1", "force"), transcript.replace("capacity is 64", "capacity is 999"));
    await expect(grade()).rejects.toThrow(/final answers do not match/);
    expect(f.prompts).toHaveLength(2);
    writeFileSync(transcriptPath(result.runDir, "R1", "force"), transcript);
    // Regrade's error must not erase the original trace digest binding.
    writeFileSync(tracePath(result.runDir, "R1", "force"), serializeTrace(trace({ final_text: "changed" })));
    await expect(grade()).rejects.toThrow(/final answers do not match/);
    expect(f.prompts).toHaveLength(2);
    expect(readFileSync(join(result.runDir, firstInput.artifact), "utf8")).toBe(inputBytes);
  });

  it("regate supplies the same observed read facts only after deterministic failure is repaired", async () => {
    const c = corpus(true), f = fake();
    const result = await run(c, f);
    expect(result.results.scenarios[0].objective?.status).toBe("FAIL");
    expect(f.prompts).toHaveLength(0);
    const corrected: Spec = { ...c.spec, scenarios: c.spec.scenarios.map(s => ({ ...s, traceAssert: { require_calls: [{ tool: "read" }] } })) };
    const regated = await regateRun({ runDir: result.runDir, spec: corrected, specDir: join(c.dir, "tests"), adapter: f.adapter, judge });
    expect(regated.judgeCalls).toBe(1);
    expect(f.prompts[0]).toContain('"path":"release-v2.txt"');
    expect(regated.results.scenarios[0].judge_verdict).toBe("PASS");
    writeFileSync(tracePath(result.runDir, "R1", "force"), serializeTrace(trace({ tool_calls: [] })));
    const rejected = await regateRun({ runDir: result.runDir, spec: corrected, specDir: join(c.dir, "tests"), adapter: f.adapter, judge });
    expect(rejected.results.scenarios[0].objective?.status).toBe("ERROR");
    expect(f.prompts).toHaveLength(1);
  });

  it("preflights all selected repetitions before judge spend and preserves prior records", async () => {
    const c = corpus(), f = fake(), result = await run(c, f, 2);
    const before = readFileSync(join(result.runDir, "results.yaml"), "utf8");
    writeFileSync(tracePath(result.runDir, "R1", "force", 1), "{torn");
    await expect(regradeRun({ runDir: result.runDir, spec: c.spec, adapter: f.adapter, judge, specDir: join(c.dir, "tests") })).rejects.toThrow(/unreadable/);
    expect(f.prompts).toHaveLength(2);
    expect(readFileSync(join(result.runDir, "results.yaml"), "utf8")).toBe(before);
  });
});
