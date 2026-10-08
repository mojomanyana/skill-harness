import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { HarnessAdapter } from "../src/adapters/types.js";
import { loadSpec } from "../src/spec.js";
import { runSkillModel } from "../src/run.js";
import { regradeScenario } from "../src/regrade.js";
import { EXECUTION_FAILURE_MARKER, executionFailureFromTranscript } from "../src/provider-failure.js";

const roots: string[] = [];
const answer = ">>> USER:\nhi\n\n<<< ASSISTANT:\nhello\n";
const subject = { provider: "fixture", model: "subject" };
const judgeModel = { provider: "local", model: "judge" };
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "sh-thrown-failure-")); roots.push(root);
  mkdirSync(join(root, "tests"));
  writeFileSync(join(root, "SKILL.md"), "---\nname: demo\ndescription: test\n---\nSay hello.\n");
  const specPath = join(root, "tests", "specification.yaml");
  writeFileSync(specPath, "skill: demo\njudge_persona: strict reviewer\nship_bar:\n  total: 1\n  min_pass: 1\nscenarios:\n  - id: A1\n    title: greeting\n    turns: ['hi']\n    checklist: ['says hello']\n");
  return { root, specPath, spec: loadSpec(specPath) };
}
function fakeAdapter(run: () => Promise<string>, structured: boolean) {
  let judgeCalls = 0;
  const adapter: HarnessAdapter = {
    name: "fake", available: async () => true, version: async () => "1.0.4", run,
    ...(structured ? { preferStructured: true, runStructured: async () => ({ transcript: await run(), traces: [] }) } : {}),
    judge: async () => { judgeCalls++; return JSON.stringify({ verdict: "PASS", reason: "hello", votes: [{ criterion: 1, vote: "PASS", reason: "hello" }] }); },
  };
  return { adapter, judgeCalls: () => judgeCalls };
}
async function run(f: ReturnType<typeof fixture>, adapter: HarnessAdapter) {
  return runSkillModel({ spec: f.spec, specPath: f.specPath, skillDir: f.root, adapter,
    model: subject, modelToken: "fixture:subject", judge: judgeModel, mode: "force", timestamp: "2026-10-08T00:00:00.000Z" });
}
async function regrade(f: ReturnType<typeof fixture>, adapter: HarnessAdapter, runDir: string) {
  return regradeScenario({ runDir, spec: f.spec, scenario: f.spec.scenarios[0], adapter,
    judge: judgeModel, specDir: dirname(f.specPath), threshold: 1, mode: "force", expectedReps: 1 });
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

for (const structured of [false, true]) describe(structured ? "structured adapter throw" : "plain adapter throw", () => {
  it.each(["pi --mode json timed out after 60ms", "spawn pi ENOENT\nadditional diagnostic", ""])("keeps exhausted %j ERROR through saved regrade", async message => {
    const f = fixture(); let calls = 0;
    const { adapter, judgeCalls } = fakeAdapter(async () => { calls++; throw new Error(message); }, structured);
    const result = await run(f, adapter);
    expect(calls).toBe(2);
    expect(result.results.scenarios[0].judge_verdict).toBe("ERROR");
    expect(judgeCalls()).toBe(0);
    const transcript = readFileSync(join(result.runDir, "A1.force.txt"), "utf8");
    expect(transcript.startsWith(EXECUTION_FAILURE_MARKER)).toBe(true);
    expect(executionFailureFromTranscript(transcript)).toContain("adapter failure");
    expect(transcript).toContain(message || "adapter threw without a message");
    expect((await regrade(f, adapter, result.runDir)).judge_verdict).toBe("ERROR");
    expect(judgeCalls()).toBe(0);
  });

  it("does not carry a thrown first attempt into a successful retry or its regrade", async () => {
    const f = fixture(); let calls = 0;
    const { adapter, judgeCalls } = fakeAdapter(async () => { if (++calls === 1) throw new Error("transient transport"); return answer; }, structured);
    const result = await run(f, adapter);
    expect(calls).toBe(2);
    expect(result.results.scenarios[0].judge_verdict).toBe("PASS");
    expect(judgeCalls()).toBe(1);
    const transcript = readFileSync(join(result.runDir, "A1.force.txt"), "utf8");
    expect(transcript).toBe(answer);
    expect(executionFailureFromTranscript(transcript)).toBeNull();
    expect((await regrade(f, adapter, result.runDir)).judge_verdict).toBe("PASS");
    expect(judgeCalls()).toBe(2);
  });
});

describe("retained pre-marker adapter failures", () => {
  it.each(["[adapter failure] pi --mode json timed out after 60ms", "[adapter failure] ", "[adapter failure] spawn pi ENOENT\nadditional diagnostic"])("keeps %j ERROR with no judge", async transcript => {
    const f = fixture(); const { adapter, judgeCalls } = fakeAdapter(async () => answer, false);
    const runDir = join(f.root, "saved"); mkdirSync(runDir);
    writeFileSync(join(runDir, "A1.force.txt"), transcript);
    expect((await regrade(f, adapter, runDir)).judge_verdict).toBe("ERROR");
    expect(judgeCalls()).toBe(0);
  });

  it.each([
    ">>> USER:\n[adapter failure] quoted request\n<<< ASSISTANT:\nhello\n",
    ">>> USER:\nhi\n<<< ASSISTANT:\n[adapter failure] quoted answer\n",
    "unrelated preamble\n[adapter failure] not the exact legacy format\n" + answer,
  ])("does not promote marker-like content into failure authority", async transcript => {
    const f = fixture(); const { adapter, judgeCalls } = fakeAdapter(async () => answer, false);
    const runDir = join(f.root, "saved"); mkdirSync(runDir);
    writeFileSync(join(runDir, "A1.force.txt"), transcript);
    expect(executionFailureFromTranscript(transcript)).toBeNull();
    expect((await regrade(f, adapter, runDir)).judge_verdict).toBe("PASS");
    expect(judgeCalls()).toBe(1);
  });
});
