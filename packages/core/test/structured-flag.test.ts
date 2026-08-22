import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSkillModel } from "../src/run.js";
import { loadSpec } from "../src/spec.js";
import { EXECUTION_TRACE_VERSION } from "../src/capture-trace-types.js";
import type { HarnessAdapter, RunReq, StructuredRun } from "../src/adapters/types.js";
import type { ExecutionTraceV1 } from "../src/capture-trace-types.js";

/**
 * A bare `--structured` request, with no gate depending on it, is the one
 * thing the flag exists to capture: subject token/cost metrics that are
 * otherwise never populated (see `RunOptions.structured` in run.ts). Before this
 * wave, `run()`'s SEEDED branch keyed `runSeeded`'s `trace` opt only off
 * `traceAssert`/`trajectoryAssert` — a bare `--structured` request on a
 * `mode: seeded` scenario silently took the plain `adapter.run()` path and
 * recorded zero subject tokens/cost (I3). The non-seeded branch already
 * honoured the flag on its own; T2 covers that path having no deliverable test
 * of its own (only a CLI help-text assertion existed).
 */

function traceWithTokens(): ExecutionTraceV1 {
  return {
    trace_version: EXECUTION_TRACE_VERSION,
    pi_version: "0.83.0",
    subject: { provider: "fireworks", model: "x" },
    scenario_id: "S1",
    mode: "green",
    rep: 0,
    turn: 0,
    final_text: "done",
    tool_calls: [],
    changed_paths: [],
    cost_usd: 0.02,
    metrics: {
      input_tokens: 321,
      output_tokens: 45,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      cost_usd: 0.02,
      tool_calls: 0,
      delegated_children: 0,
      max_concurrency: 0,
    },
  };
}

function structuredSpyAdapter(): { adapter: HarnessAdapter; structuredCalls: () => number; plainCalls: () => number } {
  let structuredCalls = 0;
  let plainCalls = 0;
  const adapter: HarnessAdapter = {
    name: "fake",
    available: async () => true,
    run: async (_req: RunReq) => {
      plainCalls += 1;
      return ">>> USER:\nx\n\n<<< ASSISTANT:\ndone\n";
    },
    runStructured: async (_req: RunReq): Promise<StructuredRun> => {
      structuredCalls += 1;
      return { transcript: ">>> USER:\nx\n\n<<< ASSISTANT:\ndone\n", traces: [traceWithTokens()] };
    },
    judge: async () => "VERDICT: PASS\n1. PASS",
    version: async () => "0.84.2",
  };
  return { adapter, structuredCalls: () => structuredCalls, plainCalls: () => plainCalls };
}

