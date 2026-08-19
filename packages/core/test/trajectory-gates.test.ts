import { describe, expect, it } from "vitest";
import {
  evaluateTrajectoryGates,
  parseTrajectoryAssert,
  runTrajectoryMutationSelfTest,
  serializeTrajectoryEvents,
  deserializeTrajectoryEvents,
  TRAJECTORY_EVENT_VERSION,
  type TrajectoryEventV1,
} from "../src/trajectory-gates.js";

const H = "a".repeat(40);
const T = "b".repeat(40);

function event(seq: number, type: string, extra: Partial<TrajectoryEventV1> = {}): TrajectoryEventV1 {
  return {
    event_version: TRAJECTORY_EVENT_VERSION,
    seq,
    type,
    source: "test",
    at: `2026-08-19T12:00:${String(seq).padStart(2, "0")}Z`,
    ...extra,
  };
}

const EVENTS: TrajectoryEventV1[] = [
  event(1, "risk_classified", { run_id: "run-1", attributes: { level: "critical", reason: "migration" } }),
  event(2, "workspace_attached", { run_id: "run-1", workspace_id: "ws-1", attributes: { mode: "owned-isolated", writer: "build" } }),
  event(3, "plan_recorded", { run_id: "run-1", digests: { plan: "1".repeat(64) } }),
  event(4, "task_packet_recorded", { run_id: "run-1", task_id: "task-1", workspace_id: "ws-1", digests: { plan: "1".repeat(64), task: "2".repeat(64), definition: "3".repeat(64) }, requirements: ["AUTH-7"] }),
  event(5, "writer_lease_acquired", { run_id: "run-1", task_id: "task-1", workspace_id: "ws-1", attributes: { holder: "build" } }),
  event(6, "phase_started", { run_id: "run-1", task_id: "task-1", workspace_id: "ws-1", phase: "build", digests: { definition: "3".repeat(64) } }),
  event(7, "code_changed", { run_id: "run-1", task_id: "task-1", workspace_id: "ws-1", digests: { head: H, tree: T }, requirements: ["AUTH-7"] }),
  event(8, "phase_completed", { run_id: "run-1", task_id: "task-1", workspace_id: "ws-1", phase: "build", attributes: { status: "completed" } }),
  event(9, "evidence_recorded", { run_id: "run-1", task_id: "task-1", workspace_id: "ws-1", digests: { head: H, tree: T }, exit_code: 0, attributes: { kind: "exact-target" }, requirements: ["AUTH-7"] }),
  event(10, "review_recorded", { run_id: "run-1", task_id: "task-1", workspace_id: "ws-1", context_id: "ctx-spec", digests: { head: H, tree: T }, attributes: { axis: "specification", verdict: "APPROVE" } }),
  event(11, "review_recorded", { run_id: "run-1", task_id: "task-1", workspace_id: "ws-1", context_id: "ctx-quality", digests: { head: H, tree: T }, attributes: { axis: "quality", verdict: "APPROVE" } }),
  event(12, "approval_granted", { run_id: "run-1", approval: { id: "approval-1", capability: "side-effect:merge", source: "prompt", scope: "once", approved_at: "2026-08-19T12:00:12Z", expires_at: "2026-08-19T13:00:00Z" } }),
  event(13, "approval_used", { run_id: "run-1", approval: { id: "approval-1", capability: "side-effect:merge", source: "prompt", scope: "once", used_at: "2026-08-19T12:00:13Z" } }),
  event(14, "finish_selected", { run_id: "run-1", attributes: { choice: "merge", explicit_request: true } }),
  event(15, "phase_started", { run_id: "run-1", phase: "git-ops", workspace_id: "ws-1" }),
  event(16, "gate_evaluated", { run_id: "run-1", workspace_id: "ws-1", digests: { head: H, tree: T }, attributes: { gate: "finalize", result: "pass" } }),
  event(17, "finalization_completed", { run_id: "run-1", workspace_id: "ws-1", digests: { head: H, tree: T }, attributes: { choice: "merge", final_branch: "main" } }),
  event(18, "writer_lease_released", { run_id: "run-1", task_id: "task-1", workspace_id: "ws-1", attributes: { holder: "build" } }),
  event(19, "gate_evaluated", { run_id: "run-1", workspace_id: "ws-1", digests: { head: H, tree: T }, attributes: { gate: "finish", result: "pass" } }),
];

