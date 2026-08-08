import type { ExecutionTraceV1, TraceToolCall } from "./capture-trace-types.js";

/**
 * The objective gate layer: assertions evaluated against a saved execution
 * trace, before any judge is asked anything.
 *
 * The DSL is deliberately tiny and entirely declarative — no expressions, no
 * callbacks, no executable predicates. A spec is data that arrives from a
 * repository; giving it a code path would make "add a test" and "run arbitrary
 * code in CI" the same act. Everything here is a comparison between a value the
 * trace recorded and a literal the spec wrote down.
 *
 * What these assertions can and cannot prove is a hard boundary, restated here
 * because it is easy to over-claim: a trace proves **a registered tool was
 * called with given arguments**. It proves nothing about what that tool then did
 * to the machine. A `bash` command string is not a filesystem audit.
 */

// ---------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------

export interface ArgPredicate {
  equals?: unknown;
  contains?: string;
  starts_with?: string;
  ends_with?: string;
  matches?: string;
  exists?: boolean;
  /** For array-valued arguments: at least one element satisfies the inner predicate. */
  any?: ArgPredicate;
}

export const PREDICATE_KEYS = ["equals", "contains", "starts_with", "ends_with", "matches", "exists", "any"] as const;

export interface CountConstraint {
  min?: number;
  max?: number;
}

export interface RequireCall {
  tool: string;
  count?: CountConstraint;
  args?: Record<string, ArgPredicate>;
}

export interface ForbidCall {
  tool: string;
  /** When present, only calls whose arguments match are forbidden. */
  args?: Record<string, ArgPredicate>;
}

/**
 * Convenience syntax for the orchestration case: "the parent delegated to
 * `plan`, and the handoff carried X but not Y".
 *
 * Sugar over `require_calls`, not a second mechanism — it normalizes the known
 * subagent argument shapes and then evaluates through the same path. There is
 * deliberately no universal subagent extension assumed: an unknown extension can
 * still be asserted on with plain `require_calls`, which is why this stays
 * optional sugar rather than the only way in.
 */
export interface RequireSubagent {
  /** The registered tool name — declared by the spec, since pi has no standard one. */
  tool: string;
  /** Which subagent the parent should have selected. */
  agent: string;
  count?: CountConstraint;
  /** Substrings the handoff MUST carry. */
  task_contains?: string[];
  /** Substrings the handoff must NOT carry — the leak check. */
  task_excludes?: string[];
}

export interface TraceAssert {
  require_calls?: RequireCall[];
  require_subagents?: RequireSubagent[];
  forbid_calls?: ForbidCall[];
  unchanged_paths?: string[];
}

/**
 * Subagent invocations extracted from one tool call.
 *
 * A single call can carry several: `{tasks: [...]}` fans out and `{chain: [...]}`
 * sequences. Normalizing to a flat list means a `count` constraint means the same
 * thing — how many subagent invocations happened — whichever shape the extension
 * uses to express them.
 */
export interface SubagentInvocation {
  agent: string;
  task: string;
}

/**
 * Recognize the known subagent argument shapes.
 *
 * Three are supported because three exist in the wild; anything else yields an
 * empty list, and the scenario should use plain `require_calls` instead. It
 * deliberately does NOT guess: inventing an `agent` from an unrecognized shape
 * would produce a confident assertion about a field nobody wrote.
 */
