import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  executionFailureFromTranscript, withExecutionFailure, loadSpec,
  runSkillModel, regradeScenario, exec,
} from "@skill-harness/core";

const replay = vi.hoisted(() => ({ text: "", code: 0, calls: 0, version: "1.0.4" as string | null }));
vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => {
    replay.calls++;
    const child = new EventEmitter() as EventEmitter & { stdout: Readable; stderr: Readable; kill: ReturnType<typeof vi.fn> };
    child.stdout = new Readable({ read() {} });
    child.stderr = new Readable({ read() {} });
    child.kill = vi.fn();
    queueMicrotask(() => {
      child.stdout.push(replay.text);
      child.stdout.push(null);
      child.stderr.push(null);
      setImmediate(() => child.emit("close", replay.code));
    });
    return child;
  }),
}));
vi.mock("@skill-harness/core", async (original) => ({
  ...await original<typeof import("@skill-harness/core")>(),
  onPath: () => true,
  exec: vi.fn(async (_command, _args, options) => {
    const version = options?.env?.PATH === "/fixture/unqualified-bin" ? "1.0.5" : replay.version;
    return { code: version === null ? 1 : 0, stdout: version === null ? "" : version + "\n", stderr: "" };
  }),
}));
import { piAdapter } from "../src/pi.js";

const roots: string[] = [];
const message = (text: string, stopReason = "stop") => ({ type: "message_end",
  message: { role: "assistant", content: [{ type: "text", text }], stopReason } });
const settled = { type: "agent_settled" };
const jsonl = (...events: unknown[]) => events.map((event) => JSON.stringify(event)).join("\n") + "\n";
const subject = { provider: "fixture", model: "subject" };
const judgeModel = { provider: "local", model: "judge" };
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "sh-terminal-outcome-")); roots.push(root);
  mkdirSync(join(root, "tests"));
  writeFileSync(join(root, "SKILL.md"), "---\nname: demo\ndescription: test\n---\nSay hello.\n");
  const specPath = join(root, "tests", "specification.yaml");
  writeFileSync(specPath, "skill: demo\njudge_persona: strict reviewer\nship_bar:\n  total: 1\n  min_pass: 1\nscenarios:\n  - id: A1\n    title: greeting\n    turns: ['hi']\n    checklist: ['says hello']\n");
  return { root, specPath, spec: loadSpec(specPath) };
}
beforeEach(() => { replay.text = ""; replay.code = 0; replay.calls = 0; replay.version = "1.0.4"; });
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

  it.each(["1.0.5", "1.0.4-rc.1", "0.83.0", "unknown", null])("refuses fresh unqualified Pi %s before a subject call and saved regrade", async (version) => {
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
  expect(executionFailureFromTranscript(typeof result === "string" ? result : result.transcript)).toContain("Pi 1.0.5 is unqualified");
  expect(replay.calls).toBe(0);
  expect(vi.mocked(exec).mock.calls.at(-1)).toEqual(["pi", ["--version"], expect.objectContaining({
    cwd: root, env: expect.objectContaining({ PATH: "/fixture/unqualified-bin" }),
  })]);
});

it("delivered whitespace is available to the judge rather than retried as a missing answer", async () => {
  replay.text = jsonl(message(" \n\t"), settled);
  const { root, specPath, spec } = fixture();
  const judge = vi.fn(async () => JSON.stringify({ verdict: "FAIL", reason: "No greeting", votes: [
    { criterion: 1, vote: "FAIL", reason: "No greeting" },
  ] }));
  const summary = await runSkillModel({ spec, specPath, skillDir: root, adapter: { ...piAdapter, judge },
    model: subject, modelToken: "fixture:subject", judge: judgeModel, mode: "force", timestamp: "2026-10-07T00:00:00.000Z" });
  expect(replay.calls).toBe(1);
  expect(judge).toHaveBeenCalledTimes(1);
  expect(summary.results.scenarios[0].judge_verdict).toBe("FAIL");
  expect(summary.results.scenarios[0].judge_reason).not.toContain("no response");
});