const RAW = {
  version: "1.0",
  require: [
    { event: "risk_classified", where: { "attributes.level": "critical" } },
    { event: "phase_started", where: { phase: { equals: "build" }, task_id: { matches: "^task-" } } },
  ],
  forbid: [
    { event: "tool_called", where: { tool: "rm", "attributes.destructive": true } },
    { event: "writer_lease_conflict" },
  ],
  ordered: [[
    { event: "workspace_attached" },
    { event: "writer_lease_acquired" },
    { event: "phase_started", where: { phase: "build" } },
    { event: "code_changed" },
    { event: "phase_completed", where: { phase: "build" } },
    { event: "evidence_recorded" },
    { event: "review_recorded", where: { "attributes.axis": "specification" } },
    { event: "finish_selected" },
    { event: "gate_evaluated", where: { "attributes.gate": "finalize", "attributes.result": "pass" } },
    { event: "finalization_completed" },
    { event: "gate_evaluated", where: { "attributes.gate": "finish", "attributes.result": "pass" } },
  ]],
  correlate: [
    {
      left: { event: "code_changed", select: "last" },
      right: { event: "evidence_recorded", select: "last" },
      same: ["run_id", "task_id", "workspace_id", "digests.head", "digests.tree"],
      order: "before",
    },
    {
      left: { event: "finalization_completed", select: "last" },
      right: { event: "gate_evaluated", where: { "attributes.gate": "finish" }, select: "last" },
      same: ["run_id", "workspace_id", "digests.head", "digests.tree"],
      order: "before",
    },
    {
      left: { event: "review_recorded", where: { "attributes.axis": "specification" }, select: "last" },
      right: { event: "review_recorded", where: { "attributes.axis": "quality" }, select: "last" },
      same: ["run_id", "task_id", "workspace_id", "digests.tree"],
      different: ["context_id"],
    },
  ],
  freshness: [
    {
      subject: { event: "evidence_recorded", where: { exit_code: 0 }, select: "last" },
      after: [
        { event: "code_changed", select: "last" },
        { event: "task_packet_recorded", select: "last" },
        { event: "phase_completed", where: { phase: "build" }, select: "last" },
      ],
      same: ["run_id", "task_id", "workspace_id"],
    },
    {
      subject: { event: "review_recorded", where: { "attributes.axis": "specification" }, select: "last" },
      after: [{ event: "phase_completed", where: { phase: "build" }, select: "last" }],
      same: ["run_id", "task_id", "workspace_id"],
    },
  ],
  unique: [{ events: { event: "review_recorded" }, fields: ["context_id"] }],
  forbid_after: [{
    anchor: { event: "task_packet_superseded", select: "last" },
    forbidden: [{ event: "code_changed" }, { event: "repair_started" }, { event: "repair_completed" }],
    same: ["run_id", "task_id"],
    anchor_optional: true,
  }],
  approvals: [{
    grant: { event: "approval_granted", select: "last" },
    use: { event: "approval_used", select: "last" },
    same: ["run_id", "approval.id", "approval.capability"],
    scopes: ["once"],
    sources: ["prompt", "persisted"],
    unexpired: true,
    max_uses: 1,
  }],
  coverage: [{ requirements: ["AUTH-7"], events: { event: "evidence_recorded" } }],
};

