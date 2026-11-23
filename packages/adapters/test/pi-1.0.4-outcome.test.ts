import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  executionFailureFromTranscript, withExecutionFailure, loadSpec,
  runSkillModel, regradeScenario, exec, deserializeTrace, runSummaryLines,
} from "@skill-harness/core";

const replay = vi.hoisted(() => ({ text: "", code: 0, calls: 0, version: "1.0.4" as string | null,
  armVersion: "1.5.3" as string | null, nextArmVersion: undefined as string | null | undefined }));
function changeSelectedPiAfterFirstTurn() {
  if (replay.calls === 1 && replay.nextArmVersion !== undefined) replay.armVersion = replay.nextArmVersion;
}
vi.mock("node:child_process", async (original) => {
  const actual = await original<typeof import("node:child_process")>();
  return { ...actual,
  spawn: vi.fn((...args: Parameters<typeof actual.spawn>) => {
    if (args[0] !== "pi") return actual.spawn(...args);
    replay.calls++;
    const child = new EventEmitter() as EventEmitter & { stdout: Readable; stderr: Readable; kill: ReturnType<typeof vi.fn> };
    child.stdout = new Readable({ read() {} });
    child.stderr = new Readable({ read() {} });
    child.kill = vi.fn();
    queueMicrotask(() => {
      child.stdout.push(replay.text);
      child.stdout.push(null);
      child.stderr.push(null);
      setImmediate(() => { changeSelectedPiAfterFirstTurn(); child.emit("close", replay.code); });
    });
    return child;
  }),
};
});
vi.mock("@skill-harness/core", async (original) => {
  const actual = await original<typeof import("@skill-harness/core")>();
  return { ...actual,
  onPath: () => true,
  exec: vi.fn(async (command, args, options) => {
    if (command !== "pi") return actual.exec(command, args, options);
    if (args[0] !== "--version") {
      replay.calls++; changeSelectedPiAfterFirstTurn();
      return { code: replay.code, stdout: "hello\n", stderr: "" };
    }
    const version = options?.env?.PATH === "/fixture/unqualified-bin" ? "1.0.3"
      : options?.env?.PATH === "/fixture/arm-bin" ? replay.armVersion : replay.version;
    return { code: version === null ? 1 : 0, stdout: version === null ? "" : version + "\n", stderr: "" };
  }),
};
});
import { piAdapter } from "../src/pi.js";

const roots: string[] = [];
const message = (text: string, stopReason = "stop") => ({ type: "message_end",
  message: { role: "assistant", content: [{ type: "text", text }], stopReason } });
const settled = { type: "agent_settled" };
const jsonl = (...events: unknown[]) => events.map((event) => JSON.stringify(event)).join("\n") + "\n";
const subject = { provider: "fixture", model: "subject" };
const judgeModel = { provider: "local", model: "judge" };
function fixture(turns = ["hi"], seeded = false) {
  const root = mkdtempSync(join(tmpdir(), "sh-terminal-outcome-")); roots.push(root);
  mkdirSync(join(root, "tests"));
  writeFileSync(join(root, "SKILL.md"), "---\nname: demo\ndescription: test\n---\nSay hello.\n");
  const specPath = join(root, "tests", "specification.yaml");
  if (seeded) {
    mkdirSync(join(root, "tests", "fixture"));
    writeFileSync(join(root, "tests", "fixture", "seed.txt"), "seed\n");
  }
  writeFileSync(specPath, `skill: demo\njudge_persona: strict reviewer\nship_bar:\n  total: 1\n  min_pass: 1\nscenarios:\n  - id: A1\n    title: greeting\n    turns: ${JSON.stringify(turns)}\n    checklist: ['says hello']\n${seeded ? "    mode: seeded\n    fixture: fixture\n" : ""}`);
  return { root, specPath, spec: loadSpec(specPath) };
}
beforeEach(() => { replay.text = ""; replay.code = 0; replay.calls = 0; replay.version = "1.0.4"; replay.armVersion = "1.5.3"; replay.nextArmVersion = undefined; });
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

