import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSpec, SpecError } from "../src/spec.js";
import { evaluateTraceGates, parseTraceAssert, normalizeSubagentCall } from "../src/trace-gates.js";
import { stimulusDigest, sourceHashes, scenarioSourceKeys } from "../src/sources.js";
import type { ExecutionTraceV1, TraceToolCall } from "../src/capture-trace-types.js";

function call(name: string, args: Record<string, unknown>): TraceToolCall {
  return {
    id: `${name}-${JSON.stringify(args)}`,
    name,
    args,
    issueIndex: 0,
    completionIndex: 0,
    isError: false,
    result: { bytes: 0, sha256: "0".repeat(64) },
  };
}

function trace(calls: TraceToolCall[]): ExecutionTraceV1 {
  return {
    trace_version: 1,
    pi_version: "0.83.0",
    subject: { provider: "p", model: "m" },
    scenario_id: "R1",
    mode: "green",
    rep: 0,
    turn: 0,
    final_text: "The plan subagent recommends rotating the token.",
    tool_calls: calls,
    changed_paths: [],
    cost_usd: null,
  };
}

const AGENT_SUB = {
  require_subagents: [
    { tool: "Agent", agent: "plan", task_contains: ["authentication"], task_excludes: ["password"] },
  ],
};

// --------------------------------------------------------------- normalizers

describe("normalizeSubagentCall", () => {
  it("reads the single shape", () => {
    expect(normalizeSubagentCall({ agent: "plan", task: "diagnose" })).toEqual([{ agent: "plan", task: "diagnose" }]);
  });

  it("reads the parallel shape", () => {
    expect(
      normalizeSubagentCall({ tasks: [{ agent: "plan", task: "a" }, { agent: "review", task: "b" }] }),
    ).toEqual([{ agent: "plan", task: "a" }, { agent: "review", task: "b" }]);
  });

  it("reads the chain shape", () => {
    expect(normalizeSubagentCall({ chain: [{ agent: "plan", task: "a" }] })).toEqual([{ agent: "plan", task: "a" }]);
  });

  it("accepts name/prompt as aliases", () => {
    expect(normalizeSubagentCall({ name: "plan", prompt: "do it" })).toEqual([{ agent: "plan", task: "do it" }]);
  });

  it("returns nothing for an unrecognized shape rather than guessing", () => {
    // Inventing an `agent` here would produce a confident assertion about a field
    // nobody wrote. An unknown extension uses plain require_calls instead.
    expect(normalizeSubagentCall({ instruction: "do the thing" })).toEqual([]);
    expect(normalizeSubagentCall({})).toEqual([]);
  });

  it("tolerates a missing task without dropping the invocation", () => {
    expect(normalizeSubagentCall({ agent: "plan" })).toEqual([{ agent: "plan", task: "" }]);
  });
});

// --------------------------------------------------------------- three layers

describe("orchestration: selection", () => {
  it("passes when the parent delegated to the expected agent", () => {
    const res = evaluateTraceGates(
      AGENT_SUB,
      trace([call("Agent", { agent: "plan", task: "diagnose authentication failure" })]),
    );
    expect(res.status).toBe("PASS");
  });

  it("fails on the wrong agent, and names what it saw", () => {
    const res = evaluateTraceGates(
      AGENT_SUB,
      trace([call("Agent", { agent: "review", task: "diagnose authentication failure" })]),
    );
    expect(res.status).toBe("FAIL");
    expect(res.assertions[0].detail).toContain("saw agents: review");
  });

  it("fails when nothing was delegated at all", () => {
    const res = evaluateTraceGates(AGENT_SUB, trace([call("read", { path: "a" })]));
    expect(res.status).toBe("FAIL");
    expect(res.assertions[0].detail).toContain("no `Agent` invocation was recorded");
  });

  it("reports one failure, not three, when selection failed", () => {
    // Handoff checks are meaningless with nothing to inspect; reporting them too
    // would triple a single root cause.
    const res = evaluateTraceGates(AGENT_SUB, trace([]));
    expect(res.assertions).toHaveLength(1);
  });

  it("counts invocations across the parallel shape", () => {
    const res = evaluateTraceGates(
      { require_subagents: [{ tool: "Agent", agent: "plan", count: { min: 2 } }] },
      trace([call("Agent", { tasks: [{ agent: "plan", task: "a" }, { agent: "plan", task: "b" }] })]),
    );
    expect(res.status).toBe("PASS");
  });

  it("enforces a maximum — over-delegation is a real failure mode", () => {
    const res = evaluateTraceGates(
      { require_subagents: [{ tool: "Agent", agent: "plan", count: { max: 1 } }] },
      trace([
        call("Agent", { agent: "plan", task: "a" }),
        call("Agent", { agent: "plan", task: "b" }),
      ]),
    );
    expect(res.status).toBe("FAIL");
  });
});

describe("orchestration: handoff", () => {
  it("fails when required context was omitted", () => {
    const res = evaluateTraceGates(AGENT_SUB, trace([call("Agent", { agent: "plan", task: "look into it" })]));
    expect(res.status).toBe("FAIL");
    expect(res.assertions.some((a) => a.detail.includes("omitted required context"))).toBe(true);
  });

  it("fails when forbidden content leaked into the handoff", () => {
    const res = evaluateTraceGates(
      AGENT_SUB,
      trace([call("Agent", { agent: "plan", task: "authentication broke, password is hunter2" })]),
    );
    expect(res.status).toBe("FAIL");
    expect(res.assertions.some((a) => a.detail.includes("leaked forbidden content"))).toBe(true);
  });

  it("passes selection and reports both handoff checks separately", () => {
    const res = evaluateTraceGates(
      AGENT_SUB,
      trace([call("Agent", { agent: "plan", task: "diagnose authentication failure" })]),
    );
    expect(res.assertions).toHaveLength(3); // selection + contains + excludes
    expect(res.assertions.every((a) => a.status === "PASS")).toBe(true);
  });

  it("only inspects handoffs to the named agent", () => {
    const res = evaluateTraceGates(
      AGENT_SUB,
      trace([
        call("Agent", { agent: "review", task: "password is hunter2" }), // not the target
        call("Agent", { agent: "plan", task: "diagnose authentication failure" }),
      ]),
    );
    expect(res.status).toBe("PASS");
  });
});

