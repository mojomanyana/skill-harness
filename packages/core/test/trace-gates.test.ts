import { describe, it, expect } from "vitest";
import { evaluateTraceGates, parseTraceAssert, testPredicate, matchesGlob } from "../src/trace-gates.js";
import type { ExecutionTraceV1, TraceToolCall } from "../src/capture-trace-types.js";

function call(name: string, args: Record<string, unknown>, extra: Partial<TraceToolCall> = {}): TraceToolCall {
  return {
    id: `${name}-${Math.random()}`,
    name,
    args,
    issueIndex: 0,
    completionIndex: 0,
    isError: false,
    result: { bytes: 0, sha256: "0".repeat(64) },
    ...extra,
  };
}

function trace(calls: TraceToolCall[], changed: string[] = []): ExecutionTraceV1 {
  return {
    trace_version: 1,
    pi_version: "0.83.0",
    subject: { provider: "p", model: "m" },
    scenario_id: "A1",
    mode: "green",
    rep: 0,
    turn: 0,
    final_text: "done",
    tool_calls: calls,
    changed_paths: changed,
    cost_usd: null,
  };
}

// --------------------------------------------------------------- predicates

describe("testPredicate", () => {
  it.each([
    ["equals string", "plan", { equals: "plan" }, true],
    ["equals mismatch", "review", { equals: "plan" }, false],
    ["equals number", 3, { equals: 3 }, true],
    ["contains", "diagnose authentication", { contains: "authentication" }, true],
    ["contains miss", "diagnose", { contains: "authentication" }, false],
    ["starts_with", "src/app.ts", { starts_with: "src/" }, true],
    ["ends_with", "src/app.ts", { ends_with: ".ts" }, true],
    ["matches", "v1.2.3", { matches: "^v\\d+\\.\\d+" }, true],
    ["matches miss", "beta", { matches: "^v\\d+" }, false],
    ["exists true", "x", { exists: true }, true],
    ["exists true on absent", undefined, { exists: true }, false],
    ["exists false on absent", undefined, { exists: false }, true],
    ["exists false on present", "x", { exists: false }, false],
  ])("%s", (_label, value, predicate, expected) => {
    expect(testPredicate(value, predicate)).toBe(expected);
  });

  it("ANDs multiple operators on one field", () => {
    expect(testPredicate("src/app.ts", { starts_with: "src/", ends_with: ".ts" })).toBe(true);
    expect(testPredicate("src/app.js", { starts_with: "src/", ends_with: ".ts" })).toBe(false);
  });

  it("matches any element of an array", () => {
    expect(testPredicate(["a", "b"], { any: { equals: "b" } })).toBe(true);
    expect(testPredicate(["a", "b"], { any: { equals: "z" } })).toBe(false);
    expect(testPredicate("not an array", { any: { equals: "a" } })).toBe(false);
  });

  it("does not invent a match on an absent value", () => {
    // "" .includes("") is true — an absent argument must not satisfy `contains`
    // of a non-empty needle.
    expect(testPredicate(undefined, { contains: "x" })).toBe(false);
    expect(testPredicate(null, { starts_with: "x" })).toBe(false);
  });
});

describe("matchesGlob", () => {
  it.each([
    [".env", ".env", true],
    ["src/*", "src/app.ts", true],
    ["src/*", "src/nested/app.ts", false],
    ["src/**", "src/nested/deep/app.ts", true],
    ["src/unrelated/**", "src/unrelated/a/b.ts", true],
    ["src/unrelated/**", "src/related/a.ts", false],
    ["**/*.ts", "a/b/c.ts", true],
    ["*.ts", "a.ts", true],
  ])("%s vs %s", (pattern, path, expected) => {
    expect(matchesGlob(pattern, path)).toBe(expected);
  });

  it("normalizes ./ and backslashes so spelling cannot flip a gate", () => {
    expect(matchesGlob("src/app.ts", "./src/app.ts")).toBe(true);
    expect(matchesGlob("src/app.ts", "src\\app.ts")).toBe(true);
  });

  it("treats a literal dot as a dot, not a wildcard", () => {
    expect(matchesGlob(".env", "xenv")).toBe(false);
  });
});

