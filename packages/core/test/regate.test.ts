import { describe, test, expect } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { regateRun } from "../src/regate.js";
import { writeResults, readResults, diffPath, transcriptPath, trajectoryPath, type ResultsDraft } from "../src/results.js";
import { serializeTrajectoryEvents, trajectoryEventsSha256, type TrajectoryEventV1 } from "../src/trajectory-gates.js";
import { parseSpec, type Spec } from "../src/spec.js";
import { sourceHashes, GATES_PREFIX } from "../src/sources.js";
import type { HarnessAdapter } from "../src/adapters/types.js";

const NEEDLE_PASS = "1. PASS — does it\nVERDICT: PASS\nREASON: the diff implements it";
const NEEDLE_FAIL = "1. FAIL — missing\nVERDICT: FAIL\nREASON: not implemented";

/** A judge that answers PASS, counting how many times it was asked. */
function countingJudge(reply = NEEDLE_PASS): { adapter: HarnessAdapter; calls: () => number } {
  let calls = 0;
  return {
    calls: () => calls,
    adapter: {
      name: "pi",
      available: async () => true,
      run: async () => { throw new Error("regate must never run the subject model"); },
      judge: async () => { calls++; return reply; },
    },
  };
}

function specFor(needle: string, excludes?: string): Spec {
  const yaml = `
skill: golden
judge_persona: a judge.
ship_bar: { total: 1, min_pass: 1 }
critical: []
scenarios:
  - id: A1
    title: seeded one
    turns: ["fix it"]
    checklist: ["fixes it"]
    mode: seeded
    fixture: fixtures/A1
    assert:
      diff_contains: ["${needle}"]${excludes ? `\n      diff_excludes: ["${excludes}"]` : ""}
`;
  return parseSpec(yaml, "/spec/tests/specification.yaml");
}

/**
 * A run dir holding one seeded scenario whose gate FAILED on the recorded needle,
 * with the saved diff + transcript artifacts a real run leaves behind.
 */
function runWithFailedGate(opts: { diff: string; verdict?: "PASS" | "FAIL"; reason?: string; reps?: number }): {
  runDir: string; specDir: string;
} {
  const skillDir = mkdtempSync(join(tmpdir(), "sh-regate-"));
  const specDir = join(skillDir, "tests");
  mkdirSync(join(specDir, "fixtures", "A1"), { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), "---\nname: golden\n---\nbody\n", "utf8");
  const runDir = join(specDir, "results", "pi-fake", "2026-08-05T00-00-00Z");
  mkdirSync(runDir, { recursive: true });

  const reps = opts.reps ?? 1;
  for (let i = 0; i < reps; i++) {
    const rep = reps === 1 ? undefined : i;
    writeFileSync(
      transcriptPath(runDir, "A1", "green", rep),
      `USER: fix it\nASSISTANT: done\n\n=== SEEDED GATES ===\n  diff_contains "spike": MISSING\n\n=== STAGED DIFF ===\n${opts.diff}\n`,
      "utf8",
    );
    writeFileSync(diffPath(runDir, "A1", "green", rep), opts.diff, "utf8");
  }

  const draft: ResultsDraft = {
    skill: "golden", harness: "pi", model: "fireworks:fake",
    judge: { provider: "claude-code", model: "opus" },
    timestamp: "2026-08-05T00:00:00Z", label: null, mode: "green",
    source_hashes: sourceHashes({ skillDir, specDir, scenarios: specFor("spike").scenarios, judgePersona: "a judge." }),
    scenarios: [{
      id: "A1",
      judge_verdict: opts.verdict ?? "FAIL",
      judge_reason: opts.reason ?? 'staged diff missing "spike"',
      suspect: false, override: null, note: "",
      ...(reps > 1 ? { reps, passes: 0, clean: reps, flakiness: 0, pass_threshold: 0.5 } : {}),
    }],
  };
  writeResults(runDir, draft, { shipBar: { total: 1, min_pass: 1 }, critical: [] });
  return { runDir, specDir };
}

const DIFF = `diff --git a/app.ts b/app.ts
--- a/app.ts
+++ b/app.ts
@@ -1,2 +1,3 @@
 const port = 3000;
+const url = "localhost:8080";
`;