export function normalizeSubagentCall(args: Record<string, unknown>): SubagentInvocation[] {
  const one = (v: unknown): SubagentInvocation | null => {
    if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
    const o = v as Record<string, unknown>;
    const agent = typeof o.agent === "string" ? o.agent : typeof o.name === "string" ? o.name : undefined;
    if (agent === undefined) return null;
    const task = typeof o.task === "string" ? o.task : typeof o.prompt === "string" ? o.prompt : "";
    return { agent, task };
  };

  // Parallel: { tasks: [ {agent, task}, … ] }
  if (Array.isArray(args.tasks)) return args.tasks.map(one).filter((x): x is SubagentInvocation => x !== null);
  // Chain: { chain: [ {agent, task}, … ] }
  if (Array.isArray(args.chain)) return args.chain.map(one).filter((x): x is SubagentInvocation => x !== null);
  // Single: { agent, task }
  const single = one(args);
  return single ? [single] : [];
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/**
 * ERROR is a third outcome, not a shade of FAIL: it means the assertion could
 * not be evaluated because the evidence is absent. The two call for different
 * fixes — a FAIL means change the skill, an ERROR means the harness could not
 * look — and only one of them is a finding about the model.
 */
export type AssertionStatus = "PASS" | "FAIL" | "ERROR";

export interface AssertionResult {
  kind: "require_call" | "require_subagent" | "forbid_call" | "unchanged_path";
  status: AssertionStatus;
  detail: string;
}

export interface TraceGateResult {
  status: AssertionStatus;
  assertions: AssertionResult[];
}

/**
 * Evaluate every assertion. All of them run even after the first failure — a
 * scorecard that reports one problem per run makes the author re-run to find the
 * second, and re-running is the expensive thing this whole layer exists to avoid.
 *
 * (One deliberate exception, marked inline in the `require_subagents` loop: the
 * three sub-questions there are reported separately, and a later one is skipped
 * when an earlier one already established there is nothing to ask it about.)
 */
export function evaluateTraceGates(assert: TraceAssert, trace: ExecutionTraceV1): TraceGateResult {
  const assertions: AssertionResult[] = [];

  for (const req of assert.require_calls ?? []) {
    const matched = trace.tool_calls.filter((c) => c.name === req.tool && argsMatch(c, req.args));
    const min = req.count?.min ?? 1;
    const max = req.count?.max;
    const described = describeArgs(req.args);

    if (matched.length < min) {
      assertions.push({
        kind: "require_call",
        status: "FAIL",
        detail: `expected at least ${min} call(s) to \`${req.tool}\`${described}, saw ${matched.length}${nearMiss(trace, req)}`,
      });
    } else if (max !== undefined && matched.length > max) {
      assertions.push({
        kind: "require_call",
        status: "FAIL",
        detail: `expected at most ${max} call(s) to \`${req.tool}\`${described}, saw ${matched.length}`,
      });
    } else {
      assertions.push({
        kind: "require_call",
        status: "PASS",
        detail: `\`${req.tool}\`${described} called ${matched.length} time(s)`,
      });
    }
  }

  for (const req of assert.require_subagents ?? []) {
    // Three independent questions, reported separately, because they send the
    // author to three different places: selection (did it delegate at all, and to
    // the right agent), handoff-completeness (did the task carry what the child
    // needs), and handoff-leakage (did it carry something it must not).
    const invocations = trace.tool_calls
      .filter((c) => c.name === req.tool)
      .flatMap((c) => normalizeSubagentCall(c.args));
    const matched = invocations.filter((i) => i.agent === req.agent);
    const min = req.count?.min ?? 1;
    const max = req.count?.max;

    if (matched.length < min || (max !== undefined && matched.length > max)) {
      const bound = matched.length < min ? `at least ${min}` : `at most ${max}`;
      const seen = invocations.length === 0
        ? `no \`${req.tool}\` invocation was recorded`
        : `saw agents: ${[...new Set(invocations.map((i) => i.agent))].join(", ")}`;
      assertions.push({
        kind: "require_subagent",
        status: "FAIL",
        detail: `expected ${bound} delegation(s) to \`${req.agent}\` via \`${req.tool}\`, saw ${matched.length} (${seen})`,
      });
      // Handoff assertions are meaningless with nothing to inspect, and reporting
      // them as failures too would triple one root cause.
      continue;
    }
    assertions.push({
      kind: "require_subagent",
      status: "PASS",
      detail: `delegated to \`${req.agent}\` ${matched.length} time(s) via \`${req.tool}\``,
    });

    for (const needle of req.task_contains ?? []) {
      const ok = matched.some((i) => i.task.includes(needle));
      assertions.push({
        kind: "require_subagent",
        status: ok ? "PASS" : "FAIL",
        detail: ok
          ? `handoff to \`${req.agent}\` carried ${JSON.stringify(needle)}`
          : `handoff to \`${req.agent}\` omitted required context ${JSON.stringify(needle)}`,
      });
    }
    for (const needle of req.task_excludes ?? []) {
      const leaked = matched.filter((i) => i.task.includes(needle));
      // Same asymmetry as `forbid_calls`: a leak check that ran over a truncated
      // or redacted task has not established that nothing leaked.
      const lost = leaked.length === 0 && matched.some((i) => valueWasLost(i.task));
      assertions.push({
        kind: "require_subagent",
        status: lost ? "ERROR" : leaked.length === 0 ? "PASS" : "FAIL",
        detail: lost
          ? `leak check on the handoff to \`${req.agent}\` could not be run — the task text was redacted or truncated before the trace was written`
          : leaked.length === 0
            ? `handoff to \`${req.agent}\` did not carry ${JSON.stringify(needle)}`
            : `handoff to \`${req.agent}\` leaked forbidden content ${JSON.stringify(needle)}`,
      });
    }
  }

  for (const forbid of assert.forbid_calls ?? []) {
    const hits = trace.tool_calls.filter((c) => c.name === forbid.tool && argsMatch(c, forbid.args));
    // A "not called" verdict is only trustworthy if the arguments it searched
    // were intact. Where redaction destroyed one, the honest answer is that the
    // assertion could not be checked.
    const lost = [...new Set(
      trace.tool_calls.filter((c) => c.name === forbid.tool).flatMap((c) => lostArgs(c, forbid.args)),
    )];
    if (hits.length === 0 && lost.length > 0) {
      assertions.push({
        kind: "forbid_call",
        status: "ERROR",
        detail: `\`${forbid.tool}\`${describeArgs(forbid.args)} could not be checked — ${lost.map((k) => `\`${k}\``).join(", ")} was redacted or truncated before the trace was written`,
      });
      continue;
    }
    assertions.push(
      hits.length === 0
        ? { kind: "forbid_call", status: "PASS", detail: `\`${forbid.tool}\`${describeArgs(forbid.args)} not called` }
        : {
            kind: "forbid_call",
            status: "FAIL",
            detail: `\`${forbid.tool}\`${describeArgs(forbid.args)} called ${hits.length} time(s) — forbidden`,
          },
    );
  }

  for (const pattern of assert.unchanged_paths ?? []) {
    // `null` is "we never looked", and it must not be graded. The whole tri-state
    // exists so this branch can be written: an unobserved workspace produces
    // ERROR, which blocks the ship, rather than the vacuous PASS an empty list
    // used to produce.
    if (trace.changed_paths === null) {
      assertions.push({
        kind: "unchanged_path",
        status: "ERROR",
        detail: `\`${pattern}\` could not be checked — the workspace was never observed`,
      });
      continue;
    }
    const changed = trace.changed_paths.filter((p) => matchesGlob(pattern, p));
    assertions.push(
      changed.length === 0
        ? { kind: "unchanged_path", status: "PASS", detail: `\`${pattern}\` unchanged` }
        : { kind: "unchanged_path", status: "FAIL", detail: `\`${pattern}\` changed: ${changed.join(", ")}` },
    );
  }

  return {
    // ERROR outranks FAIL: "the evidence is missing" must never be reported as
    // "the assertion held", and it must not be softened into a plain failure
    // either — the two call for different fixes.
    status: assertions.some((a) => a.status === "ERROR")
      ? "ERROR"
      : assertions.some((a) => a.status === "FAIL")
        ? "FAIL"
        : "PASS",
    assertions,
  };
}