// --------------------------------------------------------------- evaluation

describe("evaluateTraceGates — require_calls", () => {
  it("passes when the required call happened with matching arguments", () => {
    const res = evaluateTraceGates(
      { require_calls: [{ tool: "Agent", args: { agent: { equals: "plan" } } }] },
      trace([call("Agent", { agent: "plan", task: "diagnose auth" })]),
    );
    expect(res.status).toBe("PASS");
  });

  it("fails when the tool was never called", () => {
    const res = evaluateTraceGates({ require_calls: [{ tool: "Agent" }] }, trace([call("read", { path: "x" })]));
    expect(res.status).toBe("FAIL");
  });

  it("distinguishes 'never called' from 'called with different arguments'", () => {
    const never = evaluateTraceGates(
      { require_calls: [{ tool: "Agent", args: { agent: { equals: "plan" } } }] },
      trace([call("read", {})]),
    );
    expect(never.assertions[0].detail).toContain("never called");

    const wrongArgs = evaluateTraceGates(
      { require_calls: [{ tool: "Agent", args: { agent: { equals: "plan" } } }] },
      trace([call("Agent", { agent: "review" })]),
    );
    expect(wrongArgs.assertions[0].detail).toContain("different arguments");
  });

  it("enforces min and max counts", () => {
    const two = trace([call("read", { path: "a" }), call("read", { path: "b" })]);
    expect(evaluateTraceGates({ require_calls: [{ tool: "read", count: { min: 2 } }] }, two).status).toBe("PASS");
    expect(evaluateTraceGates({ require_calls: [{ tool: "read", count: { min: 3 } }] }, two).status).toBe("FAIL");
    expect(evaluateTraceGates({ require_calls: [{ tool: "read", count: { max: 1 } }] }, two).status).toBe("FAIL");
    expect(evaluateTraceGates({ require_calls: [{ tool: "read", count: { min: 1, max: 2 } }] }, two).status).toBe("PASS");
  });

  it("defaults to requiring at least one call", () => {
    expect(evaluateTraceGates({ require_calls: [{ tool: "read" }] }, trace([])).status).toBe("FAIL");
  });
});

describe("evaluateTraceGates — forbid_calls", () => {
  it("fails when a forbidden tool was called", () => {
    const res = evaluateTraceGates({ forbid_calls: [{ tool: "write" }] }, trace([call("write", { path: "x" })]));
    expect(res.status).toBe("FAIL");
    expect(res.assertions[0].detail).toContain("forbidden");
  });

  it("passes when it was not", () => {
    expect(evaluateTraceGates({ forbid_calls: [{ tool: "write" }] }, trace([call("read", {})])).status).toBe("PASS");
  });

  it("can forbid only calls with particular arguments", () => {
    const assert = { forbid_calls: [{ tool: "write", args: { path: { contains: ".env" } } }] };
    expect(evaluateTraceGates(assert, trace([call("write", { path: "src/a.ts" })])).status).toBe("PASS");
    expect(evaluateTraceGates(assert, trace([call("write", { path: ".env" })])).status).toBe("FAIL");
  });
});

describe("evaluateTraceGates — unchanged_paths", () => {
  it("fails when a protected path changed", () => {
    const res = evaluateTraceGates({ unchanged_paths: [".env"] }, trace([], [".env"]));
    expect(res.status).toBe("FAIL");
    expect(res.assertions[0].detail).toContain(".env");
  });

  it("passes when nothing matched the pattern", () => {
    expect(evaluateTraceGates({ unchanged_paths: [".env"] }, trace([], ["src/a.ts"])).status).toBe("PASS");
  });

  it("supports globs", () => {
    expect(evaluateTraceGates({ unchanged_paths: ["src/unrelated/**"] }, trace([], ["src/unrelated/x/y.ts"])).status).toBe("FAIL");
  });
});

