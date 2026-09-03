import { createHash } from "node:crypto";
import { parsePredicate, testPredicate, type ArgPredicate, type CountConstraint } from "./trace-gates.js";

/** Adapter-neutral event contract used by objective trajectory assertions. */
export const LEGACY_TRAJECTORY_EVENT_VERSION = "1.0" as const;
export const TRAJECTORY_EVENT_VERSION = "1.1" as const;
export type TrajectoryEventVersion = typeof LEGACY_TRAJECTORY_EVENT_VERSION | typeof TRAJECTORY_EVENT_VERSION;
export const TRAJECTORY_ASSERT_VERSION = "1.0" as const;

export interface TrajectoryApproval {
  id?: string;
  capability?: string;
  subject?: string;
  source?: string;
  scope?: string;
  approved_at?: string;
  expires_at?: string;
  used_at?: string;
}

export interface TrajectoryDigests {
  plan?: string;
  task?: string;
  definition?: string;
  head?: string;
  tree?: string;
  [key: string]: string | undefined;
}

/**
 * One normalized workflow event. Native field names remain available in
 * `attributes`; common correlation fields are promoted so the evaluator never
 * needs to know whether the source was pi, pi-daddy, or principal assurance.
 */
export interface TrajectoryEventV1 {
  event_version: TrajectoryEventVersion;
  seq: number;
  type: string;
  source: string;
  at?: string;
  run_id?: string;
  task_id?: string;
  workspace_id?: string;
  context_id?: string;
  finding_id?: string;
  parent_id?: string;
  child_id?: string;
  /** Unique pi-daddy v3 execution occurrence; never synthesized for v2/0.17. */
  execution_id?: string;
  /** Explicit v3 execution parent. Null is a meaningful root identity. */
  parent_execution_id?: string | null;
  /** Unique v3 occurrence whose output composed this task. */
  task_from_execution_id?: string;
  /** Identity of a pi-daddy v3 workflow_fact occurrence. */
  workflow_fact_id?: string;
  /** Immutable v3 nonterminal lifecycle deadline. */
  deadline_at?: string;
  phase?: string;
  tool?: string;
  capability?: string;
  requested_capabilities?: string[];
  effective_capabilities?: string[];
  refusal_code?: string;
  exit_code?: number;
  digests?: TrajectoryDigests;
  approval?: TrajectoryApproval;
  requirements?: string[];
  attributes?: Record<string, unknown>;
}

export interface EventSelector {
  event: string;
  where?: Record<string, ArgPredicate>;
  select?: "first" | "last" | "all";
}

export interface RequiredEvent extends EventSelector {
  count?: CountConstraint;
}

export interface CorrelationAssert {
  left: EventSelector;
  right: EventSelector;
  same?: string[];
  different?: string[];
  order?: "before" | "after";
}

export interface FreshnessAssert {
  subject: EventSelector;
  after: EventSelector[];
  same?: string[];
}

export interface UniqueAssert {
  events: EventSelector;
  fields: string[];
}

export interface ForbidAfterAssert {
  anchor: EventSelector;
  forbidden: EventSelector[];
  same?: string[];
  anchor_optional?: boolean;
}

export interface ApprovalAssert {
  grant: EventSelector;
  use: EventSelector;
  same?: string[];
  scopes?: string[];
  sources?: string[];
  unexpired?: boolean;
  max_uses?: number;
}

export interface CoverageAssert {
  requirements: string[];
  events?: EventSelector;
}

export interface TrajectoryAssert {
  version: typeof TRAJECTORY_ASSERT_VERSION;
  require?: RequiredEvent[];
  forbid?: EventSelector[];
  ordered?: EventSelector[][];
  correlate?: CorrelationAssert[];
  freshness?: FreshnessAssert[];
  unique?: UniqueAssert[];
  forbid_after?: ForbidAfterAssert[];
  approvals?: ApprovalAssert[];
  coverage?: CoverageAssert[];
}

export type TrajectoryAssertionStatus = "PASS" | "FAIL" | "ERROR";
export interface TrajectoryAssertionResult {
  kind: "require_event" | "forbid_event" | "ordered_events" | "correlation" | "freshness" | "unique" | "forbid_after" | "approval" | "coverage" | "evidence";
  status: TrajectoryAssertionStatus;
  detail: string;
}
export interface TrajectoryGateResult {
  status: TrajectoryAssertionStatus;
  event_version: typeof TRAJECTORY_EVENT_VERSION;
  events_sha256: string;
  assertions: TrajectoryAssertionResult[];
}

export function trajectoryEventsSha256(events: TrajectoryEventV1[]): string {
  return createHash("sha256").update(stableStringify(events)).digest("hex");
}

export function serializeTrajectoryEvents(events: TrajectoryEventV1[]): string {
  return events.map((event) => JSON.stringify(event)).join("\n") + (events.length ? "\n" : "");
}

export function deserializeTrajectoryEvents(text: string): TrajectoryEventV1[] | null {
  const out: TrajectoryEventV1[] = [];
  try {
    for (const line of text.split("\n").filter((entry) => entry.trim())) {
      const event = JSON.parse(line) as TrajectoryEventV1;
      if (validateEvent(event) !== null) return null;
      out.push(event);
    }
  } catch {
    return null;
  }
  if (!out.length) return null;
  const sequences = out.map((event) => event.seq).sort((a, b) => a - b);
  if (new Set(sequences).size !== out.length || sequences.some((seq, index) => seq !== index + 1)) return null;
  return out;
}