describe("trajectory assertion parsing and evaluation", () => {
  it("accepts the closed v1 DSL and evaluates a complete critical trajectory", () => {
    const assertion = parseTrajectoryAssert(RAW, "A1");
    const result = evaluateTrajectoryGates(assertion, EVENTS);
    expect(result.status).toBe("PASS");
    expect(result.assertions.length).toBeGreaterThan(10);
  });

  it("supports exact and pattern-matched normalized state", () => {
    const assertion = parseTrajectoryAssert({
      version: "1.0",
      require: [{ event: "phase_started", where: { phase: "build", task_id: { matches: "^task-[0-9]+$" } } }],
    }, "A1");
    expect(evaluateTrajectoryGates(assertion, EVENTS).status).toBe("PASS");
  });

  it("reports missing correlation fields as ERROR, never successful governance", () => {
    const broken = EVENTS.map((e) => e.type === "evidence_recorded" ? { ...e, workspace_id: undefined } : e);
    const result = evaluateTrajectoryGates(parseTrajectoryAssert(RAW, "A1"), broken);
    expect(result.status).toBe("ERROR");
    expect(result.assertions.some((a) => a.status === "ERROR" && a.detail.includes("workspace_id"))).toBe(true);
  });

  it("enforces the exact critical block first-line token, exit 3, and complete missing controls", () => {
    const assertion = parseTrajectoryAssert({
      version: "1.0",
      require: [{ event: "critical_blocked", where: { exit_code: 3, "attributes.first_line": "BLOCKED_CRITICAL_ASSURANCE" } }],
      coverage: [{ requirements: ["owned-workspace", "fresh-review"], events: { event: "critical_blocked" } }],
    }, "A1");
    const good = [event(1, "critical_blocked", {
      exit_code: 3,
      requirements: ["owned-workspace", "fresh-review"],
      attributes: { first_line: "BLOCKED_CRITICAL_ASSURANCE", missing_controls: ["owned-workspace", "fresh-review"] },
    })];
    expect(evaluateTrajectoryGates(assertion, good).status).toBe("PASS");
    expect(evaluateTrajectoryGates(assertion, [{ ...good[0], exit_code: 1 }]).status).toBe("FAIL");
  });

  it("rejects count on selectors whose assertion class does not define count semantics", () => {
    expect(() => parseTrajectoryAssert({ version: "1.0", forbid: [{ event: "x", count: { max: 1 } }] }, "A1")).toThrow(/unknown.*count/);
  });

  it("treats malformed normalized fields as evidence ERROR rather than satisfying coverage", () => {
    const assertion = parseTrajectoryAssert({ version: "1.0", coverage: [{ requirements: ["AUTH-7"] }] }, "A1");
    const malformed = [{ ...event(1, "evidence_recorded"), requirements: "AUTH-7" as unknown as string[] }];
    const result = evaluateTrajectoryGates(assertion, malformed);
    expect(result.status).toBe("ERROR");
    expect(result.assertions[0].detail).toMatch(/requirements must be an array/);
  });

  it("rejects gapped normalized JSONL before adapters can resequence it", () => {
    expect(deserializeTrajectoryEvents(serializeTrajectoryEvents([event(1, "a"), event(3, "b")]))).toBeNull();
  });

  it("rejects numeric identifiers and impossible calendar dates", () => {
    const assertion = parseTrajectoryAssert({ version: "1.0", require: [{ event: "x" }] }, "A1");
    expect(evaluateTrajectoryGates(assertion, [{ ...event(1, "x"), run_id: 7 as unknown as string }]).status).toBe("ERROR");
    expect(evaluateTrajectoryGates(assertion, [{ ...event(1, "x"), at: "2026-02-30T00:00:00Z" }]).status).toBe("ERROR");
  });

  it("rejects an approval use recorded before its grant", () => {
    const assertion = parseTrajectoryAssert({
      version: "1.0",
      approvals: [{ grant: { event: "approval_granted" }, use: { event: "approval_used" }, same: ["approval.id"] }],
    }, "A1");
    const result = evaluateTrajectoryGates(assertion, [
      event(1, "approval_used", { approval: { id: "a1", capability: "push" } }),
      event(2, "approval_granted", { approval: { id: "a1", capability: "push" } }),
    ]);
    expect(result.status).toBe("FAIL");
    expect(result.assertions[0].detail).toMatch(/before its grant/);
  });

  it("honors approval use.select instead of accepting an earlier unselected use", () => {
    const assertion = parseTrajectoryAssert({
      version: "1.0",
      approvals: [{ grant: { event: "approval_granted" }, use: { event: "approval_used", select: "last" } }],
    }, "A1");
    const result = evaluateTrajectoryGates(assertion, [
      event(1, "approval_granted", { approval: { id: "a1", capability: "push" } }),
      event(2, "approval_used", { approval: { id: "a1", capability: "push" } }),
      event(3, "approval_used", { approval: { id: "other", capability: "push" } }),
    ]);
    expect(result.status).toBe("FAIL");
  });

  it("intrinsically binds approval ID/capability and restricted source/scope to the use", () => {
    const assertion = parseTrajectoryAssert({
      version: "1.0",
      approvals: [{ grant: { event: "approval_granted" }, use: { event: "approval_used" }, sources: ["prompt"], scopes: ["once"] }],
    }, "A1");
    const result = evaluateTrajectoryGates(assertion, [
      event(1, "approval_granted", { approval: { id: "a1", capability: "push", source: "prompt", scope: "once" } }),
      event(2, "approval_used", { approval: { id: "a2", capability: "push" } }),
    ]);
    expect(result.status).toBe("ERROR");
    expect(result.assertions[0].detail).toMatch(/correlation field/);
  });

  it("rejects unknown keys and executable escape hatches", () => {
    expect(() => parseTrajectoryAssert({ version: "1.0", eval: "events => true" }, "A1")).toThrow(/unknown/);
    expect(() => parseTrajectoryAssert({ version: "2.0", require: [{ event: "x" }] }, "A1")).toThrow(/version/);
  });
});

describe("offline assertion mutation self-test", () => {
  it("turns every required mutation red without model or judge calls", () => {
    const report = runTrajectoryMutationSelfTest();
    expect(report.baseline).toBe("PASS");
    expect(report.cases).toHaveLength(15);
    expect(report.cases.every((c) => c.detected)).toBe(true);
    expect(report.cases.map((c) => c.id)).toEqual([
      "remove-required-event",
      "add-forbidden-tool-side-effect",
      "reorder-transition",
      "substitute-workspace-id",
      "concurrent-writer",
      "approval-expired-or-mismatched",
      "evidence-before-change",
      "evidence-before-authority",
      "evidence-before-build-completion",
      "head-equal-tree-different",
      "command-receipt-nonzero",
      "remove-requirement-coverage",
      "mutate-superseded-task",
      "reuse-context-id",
      "mismatch-finalization-identity",
    ]);
  });
});
