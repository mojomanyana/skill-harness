import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadSpec } from "../src/spec.js";
import {
  deserializeTrajectoryEvents,
  evaluateTrajectoryGates,
  parseTrajectoryAssert,
  TRAJECTORY_EVENT_VERSION,
  type TrajectoryEventV1,
} from "../src/trajectory-gates.js";

const dir = join(__dirname, "../../../examples/principal-v3-pack/tests/protocol-fixtures");
const events = (name: string) => deserializeTrajectoryEvents(readFileSync(join(dir, name), "utf8"))!;

const cases = [
  {
    name: "packet supersession blocks later source changes or repairs",
    fixture: "packet-supersession",
    assertion: {
      version: "1.0",
      forbid_after: [{
        anchor: { event: "task_packet_superseded", select: "last" },
        forbidden: [{ event: "code_changed" }, { event: "repair_started" }, { event: "repair_completed" }],
        same: ["run_id", "task_id"],
      }],
    },
  },
  {
    name: "task evidence and both task reviews follow persisted Build completion",
    fixture: "task-controls",
    assertion: {
      version: "1.0",
      freshness: [
        { subject: { event: "evidence_recorded", select: "last" }, after: [{ event: "phase_completed", where: { phase: "build" }, select: "last" }], same: ["run_id", "task_id", "workspace_id"] },
        { subject: { event: "review_recorded", where: { "attributes.axis": "specification" }, select: "last" }, after: [{ event: "phase_completed", where: { phase: "build" }, select: "last" }], same: ["run_id", "task_id", "workspace_id"] },
        { subject: { event: "review_recorded", where: { "attributes.axis": "quality" }, select: "last" }, after: [{ event: "phase_completed", where: { phase: "build" }, select: "last" }], same: ["run_id", "task_id", "workspace_id"] },
      ],
      unique: [{ events: { event: "review_recorded" }, fields: ["context_id"] }],
    },
  },
  {
    name: "whole-change review follows every scoped task control",
    fixture: "whole-review",
    assertion: {
      version: "1.0",
      freshness: [{
        subject: { event: "review_recorded", where: { "attributes.axis": "whole-change" }, select: "last" },
        after: [
          { event: "phase_completed", where: { phase: "build" }, select: "last" },
          { event: "evidence_recorded", where: { "attributes.kind": "exact-target" }, select: "last" },
          { event: "review_recorded", where: { "attributes.axis": "specification" }, select: "last" },
          { event: "review_recorded", where: { "attributes.axis": "quality" }, select: "last" },
        ],
        same: ["run_id"],
      }],
      unique: [{ events: { event: "review_recorded" }, fields: ["context_id"] }],
    },
  },
  {
    name: "suspended critical repair resumes with current task/workspace/Build binding",
    fixture: "repair-rebind",
    assertion: {
      version: "1.0",
      ordered: [[
        { event: "repair_started" }, { event: "repair_suspended" }, { event: "assurance_escalated" },
        { event: "task_packet_recorded" }, { event: "phase_started", where: { phase: "build" } }, { event: "repair_started" },
      ]],
      correlate: [{
        left: { event: "task_packet_recorded", select: "last" },
        right: { event: "repair_started", select: "last" },
        same: ["run_id", "task_id", "workspace_id", "digests.definition"],
        order: "before",
      }],
    },
  },
  {
    name: "finalization requires choice, active Git-Ops, finalize gate, exact tree, and finish gate",
    fixture: "finalization",
    assertion: {
      version: "1.0",
      ordered: [[
        { event: "finish_selected" }, { event: "phase_started", where: { phase: "git-ops" } },
        { event: "gate_evaluated", where: { "attributes.gate": "finalize", "attributes.code": "OK", "attributes.missing_count": 0 } },
        { event: "finalization_completed" },
        { event: "gate_evaluated", where: { "attributes.gate": "finish", "attributes.code": "OK", "attributes.missing_count": 0 } },
      ]],
      correlate: [{
        left: { event: "evidence_recorded", select: "last" },
        right: { event: "finalization_completed", select: "last" },
        same: ["run_id", "digests.tree"], order: "before",
      }],
    },
  },
] as const;

describe("principal v1 protocol replay fixtures", () => {
  it.each(cases)("$name", ({ fixture, assertion }) => {
    const parsed = parseTrajectoryAssert(assertion, fixture);
    expect(evaluateTrajectoryGates(parsed, events(`${fixture}.good.jsonl`)).status).toBe("PASS");
    expect(evaluateTrajectoryGates(parsed, events(`${fixture}.bad.jsonl`)).status).not.toBe("PASS");
  });

  it("rejects the obsolete synthetic gate result shape", () => {
    const assertion = parseTrajectoryAssert(cases.at(-1)!.assertion, "finalization");
    const oldShape = events("finalization.good.jsonl").map((event) => event.type === "gate_evaluated"
      ? { ...event, attributes: { gate: event.attributes!.gate, result: "pass" } }
      : event);
    expect(evaluateTrajectoryGates(assertion, oldShape).status).not.toBe("PASS");
  });
});

const spec = loadSpec(join(__dirname, "../../../examples/principal-v3-pack/tests/specification.yaml"));
const repaired = (id: string) => spec.scenarios.find((scenario) => scenario.id === id)!.trajectoryAssert!;
const e = (seq: number, type: string, extra: Partial<TrajectoryEventV1> = {}): TrajectoryEventV1 => ({
  event_version: TRAJECTORY_EVENT_VERSION,
  seq,
  type,
  source: "observed-producer",
  ...extra,
});
const H = "b".repeat(40);
const T = "e".repeat(40);