/**
 * When a required call is missing, say whether the tool was called at all.
 *
 * "expected Agent(agent=plan), saw 0" and "…, saw 0 (Agent called 1x with
 * different arguments)" send the author to completely different places.
 */
function nearMiss(trace: ExecutionTraceV1, req: RequireCall): string {
  if (!req.args) return "";
  const byName = trace.tool_calls.filter((c) => c.name === req.tool);
  if (byName.length === 0) return ` (\`${req.tool}\` was never called)`;
  return ` (\`${req.tool}\` called ${byName.length}x, but with different arguments)`;
}

function describeArgs(args?: Record<string, ArgPredicate>): string {
  if (!args || Object.keys(args).length === 0) return "";
  const parts = Object.entries(args).map(([k, p]) => {
    const [op] = PREDICATE_KEYS.filter((key) => p[key] !== undefined);
    return op ? `${k} ${op} ${JSON.stringify(p[op])}` : k;
  });
  return ` (${parts.join(", ")})`;
}

function argsMatch(call: TraceToolCall, args?: Record<string, ArgPredicate>): boolean {
  if (!args) return true;
  return Object.entries(args).every(([key, predicate]) => testPredicate(call.args[key], predicate));
}

/**
 * Apply one predicate to one value.
 *
 * Multiple operators on the same field are ANDed. An unknown operator can never
 * reach here — `parseTraceAssert` rejects it at load time, so a typo'd operator
 * is a spec error rather than an assertion that silently passes.
 */