const unavailable = [
  ["generic terminal error", jsonl(message("partial answer", "error"), settled)],
  ["abort", jsonl(message("partial answer", "aborted"), settled)],
  ["output truncation", jsonl(message("partial answer", "length"), settled)],
  ["empty final", jsonl(message(""), settled)],
  ["tool-call final", jsonl({ type: "message_end", message: { role: "assistant", stopReason: "stop", content: [
    { type: "text", text: "partial" }, { type: "toolCall", id: "one", name: "read", arguments: {} },
  ] } }, settled)],
  ["late streaming update", jsonl(message("stale answer"), settled, { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "later" } }, settled)],
  ["missing settlement", jsonl(message("plausible answer"))],
  ["missing current-cycle settlement", jsonl(message("old answer"), settled, { type: "agent_start" }, message("new answer"))],
  ["malformed tail", jsonl(message("plausible answer"), settled) + "{broken\n"],
  ["missing tool identity", jsonl({ type: "tool_execution_start", toolName: "write" }, message("plausible answer"), settled)],
] as const;

describe("Pi 1.0.4 outcomes through ungated execution and saved regrade", () => {
  it.each(unavailable)("keeps %s ERROR without invoking the judge", async (_name, text) => {
    replay.text = text;
    const { root, specPath, spec } = fixture();
    const judge = vi.fn(async () => "VERDICT: PASS\n1. PASS");
    const adapter = { ...piAdapter, judge };
    const summary = await runSkillModel({ spec, specPath, skillDir: root, adapter,
      model: subject, modelToken: "fixture:subject", judge: judgeModel, mode: "force",
      timestamp: "2026-10-07T00:00:00.000Z" });
    expect(summary.results.scenarios[0].judge_verdict).toBe("ERROR");
    expect(summary.results.scenarios[0].judge_reason).toContain("execution failure");
    expect(replay.calls).toBe(1); // known unavailable delivery is not retried as an empty answer
    expect(judge).not.toHaveBeenCalled();
    const transcript = readFileSync(join(summary.runDir, "A1.force.txt"), "utf8");
    expect(executionFailureFromTranscript(transcript)).toContain("Pi 1.0.4");
    const regraded = await regradeScenario({ runDir: summary.runDir, spec, scenario: spec.scenarios[0],
      adapter, judge: judgeModel, specDir: dirname(specPath), threshold: 1, mode: "force", expectedReps: 1 });
    expect(regraded.judge_verdict).toBe("ERROR");
    expect(judge).not.toHaveBeenCalled();
  });

  // 1.0.5, 1.4.1 and 1.5.3 left this list: later patches of a qualified minor now run, flagged (below).
  it.each(["1.0.3", "1.0.4-rc.1", "1.2.0", "1.3.0", "1.4.0-rc.1", "1.5.0-rc.1", "1.5.1", "1.5.2-rc.1", "1.5.3-beta.1", "1.5.3+x", "2.0.0", "0.83.0", "unknown", null])("refuses fresh unqualified Pi %s before a subject call and saved regrade", async (version) => {
    replay.version = version;
    replay.text = jsonl(message("plausible answer"), settled);
    const { root, specPath, spec } = fixture();
    const judge = vi.fn(async () => "VERDICT: PASS\n1. PASS");
    const adapter = { ...piAdapter, judge };
    const summary = await runSkillModel({ spec, specPath, skillDir: root, adapter,
      model: subject, modelToken: "fixture:subject", judge: judgeModel, mode: "force",
      timestamp: "2026-10-07T00:00:00.000Z" });
    expect(summary.results.scenarios[0].judge_verdict).toBe("ERROR");
    expect(replay.calls).toBe(0);
    const transcript = readFileSync(join(summary.runDir, "A1.force.txt"), "utf8");
    expect(executionFailureFromTranscript(transcript)).toContain("unqualified");
    const regraded = await regradeScenario({ runDir: summary.runDir, spec, scenario: spec.scenarios[0],
      adapter, judge: judgeModel, specDir: dirname(specPath), threshold: 1, mode: "force", expectedReps: 1 });
    expect(regraded.judge_verdict).toBe("ERROR");
    expect(judge).not.toHaveBeenCalled();
  });

  it.each(["error", "stop-then-error"])("preserves actual captured %s as an execution failure", async (name) => {
    replay.text = readFileSync(new URL(`./fixtures/pi-1.0.4/${name}.jsonl`, import.meta.url), "utf8");
    const { root } = fixture();
    const result = await piAdapter.runStructured!({ skillDir: root, cwd: root, model: subject,
      mode: "force", turns: ["hi", "later dependent work"] });
    expect(result.executionFailure).toContain("final delivery error");
    expect(result.traces).toHaveLength(1);
    expect(result.traces[0].final_status).toBe("error");
    expect(replay.calls).toBe(1);
  });

  it("keeps a successful qualified retry after a transport diagnostic judgeable", async () => {
    replay.text = jsonl({ type: "message_start", message: { role: "assistant", provider: "fixture",
      diagnostics: [{ type: "provider_transport_failure", error: { message: "temporary transport" } }] } },
      message("failed partial", "error"), { type: "agent_end", willRetry: true },
      message("  recovered answer\n\n"), settled);
    const { root } = fixture();
    const result = await piAdapter.runStructured!({ skillDir: root, cwd: root, model: subject,
      mode: "force", turns: ["hi"] });
    expect(result.providerFailure).toBeUndefined();
    expect(result.executionFailure).toBeUndefined();
    expect(result.traces[0].final_text).toBe("  recovered answer\n\n");
    expect(result.transcript).toContain("<<< ASSISTANT:\n  recovered answer\n\n\n");
  });

  it("does not accept a nonzero process exit even after a complete final", async () => {
    replay.text = jsonl(message("answer"), settled); replay.code = 1;
    const { root } = fixture();
    const result = await piAdapter.runStructured!({ skillDir: root, cwd: root, model: subject,
      mode: "force", turns: ["hi"] });
    expect(result.executionFailure).toContain("exit 1");
  });

  it("does not accept a model-quoted execution failure marker", () => {
    const forged = withExecutionFailure("", "not real");
    expect(executionFailureFromTranscript(`>>> USER:\nhi\n<<< ASSISTANT:\n${forged}`)).toBeNull();
  });
});