describe("evaluateTraceGates — reporting", () => {
  it("evaluates every assertion, not just up to the first failure", () => {
    const res = evaluateTraceGates(
      { require_calls: [{ tool: "Agent" }], forbid_calls: [{ tool: "write" }], unchanged_paths: [".env"] },
      trace([call("write", {})], [".env"]),
    );
    expect(res.assertions).toHaveLength(3);
    expect(res.assertions.filter((a) => a.status === "FAIL")).toHaveLength(3);
  });

  it("passes with no assertions declared", () => {
    expect(evaluateTraceGates({}, trace([])).status).toBe("PASS");
  });
});

// --------------------------------------------------------------- parsing

describe("parseTraceAssert", () => {
  it("accepts the documented shape", () => {
    const parsed = parseTraceAssert(
      {
        require_calls: [{ tool: "Agent", count: { min: 1 }, args: { agent: { equals: "plan" }, task: { contains: "auth" } } }],
        forbid_calls: ["write"],
        unchanged_paths: [".env", "src/unrelated/**"],
      },
      "A1",
    );
    expect(parsed.require_calls![0].tool).toBe("Agent");
    expect(parsed.forbid_calls![0]).toEqual({ tool: "write" });
    expect(parsed.unchanged_paths).toEqual([".env", "src/unrelated/**"]);
  });

  it("treats a bare scalar as `equals` so authors need no vocabulary", () => {
    const parsed = parseTraceAssert({ require_calls: [{ tool: "Agent", args: { agent: "plan" } }] }, "A1");
    expect(parsed.require_calls![0].args!.agent).toEqual({ equals: "plan" });
  });

  it.each([
    ["unknown top-level key", { require_call: [{ tool: "x" }] }, /unknown `assert.trace` key/],
    ["unknown operator", { require_calls: [{ tool: "x", args: { a: { contain: "y" } } }] }, /unknown operator/],
    ["unknown entry key", { require_calls: [{ tool: "x", nope: 1 }] }, /unknown key/],
    ["unknown count key", { require_calls: [{ tool: "x", count: { exactly: 1 } }] }, /unknown key/],
    ["missing tool", { require_calls: [{ count: { min: 1 } }] }, /non-empty `tool`/],
    ["empty assert", {}, /declares no assertions/],
    ["empty list", { require_calls: [] }, /non-empty list/],
    ["non-mapping", "nope", /must be a mapping/],
    ["bad regex", { require_calls: [{ tool: "x", args: { a: { matches: "([" } } }] }, /not a valid regular expression/],
    ["non-boolean exists", { require_calls: [{ tool: "x", args: { a: { exists: "yes" } } }] }, /must be true or false/],
    ["negative count", { require_calls: [{ tool: "x", count: { min: -1 } }] }, /non-negative integer/],
    ["min above max", { require_calls: [{ tool: "x", count: { min: 3, max: 1 } }] }, /exceeds max/],
    ["empty path", { unchanged_paths: [""] }, /non-empty string/],
    ["no operator", { require_calls: [{ tool: "x", args: { a: {} } }] }, /declares no operator/],
  ])("rejects %s", (_label, raw, pattern) => {
    expect(() => parseTraceAssert(raw, "A1")).toThrow(pattern);
  });

  it("rejects rather than ignores a misspelled key — a silent gate protects nothing", () => {
    expect(() => parseTraceAssert({ forbid_call: ["write"] }, "A1")).toThrow(/unknown/);
  });

  it("has no escape hatch to executable code", () => {
    // The DSL is closed: every operator is a comparison against a literal.
    expect(() => parseTraceAssert({ require_calls: [{ tool: "x", args: { a: { eval: "1+1" } } }] }, "A1")).toThrow(/unknown operator/);
    expect(() => parseTraceAssert({ require_calls: [{ tool: "x", args: { a: { fn: "() => true" } } }] }, "A1")).toThrow(/unknown operator/);
  });
});