/**
 * Did redaction destroy the value this predicate needs to read?
 *
 * Trace arguments are redacted, truncated and depth-bounded before they are
 * persisted — necessary, since they reach disk. But the gate then evaluates
 * predicates against that lossy projection, and the two failure directions are
 * not symmetric:
 *
 * - `require_calls` degrades SAFELY: a needle that redaction removed simply is
 *   not found, and the assertion FAILS. Over-strict, never over-permissive.
 * - `forbid_calls` and `task_excludes` degrade DANGEROUSLY: the predicate cannot
 *   match, so the forbidden thing is reported as absent. `forbid_calls` on
 *   `{ authorization: { contains: "Bearer" } }` could never fire, because the
 *   value is always `[redacted]` by the time the gate sees it.
 *
 * So the negative assertions ask this first, and report ERROR — "could not be
 * checked" — instead of a PASS they have not earned.
 */
function valueWasLost(value: unknown): boolean {
  if (typeof value === "string") {
    return value === "[redacted]" || value === "[nested]" || value.includes("… [truncated ");
  }
  if (Array.isArray(value)) return value.some(valueWasLost);
  if (value && typeof value === "object") return Object.values(value).some(valueWasLost);
  return false;
}

/** The arg names a predicate set reads whose values redaction has destroyed. */
function lostArgs(call: TraceToolCall, args: Record<string, ArgPredicate> | undefined): string[] {
  if (!args) return [];
  return Object.keys(args).filter((key) => valueWasLost(call.args[key]));
}

export function testPredicate(value: unknown, p: ArgPredicate): boolean {
  if (p.exists !== undefined) {
    if (p.exists !== (value !== undefined && value !== null)) return false;
    // `exists: false` is satisfied and nothing else can be tested on an absent value.
    if (p.exists === false) return true;
  }
  if (p.equals !== undefined && !deepEqual(value, p.equals)) return false;
  if (p.contains !== undefined && !asString(value).includes(p.contains)) return false;
  if (p.starts_with !== undefined && !asString(value).startsWith(p.starts_with)) return false;
  if (p.ends_with !== undefined && !asString(value).endsWith(p.ends_with)) return false;
  if (p.matches !== undefined) {
    let re: RegExp;
    try {
      re = new RegExp(p.matches);
    } catch {
      return false; // unreachable via parseTraceAssert, which compiles it first
    }
    if (!re.test(asString(value))) return false;
  }
  if (p.any !== undefined) {
    if (!Array.isArray(value)) return false;
    if (!value.some((v) => testPredicate(v, p.any!))) return false;
  }
  return true;
}

/** Stringify for text operators without inventing a match on an absent value. */
function asString(v: unknown): string {
  if (typeof v === "string") return v;
  if (v === undefined || v === null) return "";
  return JSON.stringify(v) ?? "";
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (typeof a !== "object") return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Minimal glob over workspace-relative paths: `**` any depth, `*` one segment.
 *
 * Paths are normalized to forward slashes and stripped of a leading `./` first,
 * so `./src/a.ts` and `src/a.ts` are the same path — otherwise an assertion
 * would pass or fail on how the runner happened to spell it.
 */
export function matchesGlob(pattern: string, path: string): boolean {
  const p = normalizePath(path);
  const pat = normalizePath(pattern);
  if (pat === p) return true;

  const escaped = pat
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, " SLASHSTAR ")
    .replace(/\*\*/g, " GLOBSTAR ")
    .replace(/\*/g, "[^/]*")
    .replace(/ SLASHSTAR /g, "(?:.*/)?")
    .replace(/ GLOBSTAR /g, ".*");
  return new RegExp(`^${escaped}$`).test(p);
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}