/** Evaluate a closed, declarative assertion set over saved normalized events. */
export function evaluateTrajectoryGates(assert: TrajectoryAssert, input: TrajectoryEventV1[]): TrajectoryGateResult {
  const assertions: TrajectoryAssertionResult[] = [];
  const events = [...input].sort((a, b) => a.seq - b.seq);
  const invalid = input.map((event) => ({ event, problem: validateEvent(event) })).find((entry) => entry.problem !== null);
  const sequences = [...input.map((event) => event.seq)].sort((a, b) => a - b);
  const duplicateSeq = new Set(sequences).size !== input.length;
  const nonContiguous = sequences.some((seq, index) => seq !== index + 1);
  if (invalid || duplicateSeq || nonContiguous) {
    assertions.push({
      kind: "evidence",
      status: "ERROR",
      detail: invalid
        ? `normalized event evidence is invalid at sequence ${String(invalid.event.seq)}: ${invalid.problem}`
        : duplicateSeq
          ? "normalized event evidence has duplicate sequence numbers"
          : "normalized event evidence sequence must be contiguous from 1",
    });
  }

  for (const required of assert.require ?? []) {
    const hits = matching(events, required);
    const min = required.count?.min ?? 1;
    const max = required.count?.max;
    const ok = hits.length >= min && (max === undefined || hits.length <= max);
    assertions.push({
      kind: "require_event",
      status: ok ? "PASS" : "FAIL",
      detail: ok
        ? `required event \`${required.event}\` occurred ${hits.length} time(s)`
        : `required event \`${required.event}\` expected ${bounds(min, max)}, saw ${hits.length}`,
    });
  }

  for (const forbidden of assert.forbid ?? []) {
    const hits = matching(events, forbidden);
    assertions.push({
      kind: "forbid_event",
      status: hits.length ? "FAIL" : "PASS",
      detail: hits.length
        ? `forbidden event \`${forbidden.event}\` occurred at sequence(s) ${hits.map((event) => event.seq).join(", ")}`
        : `forbidden event \`${forbidden.event}\` did not occur`,
    });
  }

  for (const chain of assert.ordered ?? []) {
    let cursor = -Infinity;
    const found: TrajectoryEventV1[] = [];
    for (const selector of chain) {
      const next = matching(events, selector).find((event) => event.seq > cursor);
      if (!next) break;
      found.push(next);
      cursor = next.seq;
    }
    const ok = found.length === chain.length;
    assertions.push({
      kind: "ordered_events",
      status: ok ? "PASS" : "FAIL",
      detail: ok
        ? `ordered events occurred at sequences ${found.map((event) => event.seq).join(" < ")}`
        : `ordered trajectory broke at \`${chain[found.length]?.event ?? "unknown"}\` after sequence ${cursor === -Infinity ? "start" : cursor}`,
    });
  }

  for (const correlation of assert.correlate ?? []) {
    const left = selected(events, correlation.left);
    const right = selected(events, correlation.right);
    if (!left.length || !right.length) {
      assertions.push({ kind: "correlation", status: "FAIL", detail: `correlation needs \`${correlation.left.event}\` and \`${correlation.right.event}\`` });
      continue;
    }
    for (const l of left) for (const r of right) {
      const checked = compareFields(l, r, correlation.same ?? [], correlation.different ?? []);
      if (checked.error) {
        assertions.push({ kind: "correlation", status: "ERROR", detail: checked.error });
        continue;
      }
      const ordered = correlation.order === undefined || (correlation.order === "before" ? l.seq < r.seq : l.seq > r.seq);
      assertions.push({
        kind: "correlation",
        status: checked.ok && ordered ? "PASS" : "FAIL",
        detail: checked.ok && ordered
          ? `\`${correlation.left.event}\` and \`${correlation.right.event}\` satisfy identity/order correlation`
          : `\`${correlation.left.event}\` and \`${correlation.right.event}\` violate ${!checked.ok ? "identity" : `${correlation.order} ordering`} correlation`,
      });
    }
  }

  for (const freshness of assert.freshness ?? []) {
    const subjects = selected(events, freshness.subject);
    if (!subjects.length) {
      assertions.push({ kind: "freshness", status: "FAIL", detail: `freshness subject \`${freshness.subject.event}\` is missing` });
      continue;
    }
    for (const subject of subjects) {
      let floor = -Infinity;
      let failure: string | null = null;
      let error: string | null = null;
      for (const selector of freshness.after) {
        const candidates = matching(events, selector);
        const correlated: TrajectoryEventV1[] = [];
        for (const candidate of candidates) {
          const checked = compareFields(subject, candidate, freshness.same ?? [], []);
          if (checked.error) error ??= checked.error;
          else if (checked.ok) correlated.push(candidate);
        }
        const anchor = correlated.at(-1);
        if (!anchor) failure = `freshness anchor \`${selector.event}\` is missing for the correlated identity`;
        else floor = Math.max(floor, anchor.seq);
      }
      assertions.push(error
        ? { kind: "freshness", status: "ERROR", detail: error }
        : failure
          ? { kind: "freshness", status: "FAIL", detail: failure }
          : subject.seq > floor
            ? { kind: "freshness", status: "PASS", detail: `\`${freshness.subject.event}\` at ${subject.seq} is newer than freshness floor ${floor}` }
            : { kind: "freshness", status: "FAIL", detail: `\`${freshness.subject.event}\` at ${subject.seq} is stale; freshness floor is ${floor}` });
    }
  }

  for (const uniqueness of assert.unique ?? []) {
    const hits = matching(events, uniqueness.events);
    for (const field of uniqueness.fields) {
      const values = hits.map((event) => fieldValue(event, field));
      const missing = values.findIndex((value) => value === undefined || value === null || value === "");
      if (missing >= 0) {
        assertions.push({ kind: "unique", status: "ERROR", detail: `uniqueness field \`${field}\` is missing on \`${uniqueness.events.event}\` at sequence ${hits[missing].seq}` });
      } else {
        const duplicates = values.filter((value, index) => values.findIndex((other) => deepEqual(value, other)) !== index);
        assertions.push({
          kind: "unique",
          status: duplicates.length ? "FAIL" : "PASS",
          detail: duplicates.length ? `\`${field}\` was reused across independent \`${uniqueness.events.event}\` events` : `\`${field}\` is unique across ${hits.length} event(s)`,
        });
      }
    }
  }

  for (const rule of assert.forbid_after ?? []) {
    const anchors = selected(events, rule.anchor);
    if (!anchors.length) {
      assertions.push({
        kind: "forbid_after",
        status: rule.anchor_optional ? "PASS" : "FAIL",
        detail: rule.anchor_optional ? `optional anchor \`${rule.anchor.event}\` did not occur` : `anchor \`${rule.anchor.event}\` is missing`,
      });
      continue;
    }
    for (const anchor of anchors) {
      let violations = 0;
      let error: string | null = null;
      for (const selector of rule.forbidden) {
        for (const candidate of matching(events, selector).filter((event) => event.seq > anchor.seq)) {
          const checked = compareFields(anchor, candidate, rule.same ?? [], []);
          if (checked.error) error ??= checked.error;
          else if (checked.ok) violations++;
        }
      }
      assertions.push(error
        ? { kind: "forbid_after", status: "ERROR", detail: error }
        : {
            kind: "forbid_after",
            status: violations ? "FAIL" : "PASS",
            detail: violations
              ? `${violations} forbidden mutation event(s) occurred after \`${rule.anchor.event}\` for the same identity`
              : `no forbidden mutation followed \`${rule.anchor.event}\``,
          });
    }
  }

  for (const approval of assert.approvals ?? []) {
    const grants = selected(events, approval.grant);
    const uses = approval.use.select ? selected(events, approval.use) : matching(events, approval.use);
    if (!grants.length || !uses.length) {
      assertions.push({ kind: "approval", status: "FAIL", detail: "approval grant/use evidence is incomplete" });
      continue;
    }
    for (const grant of grants) {
      const matchingUses: TrajectoryEventV1[] = [];
      let error: string | null = null;
      let usedBeforeGrant = false;
      const identityFields = [...new Set([
        ...(approval.same ?? []),
        "approval.id",
        "approval.capability",
        ...(approval.scopes ? ["approval.scope"] : []),
        ...(approval.sources ? ["approval.source"] : []),
      ])];
      for (const use of uses) {
        const checked = compareFields(grant, use, identityFields, []);
        if (checked.error) error ??= checked.error;
        else if (checked.ok && use.seq <= grant.seq) usedBeforeGrant = true;
        else if (checked.ok) matchingUses.push(use);
      }
      const scope = grant.approval?.scope;
      const source = grant.approval?.source;
      if (error) {
        assertions.push({ kind: "approval", status: "ERROR", detail: error });
        continue;
      }
      if (approval.scopes && (!scope || !approval.scopes.includes(scope))) {
        assertions.push({ kind: "approval", status: scope ? "FAIL" : "ERROR", detail: scope ? `approval scope \`${scope}\` is not allowed` : "approval scope is missing" });
        continue;
      }
      if (approval.sources && (!source || !approval.sources.includes(source))) {
        assertions.push({ kind: "approval", status: source ? "FAIL" : "ERROR", detail: source ? `approval source \`${source}\` is not allowed` : "approval source is missing" });
        continue;
      }
      if (usedBeforeGrant) {
        assertions.push({ kind: "approval", status: "FAIL", detail: "approval was used before its grant event" });
        continue;
      }
      if (matchingUses.length === 0) {
        assertions.push({ kind: "approval", status: "FAIL", detail: "no approval use matches the granted scope/identity" });
        continue;
      }
      if (approval.max_uses !== undefined && matchingUses.length > approval.max_uses) {
        assertions.push({ kind: "approval", status: "FAIL", detail: `approval was used ${matchingUses.length} times (max ${approval.max_uses})` });
        continue;
      }
      if (approval.unexpired) {
        const approved = grant.approval?.approved_at ?? grant.at;
        const expires = grant.approval?.expires_at;
        const timestampsInvalid = !approved || !expires || !validDate(approved) || !validDate(expires) ||
          matchingUses.some((use) => !validDate(use.approval?.used_at ?? use.at));
        if (timestampsInvalid) {
          assertions.push({ kind: "approval", status: "ERROR", detail: "approval grant/expiry/use timestamp is missing or invalid" });
          continue;
        }
        const invalidUse = matchingUses.find((use) => {
          const used = use.approval?.used_at ?? use.at!;
          return Date.parse(used) < Date.parse(approved) || Date.parse(used) >= Date.parse(expires);
        });
        if (Date.parse(approved) >= Date.parse(expires) || invalidUse) {
          assertions.push({ kind: "approval", status: "FAIL", detail: "approval was used outside its grant/expiry interval" });
          continue;
        }
      }
      assertions.push({ kind: "approval", status: "PASS", detail: `approval was used ${matchingUses.length} time(s) within declared scope and expiry` });
    }
  }

  for (const coverage of assert.coverage ?? []) {
    const hits = coverage.events ? matching(events, coverage.events) : events;
    const covered = new Set(hits.flatMap((event) => event.requirements ?? []));
    const missing = coverage.requirements.filter((requirement) => !covered.has(requirement));
    assertions.push({
      kind: "coverage",
      status: missing.length ? "FAIL" : "PASS",
      detail: missing.length ? `missing requirement coverage: ${missing.join(", ")}` : `requirement coverage recorded: ${coverage.requirements.join(", ")}`,
    });
  }

  return {
    status: assertions.some((result) => result.status === "ERROR") ? "ERROR" : assertions.some((result) => result.status === "FAIL") ? "FAIL" : "PASS",
    event_version: TRAJECTORY_EVENT_VERSION,
    events_sha256: trajectoryEventsSha256(events),
    assertions,
  };
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export function parseTrajectoryAssert(raw: unknown, ctx: string): TrajectoryAssert {
  const object = asObject(raw, `${ctx}: \`assert.trajectory\``);
  const allowed = new Set(["version", "require", "forbid", "ordered", "correlate", "freshness", "unique", "forbid_after", "approvals", "coverage"]);
  rejectUnknown(object, allowed, `${ctx}: \`assert.trajectory\``);
  if (object.version !== TRAJECTORY_ASSERT_VERSION) throw new Error(`${ctx}: \`assert.trajectory.version\` must be ${TRAJECTORY_ASSERT_VERSION}`);
  const out: TrajectoryAssert = { version: TRAJECTORY_ASSERT_VERSION };

  if (object.require !== undefined) out.require = nonEmptyArray(object.require, `${ctx}: require`).map((value, index) => parseRequired(value, `${ctx}: require[${index}]`));
  if (object.forbid !== undefined) out.forbid = nonEmptyArray(object.forbid, `${ctx}: forbid`).map((value, index) => parseSelector(value, `${ctx}: forbid[${index}]`));
  if (object.ordered !== undefined) out.ordered = nonEmptyArray(object.ordered, `${ctx}: ordered`).map((chain, index) => nonEmptyArray(chain, `${ctx}: ordered[${index}]`).map((value, step) => parseSelector(value, `${ctx}: ordered[${index}][${step}]`)));
  if (object.correlate !== undefined) out.correlate = nonEmptyArray(object.correlate, `${ctx}: correlate`).map((value, index) => parseCorrelation(value, `${ctx}: correlate[${index}]`));
  if (object.freshness !== undefined) out.freshness = nonEmptyArray(object.freshness, `${ctx}: freshness`).map((value, index) => parseFreshness(value, `${ctx}: freshness[${index}]`));
  if (object.unique !== undefined) out.unique = nonEmptyArray(object.unique, `${ctx}: unique`).map((value, index) => parseUnique(value, `${ctx}: unique[${index}]`));
  if (object.forbid_after !== undefined) out.forbid_after = nonEmptyArray(object.forbid_after, `${ctx}: forbid_after`).map((value, index) => parseForbidAfter(value, `${ctx}: forbid_after[${index}]`));
  if (object.approvals !== undefined) out.approvals = nonEmptyArray(object.approvals, `${ctx}: approvals`).map((value, index) => parseApproval(value, `${ctx}: approvals[${index}]`));
  if (object.coverage !== undefined) out.coverage = nonEmptyArray(object.coverage, `${ctx}: coverage`).map((value, index) => parseCoverage(value, `${ctx}: coverage[${index}]`));
  if (Object.keys(out).length === 1) throw new Error(`${ctx}: \`assert.trajectory\` declares no assertions`);
  return out;
}

function parseRequired(raw: unknown, ctx: string): RequiredEvent {
  const object = asObject(raw, ctx);
  rejectUnknown(object, new Set(["event", "where", "select", "count"]), ctx);
  const out: RequiredEvent = parseSelector({ event: object.event, ...(object.where === undefined ? {} : { where: object.where }), ...(object.select === undefined ? {} : { select: object.select }) }, ctx);
  if (object.count !== undefined) out.count = parseCount(object.count, `${ctx}.count`);
  return out;
}
function parseSelector(raw: unknown, ctx: string): EventSelector {
  const object = asObject(raw, ctx);
  rejectUnknown(object, new Set(["event", "where", "select"]), ctx);
  if (typeof object.event !== "string" || !object.event.trim()) throw new Error(`${ctx}.event must be a non-empty string`);
  const out: EventSelector = { event: object.event };
  if (object.where !== undefined) {
    const where = asObject(object.where, `${ctx}.where`);
    out.where = Object.fromEntries(Object.entries(where).map(([field, value]) => [field, parsePredicate(value, `${ctx}.where.${field}`)]));
  }
  if (object.select !== undefined) {
    if (!(["first", "last", "all"] as unknown[]).includes(object.select)) throw new Error(`${ctx}.select must be first, last, or all`);
    out.select = object.select as EventSelector["select"];
  }
  return out;
}
function parseCorrelation(raw: unknown, ctx: string): CorrelationAssert {
  const object = asObject(raw, ctx);
  rejectUnknown(object, new Set(["left", "right", "same", "different", "order"]), ctx);
  const out: CorrelationAssert = { left: parseSelector(object.left, `${ctx}.left`), right: parseSelector(object.right, `${ctx}.right`) };
  if (object.same !== undefined) out.same = stringList(object.same, `${ctx}.same`);
  if (object.different !== undefined) out.different = stringList(object.different, `${ctx}.different`);
  if (object.order !== undefined) {
    if (object.order !== "before" && object.order !== "after") throw new Error(`${ctx}.order must be before or after`);
    out.order = object.order;
  }
  if (!out.same?.length && !out.different?.length && !out.order) throw new Error(`${ctx} declares no relation`);
  return out;
}
function parseFreshness(raw: unknown, ctx: string): FreshnessAssert {
  const object = asObject(raw, ctx);
  rejectUnknown(object, new Set(["subject", "after", "same"]), ctx);
  return {
    subject: parseSelector(object.subject, `${ctx}.subject`),
    after: nonEmptyArray(object.after, `${ctx}.after`).map((value, index) => parseSelector(value, `${ctx}.after[${index}]`)),
    ...(object.same === undefined ? {} : { same: stringList(object.same, `${ctx}.same`) }),
  };
}
function parseUnique(raw: unknown, ctx: string): UniqueAssert {
  const object = asObject(raw, ctx);
  rejectUnknown(object, new Set(["events", "fields"]), ctx);
  return { events: parseSelector(object.events, `${ctx}.events`), fields: stringList(object.fields, `${ctx}.fields`) };
}
function parseForbidAfter(raw: unknown, ctx: string): ForbidAfterAssert {
  const object = asObject(raw, ctx);
  rejectUnknown(object, new Set(["anchor", "forbidden", "same", "anchor_optional"]), ctx);
  if (object.anchor_optional !== undefined && typeof object.anchor_optional !== "boolean") throw new Error(`${ctx}.anchor_optional must be boolean`);
  return {
    anchor: parseSelector(object.anchor, `${ctx}.anchor`),
    forbidden: nonEmptyArray(object.forbidden, `${ctx}.forbidden`).map((value, index) => parseSelector(value, `${ctx}.forbidden[${index}]`)),
    ...(object.same === undefined ? {} : { same: stringList(object.same, `${ctx}.same`) }),
    ...(object.anchor_optional === undefined ? {} : { anchor_optional: object.anchor_optional }),
  };
}
function parseApproval(raw: unknown, ctx: string): ApprovalAssert {
  const object = asObject(raw, ctx);
  rejectUnknown(object, new Set(["grant", "use", "same", "scopes", "sources", "unexpired", "max_uses"]), ctx);
  if (object.unexpired !== undefined && typeof object.unexpired !== "boolean") throw new Error(`${ctx}.unexpired must be boolean`);
  if (object.max_uses !== undefined && (!Number.isInteger(object.max_uses) || Number(object.max_uses) < 1)) throw new Error(`${ctx}.max_uses must be a positive integer`);
  return {
    grant: parseSelector(object.grant, `${ctx}.grant`),
    use: parseSelector(object.use, `${ctx}.use`),
    ...(object.same === undefined ? {} : { same: stringList(object.same, `${ctx}.same`) }),
    ...(object.scopes === undefined ? {} : { scopes: stringList(object.scopes, `${ctx}.scopes`) }),
    ...(object.sources === undefined ? {} : { sources: stringList(object.sources, `${ctx}.sources`) }),
    ...(object.unexpired === undefined ? {} : { unexpired: object.unexpired }),
    ...(object.max_uses === undefined ? {} : { max_uses: Number(object.max_uses) }),
  };
}
function parseCoverage(raw: unknown, ctx: string): CoverageAssert {
  const object = asObject(raw, ctx);
  rejectUnknown(object, new Set(["requirements", "events"]), ctx);
  return { requirements: stringList(object.requirements, `${ctx}.requirements`), ...(object.events === undefined ? {} : { events: parseSelector(object.events, `${ctx}.events`) }) };
}
function parseCount(raw: unknown, ctx: string): CountConstraint {
  const object = asObject(raw, ctx);
  rejectUnknown(object, new Set(["min", "max"]), ctx);
  const out: CountConstraint = {};
  for (const key of ["min", "max"] as const) {
    if (object[key] === undefined) continue;
    if (!Number.isInteger(object[key]) || Number(object[key]) < 0) throw new Error(`${ctx}.${key} must be a non-negative integer`);
    out[key] = Number(object[key]);
  }
  if (out.min !== undefined && out.max !== undefined && out.min > out.max) throw new Error(`${ctx}.min exceeds max`);
  return out;
}

// ---------------------------------------------------------------------------
// Offline mutation proof
// ---------------------------------------------------------------------------

export interface MutationSelfTestCase { id: string; detected: boolean; status: TrajectoryAssertionStatus; detail: string }
export interface MutationSelfTestReport { baseline: "PASS"; cases: MutationSelfTestCase[] }

/** Fast, deterministic proof that every trajectory assertion class can turn red. */
export function runTrajectoryMutationSelfTest(): MutationSelfTestReport {
  const e = (seq: number, type: string, extra: Partial<TrajectoryEventV1> = {}): TrajectoryEventV1 => ({ event_version: TRAJECTORY_EVENT_VERSION, seq, type, source: "mutation-self-test", at: `2026-01-01T00:00:${String(seq).padStart(2, "0")}Z`, ...extra });
  const h = "a".repeat(40), t = "b".repeat(40), p = "1".repeat(64);
  const cases: Array<{ id: string; assertion: TrajectoryAssert; good: TrajectoryEventV1[]; mutate: (events: TrajectoryEventV1[]) => TrajectoryEventV1[] }> = [
    { id: "remove-required-event", assertion: { version: "1.0", require: [{ event: "risk_classified" }] }, good: [e(1, "risk_classified")], mutate: () => [e(1, "unrelated")] },
    { id: "add-forbidden-tool-side-effect-approval", assertion: { version: "1.0", forbid: [{ event: "tool_called", where: { tool: { equals: "rm" } } }, { event: "side_effect_approved" }] }, good: [e(1, "tool_called", { tool: "read" })], mutate: (events) => [...events, e(2, "side_effect_approved", { attributes: { action: "migration" } })] },
    { id: "reorder-transition", assertion: { version: "1.0", ordered: [[{ event: "phase_started" }, { event: "phase_completed" }]] }, good: [e(1, "phase_started"), e(2, "phase_completed")], mutate: () => [e(2, "phase_started"), e(1, "phase_completed")] },
    { id: "substitute-workspace-id", assertion: { version: "1.0", correlate: [{ left: { event: "code_changed" }, right: { event: "evidence_recorded" }, same: ["workspace_id"] }] }, good: [e(1, "code_changed", { workspace_id: "ws-1" }), e(2, "evidence_recorded", { workspace_id: "ws-1" })], mutate: (events) => events.map((x) => x.type === "evidence_recorded" ? { ...x, workspace_id: "ws-2" } : x) },
    { id: "concurrent-writer", assertion: { version: "1.0", forbid: [{ event: "writer_lease_conflict" }] }, good: [e(1, "writer_lease_acquired", { workspace_id: "ws-1" })], mutate: (events) => [...events, e(2, "writer_lease_conflict", { workspace_id: "ws-1" })] },
    { id: "approval-expired-or-mismatched", assertion: { version: "1.0", approvals: [{ grant: { event: "approval_granted" }, use: { event: "approval_used" }, same: ["approval.id", "approval.capability"], unexpired: true }] }, good: [e(1, "approval_granted", { approval: { id: "a1", capability: "push", expires_at: "2026-01-01T01:00:00Z" } }), e(2, "approval_used", { approval: { id: "a1", capability: "push", used_at: "2026-01-01T00:01:00Z" } })], mutate: (events) => events.map((x) => x.type === "approval_used" ? { ...x, approval: { ...x.approval, used_at: "2026-01-01T02:00:00Z" } } : x) },
    { id: "evidence-before-change", assertion: { version: "1.0", freshness: [{ subject: { event: "evidence_recorded" }, after: [{ event: "code_changed" }] }] }, good: [e(1, "code_changed"), e(2, "evidence_recorded")], mutate: () => [e(2, "code_changed"), e(1, "evidence_recorded")] },
    { id: "evidence-before-authority", assertion: { version: "1.0", freshness: [{ subject: { event: "evidence_recorded" }, after: [{ event: "plan_recorded" }] }] }, good: [e(1, "plan_recorded", { digests: { plan: p } }), e(2, "evidence_recorded")], mutate: () => [e(2, "plan_recorded", { digests: { plan: p } }), e(1, "evidence_recorded")] },
    { id: "evidence-before-build-completion", assertion: { version: "1.0", freshness: [{ subject: { event: "evidence_recorded" }, after: [{ event: "phase_completed", where: { phase: { equals: "build" } } }] }] }, good: [e(1, "phase_completed", { phase: "build" }), e(2, "evidence_recorded")], mutate: () => [e(2, "phase_completed", { phase: "build" }), e(1, "evidence_recorded")] },
    { id: "head-equal-tree-different", assertion: { version: "1.0", correlate: [{ left: { event: "code_changed" }, right: { event: "evidence_recorded" }, same: ["digests.head", "digests.tree"] }] }, good: [e(1, "code_changed", { digests: { head: h, tree: t } }), e(2, "evidence_recorded", { digests: { head: h, tree: t } })], mutate: (events) => events.map((x) => x.type === "evidence_recorded" ? { ...x, digests: { head: h, tree: "c".repeat(40) } } : x) },
    { id: "command-receipt-nonzero", assertion: { version: "1.0", require: [{ event: "evidence_recorded", where: { exit_code: { equals: 0 } } }] }, good: [e(1, "evidence_recorded", { exit_code: 0 })], mutate: (events) => events.map((x) => ({ ...x, exit_code: 1 })) },
    { id: "remove-requirement-coverage", assertion: { version: "1.0", coverage: [{ requirements: ["AUTH-7"], events: { event: "evidence_recorded" } }] }, good: [e(1, "evidence_recorded", { requirements: ["AUTH-7"] })], mutate: (events) => events.map((x) => ({ ...x, requirements: [] })) },
    { id: "mutate-superseded-task", assertion: { version: "1.0", forbid_after: [{ anchor: { event: "task_packet_superseded" }, forbidden: [{ event: "code_changed" }, { event: "repair_started" }], same: ["task_id"] }] }, good: [e(1, "task_packet_superseded", { task_id: "old" }), e(2, "code_changed", { task_id: "new" })], mutate: (events) => events.map((x) => x.type === "code_changed" ? { ...x, task_id: "old" } : x) },
    { id: "reuse-context-id", assertion: { version: "1.0", unique: [{ events: { event: "review_recorded" }, fields: ["context_id"] }] }, good: [e(1, "review_recorded", { context_id: "c1" }), e(2, "review_recorded", { context_id: "c2" })], mutate: (events) => events.map((x) => x.seq === 2 ? { ...x, context_id: "c1" } : x) },
    { id: "mismatch-finalization-identity", assertion: { version: "1.0", correlate: [{ left: { event: "gate_evaluated", where: { "attributes.gate": { equals: "finalize" } } }, right: { event: "finalization_completed" }, same: ["digests.head", "digests.tree"], order: "before" }] }, good: [e(1, "gate_evaluated", { digests: { head: h, tree: t }, attributes: { gate: "finalize", code: "OK" } }), e(2, "finalization_completed", { digests: { head: h, tree: t } })], mutate: (events) => events.map((x) => x.type === "finalization_completed" ? { ...x, digests: { head: h, tree: "d".repeat(40) } } : x) },
    { id: "v3-blocked-critical-code", assertion: { version: "1.0", require: [{ event: "gate_evaluated", where: { "attributes.code": { equals: "BLOCKED_CRITICAL_ASSURANCE" } } }] }, good: [e(1, "gate_evaluated", { attributes: { gate: "finalize", code: "BLOCKED_CRITICAL_ASSURANCE", missing_count: 2 } })], mutate: (events) => events.map((x) => ({ ...x, attributes: { ...x.attributes, code: "OK" } })) },
    { id: "v3-stale-gate-must-block", assertion: { version: "1.0", require: [{ event: "gate_evaluated", where: { "attributes.code": { matches: "^BLOCKED_" } } }] }, good: [e(1, "gate_evaluated", { attributes: { gate: "finalize", code: "BLOCKED_ASSURANCE" } })], mutate: (events) => events.map((x) => ({ ...x, attributes: { ...x.attributes, code: "OK" } })) },
    { id: "v3-finalize-gate-must-be-ok", assertion: { version: "1.0", require: [{ event: "gate_evaluated", where: { "attributes.gate": { equals: "finalize" }, "attributes.code": { equals: "OK" } } }] }, good: [e(1, "gate_evaluated", { attributes: { gate: "finalize", code: "OK" } })], mutate: (events) => events.map((x) => ({ ...x, attributes: { ...x.attributes, code: "BLOCKED_ASSURANCE" } })) },
    { id: "v3-discard-requires-explicit-request", assertion: { version: "1.0", forbid: [{ event: "finish_selected", where: { "attributes.choice": { equals: "discard" }, "attributes.explicit_request": { equals: false } } }] }, good: [e(1, "finish_selected", { attributes: { choice: "discard", explicit_request: true } })], mutate: (events) => events.map((x) => ({ ...x, attributes: { ...x.attributes, explicit_request: false } })) },
    { id: "v3-side-effect-approval-and-gate", assertion: { version: "1.0", ordered: [[{ event: "side_effect_approved", where: { "attributes.action": { equals: "migration" } } }, { event: "gate_evaluated", where: { "attributes.gate": { equals: "side-effect" }, "attributes.code": { equals: "OK" } } }]] }, good: [e(1, "side_effect_approved", { attributes: { action: "migration" } }), e(2, "gate_evaluated", { attributes: { gate: "side-effect", code: "OK" } })], mutate: (events) => events.map((x) => x.type === "gate_evaluated" ? { ...x, attributes: { ...x.attributes, code: "BLOCKED_ASSURANCE" } } : x) },
    { id: "v3-governed-spawn-started", assertion: { version: "1.0", require: [{ event: "child_started", where: { source: { equals: "pi-daddy-v3" }, "attributes.state": { equals: "starting" } } }] }, good: [e(1, "child_started", { source: "pi-daddy-v3", attributes: { state: "starting" } })], mutate: (events) => events.map((x) => ({ ...x, attributes: { ...x.attributes, state: "failed" } })) },
  ];

  const results = cases.map((testCase): MutationSelfTestCase => {
    const baseline = evaluateTrajectoryGates(testCase.assertion, testCase.good);
    if (baseline.status !== "PASS") throw new Error(`mutation self-test baseline ${testCase.id} is ${baseline.status}`);
    const mutated = evaluateTrajectoryGates(testCase.assertion, testCase.mutate(structuredClone(testCase.good)));
    return { id: testCase.id, detected: mutated.status !== "PASS", status: mutated.status, detail: mutated.assertions.find((result) => result.status !== "PASS")?.detail ?? "mutation was not detected" };
  });
  return { baseline: "PASS", cases: results };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const V11_EVENT_KEYS = new Set(["execution_id", "parent_execution_id", "task_from_execution_id", "workflow_fact_id", "deadline_at"]);
const EVENT_KEYS = new Set([
  "event_version", "seq", "type", "source", "at", "run_id", "task_id", "workspace_id", "context_id", "finding_id",
  "parent_id", "child_id", ...V11_EVENT_KEYS,
  "phase", "tool", "capability", "requested_capabilities", "effective_capabilities", "refusal_code",
  "exit_code", "digests", "approval", "requirements", "attributes",
]);
const APPROVAL_KEYS = new Set(["id", "capability", "subject", "source", "scope", "approved_at", "expires_at", "used_at"]);
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256_RE = /^[a-fA-F0-9]{64}$/;
const GIT_SHA_RE = /^(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/;
const REFUSAL_RE = /^[A-Z][A-Z0-9_]*$/;

/** Runtime counterpart of trajectory-event-v1.schema.json; evidence is rejected before any assertion can consume it. */
function validateEvent(event: TrajectoryEventV1): string | null {
  if (!event || typeof event !== "object" || Array.isArray(event)) return "event must be an object";
  const object = event as unknown as Record<string, unknown>;
  const unknown = Object.keys(object).find((key) => !EVENT_KEYS.has(key));
  if (unknown) return `unknown field ${unknown}`;
  if (event.event_version !== LEGACY_TRAJECTORY_EVENT_VERSION && event.event_version !== TRAJECTORY_EVENT_VERSION) {
    return `unsupported event_version ${String(event.event_version)}`;
  }
  if (event.event_version === LEGACY_TRAJECTORY_EVENT_VERSION) {
    const versionedField = Object.keys(object).find((key) => V11_EVENT_KEYS.has(key));
    if (versionedField) return `${versionedField} requires event_version ${TRAJECTORY_EVENT_VERSION}`;
  }
  if (!Number.isInteger(event.seq) || event.seq < 1) return "seq must be a positive integer";
  if (typeof event.type !== "string" || !event.type) return "type must be a non-empty string";
  if (typeof event.source !== "string" || !event.source) return "source must be a non-empty string";
  if (event.at !== undefined && !validDate(event.at)) return "at must be an RFC 3339 date-time";
  for (const field of ["run_id", "task_id", "workspace_id", "context_id", "finding_id", "parent_id", "child_id", "execution_id", "task_from_execution_id", "workflow_fact_id"] as const) {
    if (event[field] !== undefined && (typeof event[field] !== "string" || !ID_RE.test(event[field]))) return `${field} is not a valid bounded identifier`;
  }
  if (event.parent_execution_id !== undefined && event.parent_execution_id !== null &&
      (typeof event.parent_execution_id !== "string" || !ID_RE.test(event.parent_execution_id))) return "parent_execution_id is not a valid bounded identifier or null";
  if (event.deadline_at !== undefined && !validDate(event.deadline_at)) return "deadline_at must be an RFC 3339 date-time";
  for (const field of ["phase", "tool", "capability"] as const) {
    if (event[field] !== undefined && (typeof event[field] !== "string" || !event[field])) return `${field} must be a non-empty string`;
  }
  for (const field of ["requested_capabilities", "effective_capabilities", "requirements"] as const) {
    const values = event[field];
    if (values !== undefined && (!Array.isArray(values) || values.some((value) => typeof value !== "string" || !value) || new Set(values).size !== values.length)) {
      return `${field} must be an array of unique non-empty strings`;
    }
  }
  if (event.refusal_code !== undefined && !REFUSAL_RE.test(event.refusal_code)) return "refusal_code is invalid";
  if (event.exit_code !== undefined && !Number.isInteger(event.exit_code)) return "exit_code must be an integer";
  if (event.digests !== undefined) {
    if (!event.digests || typeof event.digests !== "object" || Array.isArray(event.digests)) return "digests must be an object";
    for (const [key, value] of Object.entries(event.digests)) {
      if (typeof value !== "string") return `digests.${key} must be a string`;
      if (["plan", "task", "definition"].includes(key) && !SHA256_RE.test(value)) return `digests.${key} must be sha256`;
      if (["head", "tree"].includes(key) && !GIT_SHA_RE.test(value)) return `digests.${key} must be a git object id`;
    }
  }
  if (event.approval !== undefined) {
    if (!event.approval || typeof event.approval !== "object" || Array.isArray(event.approval)) return "approval must be an object";
    const unknownApproval = Object.keys(event.approval).find((key) => !APPROVAL_KEYS.has(key));
    if (unknownApproval) return `approval.${unknownApproval} is unknown`;
    for (const [key, value] of Object.entries(event.approval)) {
      if (typeof value !== "string" || !value) return `approval.${key} must be a non-empty string`;
      if (key === "id" && !ID_RE.test(value)) return "approval.id is invalid";
      if (["approved_at", "expires_at", "used_at"].includes(key) && !validDate(value)) return `approval.${key} must be an RFC 3339 date-time`;
    }
  }
  if (event.attributes !== undefined && (!event.attributes || typeof event.attributes !== "object" || Array.isArray(event.attributes))) return "attributes must be an object";
  return null;
}
function matching(events: TrajectoryEventV1[], selector: EventSelector): TrajectoryEventV1[] {
  return events.filter((event) => event.type === selector.event && Object.entries(selector.where ?? {}).every(([field, predicate]) => testPredicate(fieldValue(event, field), predicate)));
}
function selected(events: TrajectoryEventV1[], selector: EventSelector): TrajectoryEventV1[] {
  const hits = matching(events, selector);
  if (selector.select === "all") return hits;
  return hits.length ? [selector.select === "first" ? hits[0] : hits[hits.length - 1]] : [];
}
function fieldValue(event: TrajectoryEventV1, field: string): unknown {
  let current: unknown = event;
  for (const part of field.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current) || !Object.hasOwn(current, part)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
function compareFields(left: TrajectoryEventV1, right: TrajectoryEventV1, same: string[], different: string[]): { ok: boolean; error?: string } {
  for (const field of [...same, ...different]) {
    const l = fieldValue(left, field), r = fieldValue(right, field);
    if (l === undefined || l === null || r === undefined || r === null) return { ok: false, error: `correlation field \`${field}\` is missing at sequence ${l === undefined || l === null ? left.seq : right.seq}` };
  }
  return { ok: same.every((field) => deepEqual(fieldValue(left, field), fieldValue(right, field))) && different.every((field) => !deepEqual(fieldValue(left, field), fieldValue(right, field))) };
}
function deepEqual(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right); }
function validDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  return day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}
function bounds(min: number, max: number | undefined): string { return max === undefined ? `at least ${min}` : min === 0 ? `at most ${max}` : `${min}..${max}`; }
function asObject(value: unknown, ctx: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${ctx} must be a mapping`); return value as Record<string, unknown>; }
function nonEmptyArray(value: unknown, ctx: string): unknown[] { if (!Array.isArray(value) || value.length === 0) throw new Error(`${ctx} must be a non-empty list`); return value; }
function stringList(value: unknown, ctx: string): string[] { const values = nonEmptyArray(value, ctx); if (values.some((item) => typeof item !== "string" || !item.trim())) throw new Error(`${ctx} must contain non-empty strings`); if (new Set(values).size !== values.length) throw new Error(`${ctx} must not contain duplicates`); return values as string[]; }
function rejectUnknown(object: Record<string, unknown>, allowed: Set<string>, ctx: string): void { const unknown = Object.keys(object).find((key) => !allowed.has(key)); if (unknown) throw new Error(`${ctx}: unknown key \`${unknown}\``); }
function stableStringify(value: unknown): string { if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null"; if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`; return `{${Object.entries(value as Record<string, unknown>).filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",")}}`; }