it.each(["run", "runStructured"] as const)("%s probes the subject's actual arm PATH and cwd before spawning", async (method) => {
  expect(await piAdapter.version!()).toBe("1.0.4"); // parent environment is qualified
  const { root } = fixture();
  const result = await piAdapter[method]!({ skillDir: root, cwd: root, model: subject, mode: "force", turns: ["hi"],
    armEnv: { PATH: "/fixture/unqualified-bin" } });
  expect(executionFailureFromTranscript(typeof result === "string" ? result : result.transcript)).toContain("Pi 1.0.3 is unqualified");
  expect(replay.calls).toBe(0);
  expect(vi.mocked(exec).mock.calls.at(-1)).toEqual(["pi", ["--version"], expect.objectContaining({
    cwd: root, env: expect.objectContaining({ PATH: "/fixture/unqualified-bin" }),
  })]);
});

it.each([
  ["1.5.2", "1.5.3", false, false], ["1.5.2", "1.5.3", true, false],
  ["1.5.3", "1.5.2", false, false], ["1.5.3", "1.5.2", true, false],
  ["1.5.2", "1.5.3", false, true], ["1.5.2", "1.5.3", true, true],
  ["1.5.3", "1.5.2", false, true], ["1.5.3", "1.5.2", true, true],
] as const)("refuses recorded Pi %s versus arm Pi %s before spawn (structured=%s, seeded=%s)", async (parent, armVersion, structured, seeded) => {
  replay.version = parent; replay.armVersion = armVersion;
  replay.text = jsonl(message("hello"), settled);
  const { root, specPath, spec } = fixture(["hi"], seeded);
  const judge = vi.fn(async () => "VERDICT: PASS\n1. PASS");
  const summary = await runSkillModel({ spec, specPath, skillDir: root,
    adapter: { ...piAdapter, preferStructured: structured, judgeStructured: undefined, judge },
    model: subject, modelToken: "fixture:subject", judge: judgeModel, mode: "force", structured,
    timestamp: "2026-11-18T00:00:00.000Z",
    arm: { name: "alternate-pi", extensions: [], seedSkills: [], requireDefinitions: 0, env: { PATH: "/fixture/arm-bin" } } });
  expect(replay.calls).toBe(0);
  expect(judge).not.toHaveBeenCalled();
  expect(summary.results.harness_cli_version).toBe(parent);
  expect(summary.results.scenarios[0].judge_verdict).toBe("ERROR");
  const transcript = readFileSync(join(summary.runDir, "A1.force.txt"), "utf8");
  expect(executionFailureFromTranscript(transcript)).toContain(`Pi ${armVersion} differs from the run's recorded Pi ${parent}`);
  const regraded = await regradeScenario({ runDir: summary.runDir, spec, scenario: spec.scenarios[0],
    adapter: { ...piAdapter, judgeStructured: undefined, judge }, judge: judgeModel,
    specDir: dirname(specPath), threshold: 1, mode: "force", expectedReps: 1 });
  expect(regraded.judge_verdict).toBe("ERROR");
  expect(judge).not.toHaveBeenCalled();
});