describe("--structured on an ungated plain scenario (T2)", () => {
  let skillDir: string;
  let specPath: string;
  beforeEach(() => {
    skillDir = mkdtempSync(join(tmpdir(), "sh-structured-plain-"));
    mkdirSync(join(skillDir, "tests"), { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "---\nname: demo\ndescription: d\n---\n\n## Do it\n", "utf8");
    specPath = join(skillDir, "tests", "specification.yaml");
    writeFileSync(
      specPath,
      [
        "skill: demo",
        "judge_persona: a strict reviewer",
        "ship_bar: { total: 1, min_pass: 1, no_critical_fail: true }",
        "scenarios:",
        "  - id: A1",
        "    title: does it",
        "    turns: ['do it']",
        "    checklist: ['did it']",
      ].join("\n") + "\n",
      "utf8",
    );
  });

  // Mutation: reverting the non-seeded branch's `wantStructured` computation in
  // run.ts back to `Boolean(scenario.traceAssert) || Boolean(scenario.trajectoryAssert)`
  // (dropping `Boolean(ctx.structured) ||`) makes this test's `structuredCalls`
  // assertion fail — it would come back 0, `plainCalls` would be 1, and
  // `metrics.input_tokens` would be undefined.
  it("routes through runStructured and records subject token metrics, though no gate needs them", async () => {
    const { adapter, structuredCalls, plainCalls } = structuredSpyAdapter();
    const summary = await runSkillModel({
      spec: loadSpec(specPath),
      skillDir,
      specPath,
      adapter,
      model: { provider: "fireworks", model: "x" },
      modelToken: "fireworks:x",
      judge: { provider: "claude-code", model: "j" },
      mode: "green",
      timestamp: "2026-08-22T00:00:00.000Z",
      structured: true,
    });

    expect(structuredCalls()).toBe(1);
    expect(plainCalls()).toBe(0);
    expect(summary.results.scenarios[0].metrics?.input_tokens).toBe(321);
    // No trace/trajectory assertion was declared — `--structured` alone must not
    // manufacture an objective gate that was never asked for.
    expect(summary.results.scenarios[0].objective).toBeUndefined();
  });

  it("takes the plain path with no metrics when --structured is not requested", async () => {
    const { adapter, structuredCalls, plainCalls } = structuredSpyAdapter();
    const summary = await runSkillModel({
      spec: loadSpec(specPath),
      skillDir,
      specPath,
      adapter,
      model: { provider: "fireworks", model: "x" },
      modelToken: "fireworks:x",
      judge: { provider: "claude-code", model: "j" },
      mode: "green",
      timestamp: "2026-08-22T00:00:00.000Z",
    });
    expect(structuredCalls()).toBe(0);
    expect(plainCalls()).toBe(1);
    expect(summary.results.scenarios[0].metrics?.input_tokens).toBeUndefined();
  });
});

describe("--structured on a mode: seeded scenario with no trace/trajectory assert (I3)", () => {
  function seededCorpusNoGate(): { dir: string; specPath: string } {
    const root = mkdtempSync(join(tmpdir(), "sh-seeded-structured-"));
    const dir = join(root, "golden");
    mkdirSync(join(dir, "tests", "fixtures", "S1"), { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), "---\nname: golden\n---\n\n## Fix\nFix it.\n", "utf8");
    writeFileSync(join(dir, "tests", "fixtures", "S1", "seed.ts"), "export const a = 1;\n", "utf8");
    const specPath = join(dir, "tests", "specification.yaml");
    writeFileSync(
      specPath,
      [
        "skill: golden",
        "judge_persona: a friendly reviewer",
        "ship_bar: { total: 1, min_pass: 1, no_critical_fail: true }",
        "scenarios:",
        "  - id: S1",
        "    title: fixes it",
        "    mode: seeded",
        "    fixture: fixtures/S1",
        "    turns: ['fix it']",
        "    checklist: ['fixes it']",
      ].join("\n") + "\n",
      "utf8",
    );
    return { dir, specPath };
  }

  // Mutation: reverting run.ts's seeded-branch `trace:` option back to
  // `scenario.traceAssert || scenario.trajectoryAssert ? {...} : undefined`
  // (dropping `ctx.structured ||`) makes this test's `structuredCalls`
  // assertion fail — `runSeeded` would call the adapter's plain `run()`
  // instead, `plainCalls` would be 1, and no subject metrics would be recorded.
  it("routes through runStructured and records subject token metrics on the seeded path too", async () => {
    const { dir, specPath } = seededCorpusNoGate();
    const { adapter, structuredCalls, plainCalls } = structuredSpyAdapter();
    const summary = await runSkillModel({
      spec: loadSpec(specPath),
      skillDir: dir,
      specPath,
      adapter,
      model: { provider: "fireworks", model: "x" },
      modelToken: "fireworks:x",
      judge: { provider: "claude-code", model: "j" },
      mode: "green",
      timestamp: "2026-08-22T00:00:00.000Z",
      structured: true,
    });

    expect(structuredCalls()).toBe(1);
    expect(plainCalls()).toBe(0);
    expect(summary.results.scenarios[0].metrics?.input_tokens).toBe(321);
  });

  it("takes the plain path with no metrics on the seeded path when --structured is not requested", async () => {
    const { dir, specPath } = seededCorpusNoGate();
    const { adapter, structuredCalls, plainCalls } = structuredSpyAdapter();
    const summary = await runSkillModel({
      spec: loadSpec(specPath),
      skillDir: dir,
      specPath,
      adapter,
      model: { provider: "fireworks", model: "x" },
      modelToken: "fireworks:x",
      judge: { provider: "claude-code", model: "j" },
      mode: "green",
      timestamp: "2026-08-22T00:00:00.000Z",
    });
    expect(structuredCalls()).toBe(0);
    expect(plainCalls()).toBe(1);
    expect(summary.results.scenarios[0].metrics?.input_tokens).toBeUndefined();
  });

  // The two branches degraded ASYMMETRICALLY. The non-seeded branch fell back to
  // `adapter.run()` when the adapter had no `runStructured`; the seeded branch
  // passed `trace: {...}` unconditionally, and `runSeeded` then threw
  // ``scenario `S1` declares `assert.trace`…`` at a scenario that declares no
  // such thing — a message that is not merely unhelpful but false.
  //
  // Mutation: reverting run.ts's seeded `trace:` back to keying off
  // `ctx.structured || ...` instead of `useStructured` makes this throw.
  it("degrades to the plain path when the adapter cannot produce traces, and says nothing about assert.trace", async () => {
    const { dir, specPath } = seededCorpusNoGate();
    let plainCalls = 0;
    const noStructured: HarnessAdapter = {
      name: "fake",
      available: async () => true,
      run: async () => { plainCalls += 1; return ">>> USER:\nx\n\n<<< ASSISTANT:\ndone\n"; },
      judge: async () => "VERDICT: PASS\n1. PASS",
      version: async () => "0.84.2",
    };
    const summary = await runSkillModel({
      spec: loadSpec(specPath),
      skillDir: dir,
      specPath,
      adapter: noStructured,
      model: { provider: "fireworks", model: "x" },
      modelToken: "fireworks:x",
      judge: { provider: "claude-code", model: "j" },
      mode: "green",
      timestamp: "2026-08-22T00:00:00.000Z",
      structured: true,
    });
    expect(plainCalls).toBe(1);
    expect(summary.results.scenarios[0].judge_verdict).toBe("PASS");
  });

  // The other half of the same decision, unchanged: a scenario that genuinely
  // declares structured assertions must still ERROR rather than fall back, or a
  // gate with no evidence to read would look like a gate that passed.
  it("still refuses when a scenario really does declare structured assertions", async () => {
    const root = mkdtempSync(join(tmpdir(), "sh-structured-gated-"));
    mkdirSync(join(root, "tests"), { recursive: true });
    writeFileSync(join(root, "SKILL.md"), "---\nname: demo\ndescription: d\n---\n\n## Do it\n", "utf8");
    const gatedSpec = join(root, "tests", "specification.yaml");
    writeFileSync(
      gatedSpec,
      [
        "skill: demo",
        "judge_persona: a strict reviewer",
        "ship_bar: { total: 1, min_pass: 1, no_critical_fail: true }",
        "scenarios:",
        "  - id: A1",
        "    title: does it",
        "    turns: ['do it']",
        "    checklist: ['did it']",
        "    assert:",
        "      trace:",
        "        forbid_calls: [write]",
      ].join("\n") + "\n",
      "utf8",
    );
    const noStructured: HarnessAdapter = {
      name: "fake",
      available: async () => true,
      run: async () => ">>> USER:\nx\n\n<<< ASSISTANT:\ndone\n",
      judge: async () => "VERDICT: PASS\n1. PASS",
      version: async () => "0.84.2",
    };
    await expect(runSkillModel({
      spec: loadSpec(gatedSpec),
      skillDir: root,
      specPath: gatedSpec,
      adapter: noStructured,
      model: { provider: "fireworks", model: "x" },
      modelToken: "fireworks:x",
      judge: { provider: "claude-code", model: "j" },
      mode: "green",
      timestamp: "2026-08-22T00:00:00.000Z",
    })).rejects.toThrow(/cannot produce execution traces/);
  });
});
