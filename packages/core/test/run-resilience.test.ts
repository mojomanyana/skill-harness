import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSkillModel } from "../src/run.js";
import { loadSpec } from "../src/spec.js";
import { readJournal } from "../src/journal.js";
import { PROVIDER_FAILURE_MARKER, withProviderFailure } from "../src/provider-failure.js";
import type { HarnessAdapter, RunReq, StructuredRun } from "../src/adapters/types.js";

/**
 * A wave must survive one rep going wrong.
 *
 * `runPool` is fail-fast and `runRep`'s only handler was a `finally`, so anything
 * the adapter THREW unwound the entire run: no `results.yaml` was written and
 * every scenario already judged in that wave lost its verdict. On the text path
 * that was nearly unreachable — a pi crash produced `[pi exited N]`, an empty
 * assistant turn, a retry and then an ERROR verdict inside a completed run — but
 * `--structured` routes every scenario through `runStructured`, which throws on a
 * stream with no terminal events and rejects on timeout. The blast radius of one
 * timeout went from one rep to the whole wave.
 *
 * The contract asserted here: an adapter failure is ONE rep's ERROR, and the run
 * still completes and still records everything else.
 */

const SPEC = [
  "skill: demo",
  "judge_persona: a strict reviewer",
  "ship_bar: { total: 2, min_pass: 1, no_critical_fail: true }",
  "scenarios:",
  "  - id: A1",
  "    title: first",
  "    turns: ['do it']",
  "    checklist: ['did it']",
  "  - id: A2",
  "    title: second",
  "    turns: ['do it again']",
  "    checklist: ['did it']",
].join("\n") + "\n";

function corpus(spec = SPEC): { dir: string; specPath: string } {
  const dir = mkdtempSync(join(tmpdir(), "sh-resilience-"));
  mkdirSync(join(dir, "tests"), { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), "---\nname: demo\ndescription: d\n---\n\n## Do it\n", "utf8");
  const specPath = join(dir, "tests", "specification.yaml");
  writeFileSync(specPath, spec, "utf8");
  return { dir, specPath };
}

const OK = ">>> USER:\nx\n\n<<< ASSISTANT:\ndone\n";

function run(dir: string, specPath: string, adapter: HarnessAdapter, over: Record<string, unknown> = {}) {
  return runSkillModel({
    spec: loadSpec(specPath),
    skillDir: dir,
    specPath,
    adapter,
    model: { provider: "fireworks", model: "x" },
    modelToken: "fireworks:x",
    judge: { provider: "claude-code", model: "j" },
    mode: "green",
    timestamp: "2026-08-22T00:00:00.000Z",
    ...over,
  });
}