describe("orchestration: integration stays the judge's job", () => {
  it("objective gates pass even when the final answer is useless", () => {
    // Selection and handoff are objective; whether the parent USED the child's
    // report correctly is semantic, and stays with the checklist judge.
    const res = evaluateTraceGates(
      AGENT_SUB,
      { ...trace([call("Agent", { agent: "plan", task: "diagnose authentication failure" })]), final_text: "idk" },
    );
    expect(res.status).toBe("PASS");
  });
});

// --------------------------------------------------------------- spec

let dir: string;
let specPath: string;

function spec(body: string): string {
  return `skill: demo
judge_persona: p
ship_bar: { total: 1, min_pass: 1, no_critical_fail: true }
critical: []
scenarios:
  - id: R1
    title: delegates
    turns:
      - "find why auth is failing"
    checklist:
      - integrates the recommendation
${body}
`;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "sh-orch-"));
  mkdirSync(join(dir, "ext"), { recursive: true });
  specPath = join(dir, "specification.yaml");
  writeFileSync(join(dir, "ext", "subagents.ts"), "export default function () {}\n", "utf8");
});

describe("env.extensions", () => {
  it("parses a list of paths", () => {
    const parsed = parseSpec(spec(`    env:\n      extensions:\n        - ext/subagents.ts`), specPath);
    expect(parsed.scenarios[0].extensions).toEqual(["ext/subagents.ts"]);
  });

  it("is absent when not declared", () => {
    expect(parseSpec(spec(""), specPath).scenarios[0].extensions).toBeUndefined();
  });

  it.each([
    ["an empty list", `    env:\n      extensions: []`],
    ["a non-list", `    env:\n      extensions: "ext/a.ts"`],
    ["an empty path", `    env:\n      extensions:\n        - ""`],
  ])("rejects %s", (_label, body) => {
    expect(() => parseSpec(spec(body), specPath)).toThrow(SpecError);
  });

  it("rejects the system_prompt_file combination", () => {
    // system_prompt_file REPLACES the system prompt to test a subagent alone;
    // env.extensions tests the parent that delegates to one. Both = neither.
    const body = `    system_prompt_file: agents/plan.md\n    env:\n      extensions:\n        - ext/subagents.ts`;
    expect(() => parseSpec(spec(body), specPath)).toThrow(/Pick one/);
  });
});

describe("extensions are stimulus, not gates", () => {
  it("changing the declared list changes the stimulus digest", () => {
    const a = parseSpec(spec(`    env:\n      extensions:\n        - ext/a.ts`), specPath).scenarios[0];
    const b = parseSpec(spec(`    env:\n      extensions:\n        - ext/b.ts`), specPath).scenarios[0];
    expect(stimulusDigest(a)).not.toBe(stimulusDigest(b));
  });

  it("hashes extension CONTENTS, so editing one marks results stale", () => {
    const scenarios = parseSpec(spec(`    env:\n      extensions:\n        - ext/subagents.ts`), specPath).scenarios;
    const before = sourceHashes({ skillDir: dir, specDir: dir, scenarios, judgePersona: "p" });

    writeFileSync(join(dir, "ext", "subagents.ts"), "export default function () { /* edited */ }\n", "utf8");
    const after = sourceHashes({ skillDir: dir, specDir: dir, scenarios, judgePersona: "p" });

    // The spec did not change one character, but what the model could DO did.
    expect(after["ext/subagents.ts"]).not.toBe(before["ext/subagents.ts"]);
  });

  it("lists the extension among the scenario's source keys", () => {
    const s = parseSpec(spec(`    env:\n      extensions:\n        - ext/subagents.ts`), specPath).scenarios[0];
    expect(scenarioSourceKeys(s)).toContain("ext/subagents.ts");
  });
});

describe("require_subagents parsing", () => {
  it("accepts the documented shape", () => {
    const parsed = parseTraceAssert(
      { require_subagents: [{ tool: "Agent", agent: "plan", count: { min: 1 }, task_contains: ["auth"], task_excludes: ["secret"] }] },
      "R1",
    );
    expect(parsed.require_subagents![0]).toMatchObject({ tool: "Agent", agent: "plan" });
  });

  it.each([
    ["a missing agent", { require_subagents: [{ tool: "Agent" }] }, /`agent` must be a non-empty string/],
    ["a missing tool", { require_subagents: [{ agent: "plan" }] }, /non-empty `tool`/],
    ["an unknown key", { require_subagents: [{ tool: "A", agent: "p", nope: 1 }] }, /unknown key/],
    ["an empty needle", { require_subagents: [{ tool: "A", agent: "p", task_contains: [""] }] }, /non-empty string/],
  ])("rejects %s", (_label, raw, pattern) => {
    expect(() => parseTraceAssert(raw, "R1")).toThrow(pattern);
  });

  it("rejects an empty needle because it would match every handoff", () => {
    expect(() => parseTraceAssert({ require_subagents: [{ tool: "A", agent: "p", task_excludes: [""] }] }, "R1")).toThrow();
  });
});