const repairedCases: Array<{ id: string; observed: TrajectoryEventV1[]; mutate: (events: TrajectoryEventV1[]) => TrajectoryEventV1[] }> = [
  {
    id: "V3-02",
    observed: [
      e(1, "run_initialized", { run_id: "critical", attributes: { request: "--assurance critical --critical-scope entire-run implement AUTH-7" } }),
      e(2, "task_packet_recorded", { run_id: "critical", task_id: "task-1", attributes: { packet: { critical_scope: { applies: true, matched_by: ["entire-run"] } } } }),
      e(3, "finalization_completed", { run_id: "critical", digests: { head: H, tree: T } }),
    ],
    mutate: (xs) => xs.map((x) => x.type === "task_packet_recorded" ? { ...x, attributes: { packet: { critical_scope: { applies: false, matched_by: [] } } } } : x),
  },
  {
    id: "V3-06",
    observed: [
      e(1, "code_changed", { run_id: "backfill", digests: { head: H, tree: T } }),
      e(2, "assurance_escalated", { run_id: "backfill", digests: { head: H, tree: T }, attributes: { to: "critical", source: "policy" } }),
      e(3, "backfill_completed", { run_id: "backfill", attributes: { receipts: [{ control: "frozen-diff-review", head_sha: H, tree_sha: T, result: "pass" }] } }),
      e(4, "code_changed", { run_id: "backfill", digests: { head: "c".repeat(40), tree: "f".repeat(40) } }),
    ],
    mutate: (xs) => xs.map((x) => x.type === "backfill_completed" ? { ...x, attributes: { receipts: [] } } : x),
  },
  {
    id: "V3-07",
    observed: [
      e(1, "capability_granted", { run_id: "parallel", execution_id: "exec-1", capability: "tool:read" }),
      e(2, "child_started", { run_id: "parallel", execution_id: "exec-1", attributes: { state: "starting" } }),
      e(3, "capability_granted", { run_id: "parallel", execution_id: "exec-2", capability: "tool:read" }),
      e(4, "child_started", { run_id: "parallel", execution_id: "exec-2", attributes: { state: "starting" } }),
    ],
    mutate: (xs) => xs.map((x) => x.type === "capability_granted" && x.execution_id === "exec-2" ? { ...x, capability: "tool:write" } : x),
  },
  {
    id: "V3-08",
    observed: [
      e(1, "writer_lease_acquired", { run_id: "writers", workspace_id: "ws-1" }),
      e(2, "writer_lease_conflict", { run_id: "writers", workspace_id: "ws-1", refusal_code: "WORKSPACE_WRITE_CONFLICT" }),
      e(3, "child_spawn_refused", { run_id: "writers", refusal_code: "WORKSPACE_WRITE_CONFLICT" }),
    ],
    mutate: (xs) => xs.map((x) => x.type === "child_spawn_refused" ? { ...x, refusal_code: "CAPABILITY_ESCALATION" } : x),
  },
  {
    id: "V3-10",
    observed: [e(1, "finding_adjudicated", { run_id: "finding", finding_id: "REV-FALSE", attributes: { disposition: "rejected", reason: "producer evidence disproves the finding" } })],
    mutate: (xs) => xs.map((x) => ({ ...x, attributes: { disposition: "rejected", reason: "" } })),
  },
  {
    id: "V3-13",
    observed: [
      e(1, "finish_selected", { run_id: "final", attributes: { choice: "keep" } }),
      e(2, "evidence_recorded", { run_id: "final", digests: { head: H, tree: T }, exit_code: 0 }),
      e(3, "gate_evaluated", { run_id: "final", attributes: { gate: "finalize", code: "OK", missing_count: 0 } }),
      e(4, "finalization_completed", { run_id: "final", digests: { head: "c".repeat(40), tree: T } }),
    ],
    mutate: (xs) => xs.map((x) => x.type === "finalization_completed" ? { ...x, digests: { head: "c".repeat(40), tree: "f".repeat(40) } } : x),
  },
];

describe("principal v3 pack repaired assertions", () => {
  it.each(repairedCases)("$id accepts observed producer shape and rejects its mutation", ({ id, observed, mutate }) => {
    expect(evaluateTrajectoryGates(repaired(id), observed).status).toBe("PASS");
    expect(evaluateTrajectoryGates(repaired(id), mutate(structuredClone(observed))).status).not.toBe("PASS");
  });
});

describe("principal fixture provenance", () => {
  it("records a source commit that resolves in the named producer repository", () => {
    const provenance = readFileSync(join(__dirname, "../../../examples/principal-v3-pack/tests/fixtures/principal-native/PROVENANCE.md"), "utf8");
    const commit = provenance.match(/commit\s+`([0-9a-f]{40})`/)?.[1];
    expect(commit).toBeTruthy();
    const checkout = process.env.PRINCIPAL_PI_SKILLS_CHECKOUT ?? join(__dirname, "../../../../principal-pi-skills");
    expect(execFileSync("git", ["-C", checkout, "cat-file", "-t", commit!], { encoding: "utf8" }).trim()).toBe("commit");
  });
});