// ---------------------------------------------------------------------------
// Parsing / validation
// ---------------------------------------------------------------------------

/**
 * Validate an `assert.trace` block from a spec.
 *
 * Strict on purpose: an unknown key is an error, not something ignored. A
 * silently-ignored `forbid_call` (singular, say) would read in review as a gate
 * that is protecting something while asserting nothing at all — the worst
 * possible failure for a safety check.
 */
export function parseTraceAssert(raw: unknown, ctx: string): TraceAssert {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${ctx}: \`assert.trace\` must be a mapping`);
  }
  const obj = raw as Record<string, unknown>;
  const allowed = new Set(["require_calls", "require_subagents", "forbid_calls", "unchanged_paths"]);
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      throw new Error(`${ctx}: unknown \`assert.trace\` key \`${key}\` (allowed: ${[...allowed].join(", ")})`);
    }
  }

  const out: TraceAssert = {};

  if (obj.require_calls !== undefined) {
    out.require_calls = asArray(obj.require_calls, `${ctx}: \`require_calls\``).map((item, i) => {
      const entry = asObject(item, `${ctx}: \`require_calls[${i}]\``);
      const tool = requireToolName(entry.tool, `${ctx}: \`require_calls[${i}]\``);
      const req: RequireCall = { tool };
      if (entry.count !== undefined) req.count = parseCount(entry.count, `${ctx}: \`require_calls[${i}].count\``);
      if (entry.args !== undefined) req.args = parseArgs(entry.args, `${ctx}: \`require_calls[${i}].args\``);
      for (const key of Object.keys(entry)) {
        if (!["tool", "count", "args"].includes(key)) {
          throw new Error(`${ctx}: unknown key \`${key}\` in \`require_calls[${i}]\``);
        }
      }
      return req;
    });
  }

  if (obj.require_subagents !== undefined) {
    out.require_subagents = asArray(obj.require_subagents, `${ctx}: \`require_subagents\``).map((item, i) => {
      const where = `${ctx}: \`require_subagents[${i}]\``;
      const entry = asObject(item, where);
      for (const key of Object.keys(entry)) {
        if (!["tool", "agent", "count", "task_contains", "task_excludes"].includes(key)) {
          throw new Error(`${ctx}: unknown key \`${key}\` in \`require_subagents[${i}]\``);
        }
      }
      const sub: RequireSubagent = {
        tool: requireToolName(entry.tool, where),
        agent: requireNonEmpty(entry.agent, `${where}: \`agent\``),
      };
      if (entry.count !== undefined) sub.count = parseCount(entry.count, `${where}.count`);
      if (entry.task_contains !== undefined) sub.task_contains = parseNeedles(entry.task_contains, `${where}.task_contains`);
      if (entry.task_excludes !== undefined) sub.task_excludes = parseNeedles(entry.task_excludes, `${where}.task_excludes`);
      return sub;
    });
  }

  if (obj.forbid_calls !== undefined) {
    out.forbid_calls = asArray(obj.forbid_calls, `${ctx}: \`forbid_calls\``).map((item, i) => {
      // A bare string is the common case — `forbid_calls: [write]`.
      if (typeof item === "string") return { tool: item };
      const entry = asObject(item, `${ctx}: \`forbid_calls[${i}]\``);
      const forbid: ForbidCall = { tool: requireToolName(entry.tool, `${ctx}: \`forbid_calls[${i}]\``) };
      if (entry.args !== undefined) forbid.args = parseArgs(entry.args, `${ctx}: \`forbid_calls[${i}].args\``);
      for (const key of Object.keys(entry)) {
        if (!["tool", "args"].includes(key)) {
          throw new Error(`${ctx}: unknown key \`${key}\` in \`forbid_calls[${i}]\``);
        }
      }
      return forbid;
    });
  }

  if (obj.unchanged_paths !== undefined) {
    const paths = asArray(obj.unchanged_paths, `${ctx}: \`unchanged_paths\``);
    out.unchanged_paths = paths.map((p, i) => {
      if (typeof p !== "string" || p.trim() === "") {
        throw new Error(`${ctx}: \`unchanged_paths[${i}]\` must be a non-empty string`);
      }
      return p;
    });
  }

  if (!out.require_calls && !out.require_subagents && !out.forbid_calls && !out.unchanged_paths) {
    throw new Error(`${ctx}: \`assert.trace\` declares no assertions — remove it or add one`);
  }
  return out;
}

