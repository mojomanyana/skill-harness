import { EXECUTION_TRACE_VERSION } from "../src/capture-trace-types.js";
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSkillModel } from "../src/run.js";
import { loadSpec } from "../src/spec.js";
import { tracePath } from "../src/results.js";
import { deserializeTrace } from "../src/execution-trace.js";
import type { HarnessAdapter, RunReq, StructuredRun } from "../src/adapters/types.js";
import type { ExecutionTraceV1, TraceToolCall } from "../src/capture-trace-types.js";

/**
 * End-to-end behavior of the objective gate layer inside a real run.
 *
 * The load-bearing claim is the judge-call COUNT: a scenario whose trace gate
 * failed must cost zero judge tokens. Everything else in this file is secondary
 * to counting that.
 */

function traceOf(calls: Partial<TraceToolCall>[], changed: string[] = []): ExecutionTraceV1 {
  return {
    trace_version: EXECUTION_TRACE_VERSION,
    pi_version: "0.83.0",
    subject: { provider: "p", model: "m" },
    scenario_id: "A1",
    mode: "green",
    rep: 0,
    turn: 0,
    final_text: "I have finished the task.",
    tool_calls: calls.map((c, i) => ({
      id: `c${i}`,
      name: "read",
      args: {},
      issueIndex: i,
      completionIndex: i,
      isError: false,
      result: { bytes: 0, sha256: "0".repeat(64) },
      ...c,
    })),
    changed_paths: changed,
    cost_usd: 0,
  };
}

interface Spy {
  adapter: HarnessAdapter;
  judgeCalls: number;
  structuredCalls: number;
  plainRunCalls: number;
}

function spyAdapter(traces: ExecutionTraceV1[], opts: { structured?: boolean; writes?: string } = {}): Spy {
  const spy: Spy = { judgeCalls: 0, structuredCalls: 0, plainRunCalls: 0, adapter: null as never };
  const adapter: HarnessAdapter = {
    name: "fake",
    available: async () => true,
    version: async () => "0.83.0",
    async run(_req: RunReq) {
      spy.plainRunCalls++;
      return ">>> USER:\nx\n\n<<< ASSISTANT:\nI have finished the task.\n";
    },
    async judge() {
      spy.judgeCalls++;
      return "ITEM 1: PASS\nVERDICT: PASS\nREASON: fine";
    },
  };
  if (opts.structured !== false) {
    adapter.runStructured = async (req: RunReq): Promise<StructuredRun> => {
      spy.structuredCalls++;
      // Write into the real workspace when asked, so `unchanged_paths` is checked
      // against an actual filesystem change rather than a synthetic trace field.
      if (opts.writes) writeFileSync(join(req.cwd, opts.writes), "touched", "utf8");
      return {
        transcript: `>>> USER:\n${req.turns[0]}\n\n<<< ASSISTANT:\nI have finished the task.\n`,
        traces,
      };
    };
  }
  spy.adapter = adapter;
  return spy;
}

let skillDir: string;
let specPath: string;

function writeSpec(traceBlock: string): void {
  writeFileSync(
    specPath,
    `skill: demo
judge_persona: a strict reviewer
ship_bar:
  total: 1
  min_pass: 1
  no_critical_fail: true
critical: []

scenarios:
  - id: A1
    title: delegates properly
    turns:
      - "do the thing"
    checklist:
      - does the thing
${traceBlock}
`,
    "utf8",
  );
}

beforeEach(() => {
  skillDir = mkdtempSync(join(tmpdir(), "sh-trace-run-"));
  mkdirSync(join(skillDir, "tests"), { recursive: true });
  specPath = join(skillDir, "tests", "specification.yaml");
  writeFileSync(join(skillDir, "SKILL.md"), "---\nname: demo\ndescription: d\n---\n\n## Do it\n", "utf8");
});

async function run(spy: Spy) {
  return runSkillModel({
    spec: loadSpec(specPath),
    skillDir,
    specPath,
    adapter: spy.adapter,
    model: { provider: "fireworks", model: "x" },
    modelToken: "fireworks:x",
    judge: { provider: "claude-code", model: "j" },
    mode: "green",
    timestamp: "2026-08-08T00-00-00",
    onProgress: () => {},
  });
}