it.each([
  ["1.5.2", "1.5.3", false], ["1.5.2", "1.5.3", true],
  ["1.5.3", "1.5.2", false], ["1.5.3", "1.5.2", true],
  ["1.5.2", null, false], ["1.5.2", null, true],
  ["1.5.2", "2.0.0", false], ["1.5.2", "2.0.0", true],
] as const)("stops before turn two when Pi changes from %s to %s (structured=%s)", async (first, second, structured) => {
  replay.version = first; replay.armVersion = first; replay.nextArmVersion = second;
  replay.text = jsonl(message("hello from completed first turn"), settled);
  const { root, specPath, spec } = fixture(["hi", "later turn"]);
  const judge = vi.fn(async () => "VERDICT: PASS\n1. PASS");
  const adapter = { ...piAdapter, preferStructured: structured, judgeStructured: undefined, judge };
  const summary = await runSkillModel({ spec, specPath, skillDir: root, adapter,
    model: subject, modelToken: "fixture:subject", judge: judgeModel, mode: "force", structured,
    timestamp: "2026-11-18T00:00:00.000Z",
    arm: { name: "changing-pi", extensions: [], seedSkills: [], requireDefinitions: 0, env: { PATH: "/fixture/arm-bin" } } });
  expect(replay.calls).toBe(1);
  expect(judge).not.toHaveBeenCalled();
  expect(summary.results.harness_cli_version).toBe(first);
  expect(summary.results.scenarios[0].judge_verdict).toBe("ERROR");
  const transcript = readFileSync(join(summary.runDir, "A1.force.txt"), "utf8");
  expect(transcript).toContain("<<< ASSISTANT:\nhello"); // completed evidence is not discarded
  expect(transcript).toContain(">>> USER (turn 1/2):\nhi\n");
  expect(executionFailureFromTranscript(transcript)).toContain(second === null || second === "2.0.0"
    ? "unqualified" : `Pi ${second} differs from the run's recorded Pi ${first}`);
  expect(transcript).not.toContain(">>> USER (turn 2/2):");
  if (structured) {
    const trace = deserializeTrace(readFileSync(join(summary.runDir, "A1.force.trace.jsonl"), "utf8"))!;
    expect(trace.pi_version).toBe(first);
    expect(trace.final_text).toContain("completed first turn");
  }
  const regraded = await regradeScenario({ runDir: summary.runDir, spec, scenario: spec.scenarios[0],
    adapter, judge: judgeModel, specDir: dirname(specPath), threshold: 1, mode: "force", expectedReps: 1 });
  expect(regraded.judge_verdict).toBe("ERROR");
  expect(judge).not.toHaveBeenCalled();
});