function requireNonEmpty(v: unknown, ctx: string): string {
  if (typeof v !== "string" || v.trim() === "") throw new Error(`${ctx} must be a non-empty string`);
  return v;
}

/** Needles must be non-empty: an empty one matches everything, so the check could never fail. */
function parseNeedles(raw: unknown, ctx: string): string[] {
  return asArray(raw, ctx).map((n, i) => {
    if (typeof n !== "string" || n === "") throw new Error(`${ctx}[${i}] must be a non-empty string`);
    return n;
  });
}

function requireToolName(v: unknown, ctx: string): string {
  if (typeof v !== "string" || v.trim() === "") throw new Error(`${ctx}: needs a non-empty \`tool\` name`);
  return v;
}

function asArray(v: unknown, ctx: string): unknown[] {
  if (!Array.isArray(v) || v.length === 0) throw new Error(`${ctx} must be a non-empty list`);
  return v;
}

function asObject(v: unknown, ctx: string): Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) throw new Error(`${ctx} must be a mapping`);
  return v as Record<string, unknown>;
}

function parseCount(raw: unknown, ctx: string): CountConstraint {
  const obj = asObject(raw, ctx);
  const out: CountConstraint = {};
  for (const key of Object.keys(obj)) {
    if (key !== "min" && key !== "max") throw new Error(`${ctx}: unknown key \`${key}\` (allowed: min, max)`);
  }
  for (const key of ["min", "max"] as const) {
    if (obj[key] === undefined) continue;
    const n = obj[key];
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0) {
      throw new Error(`${ctx}: \`${key}\` must be a non-negative integer`);
    }
    out[key] = n;
  }
  if (out.min !== undefined && out.max !== undefined && out.min > out.max) {
    throw new Error(`${ctx}: min (${out.min}) exceeds max (${out.max}) — nothing can satisfy it`);
  }
  return out;
}

function parseArgs(raw: unknown, ctx: string): Record<string, ArgPredicate> {
  const obj = asObject(raw, ctx);
  const out: Record<string, ArgPredicate> = {};
  for (const [key, value] of Object.entries(obj)) {
    out[key] = parsePredicate(value, `${ctx}.${key}`);
  }
  return out;
}

function parsePredicate(raw: unknown, ctx: string): ArgPredicate {
  // `agent: plan` is shorthand for `agent: { equals: plan }` — the common case
  // should not require the author to know the operator vocabulary.
  if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
    return { equals: raw };
  }
  const obj = asObject(raw, ctx);
  const out: ArgPredicate = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!(PREDICATE_KEYS as readonly string[]).includes(key)) {
      throw new Error(`${ctx}: unknown operator \`${key}\` (allowed: ${PREDICATE_KEYS.join(", ")})`);
    }
    if (key === "matches") {
      if (typeof value !== "string") throw new Error(`${ctx}: \`matches\` must be a string pattern`);
      try {
        new RegExp(value);
      } catch (e) {
        throw new Error(`${ctx}: \`matches\` is not a valid regular expression: ${e instanceof Error ? e.message : e}`);
      }
      out.matches = value;
      continue;
    }
    if (key === "exists") {
      if (typeof value !== "boolean") throw new Error(`${ctx}: \`exists\` must be true or false`);
      out.exists = value;
      continue;
    }
    if (key === "any") {
      out.any = parsePredicate(value, `${ctx}.any`);
      continue;
    }
    if (key === "equals") {
      out.equals = value;
      continue;
    }
    // contains / starts_with / ends_with
    if (typeof value !== "string") throw new Error(`${ctx}: \`${key}\` must be a string`);
    out[key as "contains" | "starts_with" | "ends_with"] = value;
  }
  if (Object.keys(out).length === 0) throw new Error(`${ctx}: predicate declares no operator`);
  return out;
}