const REQUIRE_AGENT = `    assert:
      trace:
        require_calls:
          - tool: Agent
            args:
              agent: plan`;

describe("objective gates in a run", () => {
  it("a failing gate costs ZERO judge calls", async () => {
    writeSpec(REQUIRE_AGENT);
    const spy = spyAdapter([traceOf([{ name: "read" }])]); // no Agent call
    const summary = await run(spy);

    expect(spy.judgeCalls).toBe(0);
    expect(summary.results.scenarios[0].judge_verdict).toBe("FAIL");
    expect(summary.results.scenarios[0].judge_reason).toContain("objective:");
  });

  it("a passing gate proceeds to the judge exactly once", async () => {
    writeSpec(REQUIRE_AGENT);
    const spy = spyAdapter([traceOf([{ name: "Agent", args: { agent: "plan" } }])]);
    const summary = await run(spy);

    expect(spy.judgeCalls).toBe(1);
    expect(summary.results.scenarios[0].judge_verdict).toBe("PASS");
    expect(summary.results.scenarios[0].objective?.status).toBe("PASS");
  });

  it("routes trace-gated scenarios through runStructured, not the plain path", async () => {
    writeSpec(REQUIRE_AGENT);
    const spy = spyAdapter([traceOf([{ name: "Agent", args: { agent: "plan" } }])]);
    await run(spy);
    expect(spy.structuredCalls).toBe(1);
    expect(spy.plainRunCalls).toBe(0);
  });

  it("leaves ungated scenarios on the plain path — no silent epoch", async () => {
    writeSpec(""); // no assert.trace
    const spy = spyAdapter([]);
    await run(spy);
    expect(spy.plainRunCalls).toBe(1);
    expect(spy.structuredCalls).toBe(0);
  });

  it("records no `objective` field at all when nothing was declared", async () => {
    writeSpec("");
    const spy = spyAdapter([]);
    const summary = await run(spy);
    // Absent must mean "not declared" — never a silent objective pass.
    expect(summary.results.scenarios[0].objective).toBeUndefined();
    expect("objective" in summary.results.scenarios[0]).toBe(false);
  });
});

describe("missing evidence is ERROR, never a pass", () => {
  it("errors when the adapter cannot produce traces", async () => {
    writeSpec(REQUIRE_AGENT);
    const spy = spyAdapter([], { structured: false });
    await expect(run(spy)).rejects.toThrow(/cannot produce execution traces/);
    expect(spy.judgeCalls).toBe(0);
  });

  it("errors when the structured run yields no trace", async () => {
    writeSpec(REQUIRE_AGENT);
    const spy = spyAdapter([]); // structured, but returns zero traces
    const summary = await run(spy);
    expect(summary.results.scenarios[0].judge_verdict).toBe("ERROR");
    expect(summary.results.scenarios[0].objective?.status).toBe("ERROR");
    expect(spy.judgeCalls).toBe(0);
  });

  it("does not let an empty trace satisfy a forbid_calls gate", async () => {
    // The dangerous shape: "we recorded nothing" must not read as "it called nothing".
    writeSpec(`    assert:
      trace:
        forbid_calls:
          - write`);
    const spy = spyAdapter([]);
    const summary = await run(spy);
    expect(summary.results.scenarios[0].judge_verdict).toBe("ERROR");
    expect(spy.judgeCalls).toBe(0);
  });
});

