import { beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSkillModel } from "../src/run.js";
import { loadSpec } from "../src/spec.js";
import { trajectoryPath } from "../src/results.js";
import { deserializeTrajectoryEvents, TRAJECTORY_EVENT_VERSION, type TrajectoryEventV1 } from "../src/trajectory-gates.js";
import type { HarnessAdapter, StructuredRun } from "../src/adapters/types.js";

function event(seq: number, type: string, extra: Partial<TrajectoryEventV1> = {}): TrajectoryEventV1 {
  return { event_version: TRAJECTORY_EVENT_VERSION, seq, type, source: "fake", ...extra };
}

let skillDir: string;
let specPath: string;

beforeEach(() => {
  skillDir = mkdtempSync(join(tmpdir(), "sh-trajectory-run-"));
  mkdirSync(join(skillDir, "tests"), { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), "---\nname: demo\ndescription: demo\n---\n\n## Run\n", "utf8");
  specPath = join(skillDir, "tests", "specification.yaml");
});

function writeSpec(assertion: string, critical = false): void {
  writeFileSync(specPath, `skill: demo
judge_persona: a strict judge
ship_bar: { total: 1, min_pass: 1, no_critical_fail: true }
critical: ${critical ? "[A1]" : "[]"}
scenarios:
  - id: A1
    title: governed workflow
    critical: ${critical}
    reps: ${critical ? 3 : 1}
    turns: ["do it"]
    checklist: ["did it"]
    assert:
      trajectory:
${assertion}
`, "utf8");
}

function adapter(events: TrajectoryEventV1[], errors: string[] = []) {
  const calls = { judge: 0, structured: 0 };
  const value: HarnessAdapter = {
    name: "fake",
    available: async () => true,
    run: async () => { throw new Error("plain run should not be used"); },
    runStructured: async (): Promise<StructuredRun> => {
      calls.structured++;
      return { transcript: ">>> USER:\ndo it\n\n<<< ASSISTANT:\ndone\n", traces: [], events, eventErrors: errors };
    },
    judge: async () => { calls.judge++; return "1. PASS ok\nVERDICT: PASS\nREASON: ok"; },
  };
  return { value, calls };
}

async function run(fake: ReturnType<typeof adapter>) {
  return runSkillModel({
    spec: loadSpec(specPath), skillDir, specPath, adapter: fake.value,
    model: { provider: "p", model: "m" }, modelToken: "p:m",
    judge: { provider: "claude-code", model: "j" }, mode: "force",
    timestamp: "2026-08-19T00:00:00Z", onProgress: () => {},
  });
}

describe("trajectory gates in the run pipeline", () => {
  it("runs before the judge, persists normalized evidence, and a decisive failure cannot be flattered away", async () => {
    writeSpec(`        version: "1.0"
        require:
          - event: finalization_completed`);
    const fake = adapter([event(1, "risk_classified")]);
    const summary = await run(fake);
    expect(fake.calls.judge).toBe(0);
    expect(summary.results.scenarios[0].judge_verdict).toBe("FAIL");
    expect(summary.results.scenarios[0].objective?.status).toBe("FAIL");
    const path = trajectoryPath(summary.runDir, "A1", "force");
    expect(existsSync(path)).toBe(true);
    expect(deserializeTrajectoryEvents(readFileSync(path, "utf8"))?.[0].type).toBe("risk_classified");
  });

  it("missing or malformed native source evidence is ERROR and costs zero judge calls", async () => {
    writeSpec(`        version: "1.0"
        require:
          - event: risk_classified`);
    const fake = adapter([], ["required event source principal-assurance-v1:state/*/events.jsonl is missing"]);
    const summary = await run(fake);
    expect(fake.calls.judge).toBe(0);
    expect(summary.results.scenarios[0].judge_verdict).toBe("ERROR");
    expect(summary.results.scenarios[0].objective?.status).toBe("ERROR");
  });

  it("regate replays saved normalized events and judges only a FAIL→PASS flip", async () => {
    writeSpec(`        version: "1.0"
        require:
          - event: finalization_completed`);
    const fake = adapter([event(1, "risk_classified")]);
    const summary = await run(fake);
    expect(fake.calls.judge).toBe(0);

    writeSpec(`        version: "1.0"
        require:
          - event: risk_classified`);
    const { regateRun } = await import("../src/regate.js");
    const result = await regateRun({
      runDir: summary.runDir, spec: loadSpec(specPath), specDir: join(skillDir, "tests"),
      adapter: fake.value, judge: { provider: "claude-code", model: "j" },
    });
    expect(result.results.scenarios[0].objective?.status).toBe("PASS");
    expect(result.judgeCalls).toBe(1);
    expect(fake.calls.judge).toBe(1);
  });

  it("all clean repetitions of a critical trajectory scenario must pass", async () => {
    writeSpec(`        version: "1.0"
        require:
          - event: finalization_completed`, true);
    let rep = 0;
    const fake = adapter([]);
    fake.value.runStructured = async () => {
      const events = rep++ === 1 ? [event(1, "risk_classified")] : [event(1, "finalization_completed")];
      return { transcript: ">>> USER:\ndo it\n\n<<< ASSISTANT:\ndone\n", traces: [], events };
    };
    const summary = await run(fake);
    const result = summary.results.scenarios[0];
    expect(result.judge_verdict).toBe("FAIL");
    expect(result.objective?.status).toBe("FAIL");
    expect(summary.results.effective_grade.ship).toBe(false);
  });
});