describe("regate re-evaluates needle gates from the saved diffs", () => {
  // The defect class: the gate was wrong, the behavior was not. Measured three times
  // in the reference corpus (A2's context needle, A4's baseline-satisfied needle, C2's
  // filename needle). A re-run costs 81 rep-executions across three models; the diffs
  // that answer the question are already on disk.
  test("a gate-FAIL that the corrected needle satisfies is judged, not re-run", async () => {
    const { runDir, specDir } = runWithFailedGate({ diff: DIFF });
    const judge = countingJudge();

    const { results, changes } = await regateRun({
      runDir, spec: specFor("localhost:8080"), specDir,
      adapter: judge.adapter, judge: { provider: "claude-code", model: "opus" },
      now: () => "2026-08-05T01:00:00Z",
    });

    expect(judge.calls()).toBe(1); // one flipped rep, one judge call — no subject run
    expect(results.scenarios[0].judge_verdict).toBe("PASS");
    expect(changes).toEqual([
      expect.objectContaining({ id: "A1", from: "FAIL", to: "PASS", gate: "pass", judged: true }),
    ]);
  });

  test("a rep whose gate still fails is not judged at all", async () => {
    const { runDir, specDir } = runWithFailedGate({ diff: DIFF });
    const judge = countingJudge();

    const { results } = await regateRun({
      runDir, spec: specFor("nowhere-in-the-diff"), specDir,
      adapter: judge.adapter, judge: { provider: "claude-code", model: "opus" },
    });

    expect(judge.calls()).toBe(0); // an auto-FAIL never reaches the judge, then or now
    expect(results.scenarios[0].judge_verdict).toBe("FAIL");
    expect(results.scenarios[0].judge_reason).toMatch(/nowhere-in-the-diff/);
  });

  // A gate that newly fails must take the verdict down without asking the judge:
  // the gate is objective and it says no.
  test("a PASS whose gate now fails becomes a FAIL with no judge call", async () => {
    const { runDir, specDir } = runWithFailedGate({ diff: DIFF, verdict: "PASS", reason: "looked fine" });
    const judge = countingJudge();

    const { results, changes } = await regateRun({
      runDir, spec: specFor("localhost:8080", "localhost"), specDir, // excludes now hits the same line
      adapter: judge.adapter, judge: { provider: "claude-code", model: "opus" },
    });

    expect(judge.calls()).toBe(0);
    expect(results.scenarios[0].judge_verdict).toBe("FAIL");
    expect(changes[0]).toMatchObject({ id: "A1", from: "PASS", to: "FAIL", gate: "fail", judged: false });
  });

  test("gates: hashes are refreshed, and nothing else is", async () => {
    const { runDir, specDir } = runWithFailedGate({ diff: DIFF });
    const before = readResults(runDir).source_hashes!;

    const { results } = await regateRun({
      runDir, spec: specFor("localhost:8080"), specDir,
      adapter: countingJudge().adapter, judge: { provider: "claude-code", model: "opus" },
    });

    const after = results.source_hashes!;
    expect(after[GATES_PREFIX + "A1"]).not.toBe(before[GATES_PREFIX + "A1"]);
    for (const key of Object.keys(before).filter((k) => k !== GATES_PREFIX + "A1")) {
      expect(after[key], key).toBe(before[key]);
    }
  });

  // The trailer is harness-generated annotation appended AFTER the model's turns, not
  // model output — regenerating it corrects our own note. The pre-regate transcript is
  // kept beside it regardless, so the audit trail never depends on trusting that
  // distinction.
  test("the regenerated transcript keeps the model's turns and the old copy", async () => {
    const { runDir, specDir } = runWithFailedGate({ diff: DIFF });
    await regateRun({
      runDir, spec: specFor("localhost:8080"), specDir,
      adapter: countingJudge().adapter, judge: { provider: "claude-code", model: "opus" },
    });

    const transcript = readFileSync(transcriptPath(runDir, "A1", "green"), "utf8");
    expect(transcript).toContain("ASSISTANT: done"); // the model's turns, untouched
    expect(transcript).toContain('diff_contains "localhost:8080": OK'); // regenerated
    expect(transcript).not.toContain('diff_contains "spike": MISSING'); // the stale note is gone

    const preserved = readdirSync(runDir).filter((f) => f.includes("pre-regate"));
    expect(preserved).toHaveLength(1);
    expect(readFileSync(join(runDir, preserved[0]), "utf8")).toContain('diff_contains "spike": MISSING');
  });

  test("every rep of a --reps run is re-evaluated", async () => {
    const { runDir, specDir } = runWithFailedGate({ diff: DIFF, reps: 3 });
    const judge = countingJudge();

    const { results } = await regateRun({
      runDir, spec: specFor("localhost:8080"), specDir,
      adapter: judge.adapter, judge: { provider: "claude-code", model: "opus" },
    });

    expect(judge.calls()).toBe(3);
    expect(results.scenarios[0].judge_verdict).toBe("PASS");
    expect(results.scenarios[0].passes).toBe(3);
  });

  // Honest limits, stated in the docs and enforced here: these gates need the
  // workspace, and no saved artifact can stand in for it.
  test("refuses a partial repetition artifact set instead of shrinking the denominator", async () => {
    const { runDir, specDir } = runWithFailedGate({ diff: DIFF, reps: 3 });
    rmSync(diffPath(runDir, "A1", "green", 1));
    await expect(regateRun({
      runDir, spec: specFor("localhost:8080"), specDir,
      adapter: countingJudge().adapter, judge: { provider: "claude-code", model: "opus" },
    })).rejects.toThrow(/incomplete for 3 recorded rep/);
  });

  test("a vitest/post_test scenario is refused rather than half-regated", async () => {
    const { runDir, specDir } = runWithFailedGate({ diff: DIFF });
    const spec = specFor("localhost:8080");
    spec.scenarios[0].assert!.vitest = true;

    await expect(
      regateRun({ runDir, spec, specDir, adapter: countingJudge().adapter, judge: { provider: "claude-code", model: "opus" } }),
    ).rejects.toThrow(/vitest|post_test/i);
  });

  test("rejects normalized events that no longer match the run-recorded hash", async () => {
    const { runDir, specDir } = runWithFailedGate({ diff: DIFF });
    const spec = specFor("localhost:8080");
    spec.scenarios[0].trajectoryAssert = { version: "1.0", require: [{ event: "risk_classified" }] };
    const original: TrajectoryEventV1 = { event_version: "1.0", seq: 1, type: "risk_classified", source: "test" };
    const tampered = { ...original, attributes: { fabricated: true } };
    writeFileSync(trajectoryPath(runDir, "A1", "green"), serializeTrajectoryEvents([tampered]));
    const prior = readResults(runDir);
    prior.scenarios[0].objective = { status: "PASS", events_sha256: trajectoryEventsSha256([original]), assertions: [] };
    writeResults(runDir, prior, { shipBar: spec.ship_bar, critical: spec.critical });
    const judge = countingJudge();
    const { results } = await regateRun({ runDir, spec, specDir, adapter: judge.adapter, judge: { provider: "claude-code", model: "opus" } });
    expect(judge.calls()).toBe(0);
    expect(results.scenarios[0].judge_verdict).toBe("ERROR");
    expect(results.scenarios[0].judge_reason).toMatch(/no longer match/);
  });

  test("saved source-normalization errors survive trajectory replay and prevent a judge call", async () => {
    const { runDir, specDir } = runWithFailedGate({ diff: DIFF });
    const spec = specFor("localhost:8080");
    spec.scenarios[0].trajectoryAssert = { version: "1.0", require: [{ event: "risk_classified" }] };
    const event: TrajectoryEventV1 = { event_version: "1.0", seq: 1, type: "risk_classified", source: "test" };
    writeFileSync(trajectoryPath(runDir, "A1", "green"), serializeTrajectoryEvents([event]));
    const prior = readResults(runDir);
    prior.scenarios[0].objective = {
      status: "ERROR",
      assertions: [{ kind: "trajectory_evidence", status: "ERROR", detail: "required event source principal:events.jsonl is malformed" }],
    };
    writeResults(runDir, prior, { shipBar: spec.ship_bar, critical: spec.critical });
    const judge = countingJudge();
    const { results } = await regateRun({ runDir, spec, specDir, adapter: judge.adapter, judge: { provider: "claude-code", model: "opus" } });
    expect(judge.calls()).toBe(0);
    expect(results.scenarios[0].judge_verdict).toBe("ERROR");
    expect(results.scenarios[0].judge_reason).toMatch(/source.*malformed/);
  });

  test("a run whose diff artifacts were never kept says so", async () => {
    const { runDir, specDir } = runWithFailedGate({ diff: DIFF });
    // Diffs are gitignored, so a cloned corpus has the results but not the evidence.
    for (const f of readdirSync(runDir).filter((f) => f.endsWith(".diff.txt"))) {
      writeFileSync(join(runDir, f), "", "utf8");
      rmSync(join(runDir, f));
    }
    await expect(
      regateRun({ runDir, spec: specFor("localhost:8080"), specDir, adapter: countingJudge().adapter, judge: { provider: "claude-code", model: "opus" } }),
    ).rejects.toThrow(/diff artifact/i);
  });

  test("a no-op regate leaves the verdict and the file alone", async () => {
    const { runDir, specDir } = runWithFailedGate({ diff: DIFF });
    const judge = countingJudge();
    const { changes } = await regateRun({
      runDir, spec: specFor("spike"), specDir, // same needle the run recorded
      adapter: judge.adapter, judge: { provider: "claude-code", model: "opus" },
    });
    expect(changes).toEqual([]);
    expect(judge.calls()).toBe(0);
    expect(readResults(runDir).scenarios[0].judge_verdict).toBe("FAIL");
  });
});