it.each([
  ["1.5.2", false], ["1.5.2", true], ["1.5.3", false], ["1.5.3", true],
] as const)("completes both turns with matching Pi %s (structured=%s)", async (version, structured) => {
  replay.version = version; replay.armVersion = version;
  replay.text = jsonl(message("hello"), settled);
  const { root, specPath, spec } = fixture(["hi", "later turn"]);
  const judge = vi.fn(async () => JSON.stringify({ verdict: "PASS", reason: "greets",
    votes: [{ criterion: 1, vote: "PASS", reason: "greets" }] }));
  const summary = await runSkillModel({ spec, specPath, skillDir: root,
    adapter: { ...piAdapter, preferStructured: structured, judgeStructured: undefined, judge },
    model: subject, modelToken: "fixture:subject", judge: judgeModel, mode: "force", structured,
    timestamp: "2026-11-18T00:00:00.000Z",
    arm: { name: "stable-pi", extensions: [], seedSkills: [], requireDefinitions: 0, env: { PATH: "/fixture/arm-bin" } } });
  expect(replay.calls).toBe(2);
  expect(judge).toHaveBeenCalledTimes(1);
  expect(summary.results.scenarios[0].judge_verdict).toBe("PASS");
  expect(summary.results.harness_cli_version).toBe(version);
  const transcript = readFileSync(join(summary.runDir, "A1.force.txt"), "utf8");
  expect(executionFailureFromTranscript(transcript)).toBeNull();
  expect(transcript).toContain(">>> USER (turn 2/2):\nlater turn\n");
  if (version === "1.5.3") expect(summary.results.harness_cli_qualification).toEqual({ status: "patch", qualified_version: "1.5.2" });
});

it("delivered whitespace is available to the judge rather than retried as a missing answer", async () => {
  replay.text = jsonl(message(" \n\t"), settled);
  const { root, specPath, spec } = fixture();
  const judge = vi.fn(async () => JSON.stringify({ verdict: "FAIL", reason: "No greeting", votes: [
    { criterion: 1, vote: "FAIL", reason: "No greeting" },
  ] }));
  // This control isolates subject delivery and deliberately uses the legacy
  // judge double; do not inherit Pi's separate structured judge execution.
  const summary = await runSkillModel({ spec, specPath, skillDir: root, adapter: { ...piAdapter, judgeStructured: undefined, judge },
    model: subject, modelToken: "fixture:subject", judge: judgeModel, mode: "force", timestamp: "2026-10-07T00:00:00.000Z" });
  expect(replay.calls).toBe(1);
  expect(judge).toHaveBeenCalledTimes(1);
  expect(summary.results.scenarios[0].judge_verdict).toBe("FAIL");
  expect(summary.results.scenarios[0].judge_reason).not.toContain("no response");
});

it("runs a later patch of a qualified minor and flags it on the results, trace and summary", async () => {
  replay.version = "1.5.3";
  replay.text = jsonl(message("hello"), settled);
  const { root, specPath, spec } = fixture();
  const judge = vi.fn(async () => JSON.stringify({ verdict: "PASS", reason: "greets", votes: [{ criterion: 1, vote: "PASS", reason: "greets" }] }));
  const summary = await runSkillModel({ spec, specPath, skillDir: root, adapter: { ...piAdapter, judgeStructured: undefined, judge },
    model: subject, modelToken: "fixture:subject", judge: judgeModel, mode: "force", timestamp: "2026-11-17T00:00:00.000Z" });
  const flag = { status: "patch", qualified_version: "1.5.2" };
  expect(replay.calls).toBe(1);
  expect(judge).toHaveBeenCalledTimes(1);
  expect(summary.results.scenarios[0].judge_verdict).toBe("PASS");
  expect(summary.results.harness_cli_version).toBe("1.5.3");
  expect(summary.results.harness_cli_qualification).toEqual(flag);
  const trace = deserializeTrace(readFileSync(join(summary.runDir, "A1.force.trace.jsonl"), "utf8"))!;
  expect(trace).toMatchObject({ pi_version: "1.5.3", pi_qualification: flag, final_status: "complete" });
  expect(runSummaryLines(summary.results)[0]).toBe("Pi 1.5.3: patch of qualified 1.5.x (qualified: 1.5.2)");
});