describe("trace artifacts", () => {
  it("saves a replayable trace beside the transcript", async () => {
    writeSpec(REQUIRE_AGENT);
    const spy = spyAdapter([traceOf([{ name: "Agent", args: { agent: "plan" } }])]);
    const summary = await run(spy);

    const path = tracePath(summary.runDir, "A1", "green");
    expect(existsSync(path)).toBe(true);
    const back = deserializeTrace(readFileSync(path, "utf8"))!;
    expect(back.tool_calls[0].name).toBe("Agent");
  });

  it("saves the trace even when the gate failed — that is when you want to read it", async () => {
    writeSpec(REQUIRE_AGENT);
    const spy = spyAdapter([traceOf([{ name: "read" }])]);
    const summary = await run(spy);
    expect(existsSync(tracePath(summary.runDir, "A1", "green"))).toBe(true);
  });

  it("records the evaluated assertions with the result", async () => {
    writeSpec(REQUIRE_AGENT);
    const spy = spyAdapter([traceOf([{ name: "read" }])]);
    const summary = await run(spy);
    const obj = summary.results.scenarios[0].objective!;
    expect(obj.status).toBe("FAIL");
    expect(obj.assertions[0].kind).toBe("require_call");
    expect(obj.trace_sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("forbidden tools and protected paths", () => {
  it("fails and skips the judge when a forbidden tool was called", async () => {
    writeSpec(`    assert:
      trace:
        forbid_calls:
          - write`);
    const spy = spyAdapter([traceOf([{ name: "write", args: { path: "a.ts" } }])]);
    const summary = await run(spy);
    expect(summary.results.scenarios[0].judge_verdict).toBe("FAIL");
    expect(spy.judgeCalls).toBe(0);
  });

  const PATH_SPEC = `    env:
      workspace: empty-git
    assert:
      trace:
        unchanged_paths:
          - ".env"`;

  it("fails when a protected path actually changed on disk", async () => {
    // The regression this replaces: `changed_paths` was fed from the request,
    // which is built BEFORE the run, so nothing ever set it and the assertion
    // passed vacuously. Now the adapter really writes `.env` and the gate must see it.
    writeSpec(PATH_SPEC);
    const spy = spyAdapter([traceOf([])], { writes: ".env" });
    const summary = await run(spy);
    expect(summary.results.scenarios[0].judge_verdict).toBe("FAIL");
    expect(summary.results.scenarios[0].judge_reason).toContain(".env");
    expect(spy.judgeCalls).toBe(0);
  });

  it("passes when nothing was written — observed, not assumed", async () => {
    writeSpec(PATH_SPEC);
    const spy = spyAdapter([traceOf([])]);
    const summary = await run(spy);
    expect(summary.results.scenarios[0].objective?.status).toBe("PASS");
  });

  it("refuses at spec load when there is no workspace to observe", () => {
    // Free and offline. A path policy with nothing to compare against would pass
    // unconditionally, which is the failure mode, so it is not allowed to exist.
    writeSpec(`    assert:
      trace:
        unchanged_paths:
          - ".env"`);
    expect(() => loadSpec(specPath)).toThrow(/no workspace to observe/);
  });
});

describe("regate re-decides a trace gate from saved evidence", () => {
  it("flips FAIL→PASS from the saved trace with no judge call when the spec relaxes", async () => {
    writeSpec(REQUIRE_AGENT);
    const spy = spyAdapter([traceOf([{ name: "read" }])]);
    const summary = await run(spy);
    expect(summary.results.scenarios[0].judge_verdict).toBe("FAIL");
    const judgeCallsAfterRun = spy.judgeCalls;
    expect(judgeCallsAfterRun).toBe(0);

    // Author corrects the assertion: it was `read` all along.
    writeSpec(`    assert:
      trace:
        require_calls:
          - tool: read`);

    const { regateRun } = await import("../src/regate.js");
    const res = await regateRun({
      runDir: summary.runDir,
      spec: loadSpec(specPath),
      adapter: spy.adapter,
      judge: { provider: "claude-code", model: "j" },
      specDir: join(skillDir, "tests"),
      now: () => "2026-08-08T00:00:00.000Z",
    });

    expect(res.results.scenarios[0].objective?.status).toBe("PASS");
    // The gate now passes, so the rep needs a judgement it never got — exactly
    // one call, and only because the verdict flipped in the model's favour.
    expect(spy.judgeCalls).toBe(1);
  });

  it("refuses rather than inventing a verdict when the run saved no trace", async () => {
    writeSpec("");
    const spy = spyAdapter([]);
    const summary = await run(spy); // ungated run — no trace artifact written

    writeSpec(REQUIRE_AGENT); // gate added after the fact
    const { regateRun } = await import("../src/regate.js");
    await expect(
      regateRun({
        runDir: summary.runDir,
        spec: loadSpec(specPath),
        adapter: spy.adapter,
        judge: { provider: "claude-code", model: "j" },
        specDir: join(skillDir, "tests"),
        now: () => "2026-08-08T00:00:00.000Z",
      }),
    ).rejects.toThrow(/needs a re-run/);
  });
});