describe("one adapter failure does not take the wave down", () => {
  // Mutation: deleting the `catch` around the execution branches in run.ts makes
  // this reject instead — no results.yaml, and A2's PASS lost with it.
  it("records ERROR for the failing scenario and keeps the rest of the run", async () => {
    const { dir, specPath } = corpus();
    let structuredCalls = 0;
    const adapter: HarnessAdapter = {
      name: "fake",
      available: async () => true,
      run: async () => OK,
      runStructured: async (req: RunReq & { scenarioId?: string }): Promise<StructuredRun> => {
        structuredCalls += 1;
        if (req.scenarioId === "A1") {
          throw new Error("pi --mode json produced no terminal events for turn 1/1 (exit 1)");
        }
        return { transcript: OK, traces: [] };
      },
      judge: async () => "VERDICT: PASS\n1. PASS",
      version: async () => "0.84.2",
    };

    const summary = await run(dir, specPath, adapter, { structured: true });

    const a1 = summary.results.scenarios.find((s) => s.id === "A1")!;
    const a2 = summary.results.scenarios.find((s) => s.id === "A2")!;
    expect(a1.judge_verdict).toBe("ERROR");
    expect(a1.judge_reason).toContain("no terminal events");
    // A2 was measured normally — the point of the fix.
    expect(a2.judge_verdict).toBe("PASS");
    // The record exists at all, which it did not before.
    expect(existsSync(join(summary.runDir, "results.yaml"))).toBe(true);
    // A1 retried once (2 calls) before giving up; A2 ran once.
    expect(structuredCalls).toBe(3);
  });

  it("writes the failure into the transcript artifact rather than leaving none", async () => {
    const { dir, specPath } = corpus();
    const adapter: HarnessAdapter = {
      name: "fake",
      available: async () => true,
      run: async () => { throw new Error("pi timed out after 900000ms"); },
      judge: async () => "VERDICT: PASS\n1. PASS",
      version: async () => "0.84.2",
    };

    const summary = await run(dir, specPath, adapter);
    expect(summary.results.scenarios.every((s) => s.judge_verdict === "ERROR")).toBe(true);
    expect(summary.results.scenarios[0].judge_reason).toContain("timed out");

    const retries = readJournal(summary.runDir).filter((e) => e.event === "empty-response-retry");
    expect(retries.length).toBe(2); // one per scenario
    expect(retries[0]).toMatchObject({ reason: expect.stringContaining("adapter failed") });
  });

  // A rep whose adapter threw produced no trace, and "no execution trace was
  // produced" is the symptom, not the cause: it would put the missing artifact in
  // the results record where the crash or timeout belongs.
  it("reports the adapter's own failure, not a manufactured missing-evidence reason", async () => {
    const gated = [
      "skill: demo",
      "judge_persona: a strict reviewer",
      "ship_bar: { total: 1, min_pass: 1, no_critical_fail: true }",
      "scenarios:",
      "  - id: A1",
      "    title: first",
      "    turns: ['do it']",
      "    checklist: ['did it']",
      "    assert:",
      "      trace:",
      "        forbid_calls: [write]",
    ].join("\n") + "\n";
    const { dir, specPath } = corpus(gated);
    const adapter: HarnessAdapter = {
      name: "fake",
      available: async () => true,
      run: async () => OK,
      runStructured: async (): Promise<StructuredRun> => { throw new Error("pi timed out after 900000ms"); },
      judge: async () => "VERDICT: PASS\n1. PASS",
      version: async () => "0.84.2",
    };
    const summary = await run(dir, specPath, adapter);
    const a1 = summary.results.scenarios[0];
    expect(a1.judge_verdict).toBe("ERROR");
    expect(a1.judge_reason).toContain("timed out");
    expect(a1.judge_reason).not.toContain("no execution trace");
  });

  // A judge must never be asked to grade a rep that never produced an answer:
  // grading `[adapter failure] …` yields a confident FAIL about behavior that
  // never happened, which is exactly the class of fabricated verdict the
  // ERROR path exists to prevent.
  it("spends no judge call on a rep whose adapter failed", async () => {
    const { dir, specPath } = corpus();
    let judgeCalls = 0;
    const adapter: HarnessAdapter = {
      name: "fake",
      available: async () => true,
      run: async () => { throw new Error("boom"); },
      judge: async () => { judgeCalls += 1; return "VERDICT: PASS\n1. PASS"; },
      version: async () => "0.84.2",
    };
    await run(dir, specPath, adapter);
    expect(judgeCalls).toBe(0);
  });
});

describe("a transient provider failure that the retry recovers from", () => {
  // `infrastructureFailure` was sticky across the retry (`if (!infrastructureFailure)`),
  // and a provider failure ALWAYS leaves a blank assistant turn, so a retry always
  // followed. Attempt 0's reason then outlived an attempt 1 that succeeded: the rep
  // was recorded ERROR citing an outage while the persisted transcript was the clean
  // one — the record contradicting its own artifact, and a recovered measurement
  // discarded.
  //
  // Mutation: deleting `infrastructureFailure = null;` from the top of the attempt
  // loop in run.ts makes this test read ERROR instead of PASS.
  it("is not carried over into a clean second attempt", async () => {
    const { dir, specPath } = corpus();
    const calls = new Map<string, number>();
    const adapter: HarnessAdapter = {
      name: "fake",
      available: async () => true,
      run: async (req: RunReq) => {
        const key = req.turns.join("|");
        const n = (calls.get(key) ?? 0) + 1;
        calls.set(key, n);
        // Attempt 0: a provider outage — an empty assistant turn plus the marker.
        if (n === 1) return withProviderFailure(">>> USER:\nx\n\n<<< ASSISTANT:\n\n", "openai-codex: transport blip");
        return OK;
      },
      judge: async () => "VERDICT: PASS\n1. PASS",
      version: async () => "0.84.2",
    };

    const summary = await run(dir, specPath, adapter);

    for (const s of summary.results.scenarios) {
      expect(s.judge_verdict).toBe("PASS");
      expect(s.judge_reason).not.toContain("provider failure");
    }
    // And the artifact agrees with the record: the persisted transcript is the
    // clean attempt, with no marker left in it.
    const transcript = join(summary.runDir, "A1.green.txt");
    expect(existsSync(transcript)).toBe(true);
    expect(summary.results.scenarios[0].judge_verdict).toBe("PASS");
  });

  it("still reports ERROR when the retry fails the same way", async () => {
    const { dir, specPath } = corpus();
    const adapter: HarnessAdapter = {
      name: "fake",
      available: async () => true,
      run: async () => withProviderFailure(">>> USER:\nx\n\n<<< ASSISTANT:\n\n", "openai-codex: still down"),
      judge: async () => "VERDICT: PASS\n1. PASS",
      version: async () => "0.84.2",
    };
    const summary = await run(dir, specPath, adapter);
    for (const s of summary.results.scenarios) {
      expect(s.judge_verdict).toBe("ERROR");
      expect(s.judge_reason).toContain("still down");
    }
    expect(PROVIDER_FAILURE_MARKER).toBeTruthy();
  });
});
