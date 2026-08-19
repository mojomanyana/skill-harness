import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deserializeTrajectoryEvents, evaluateTrajectoryGates, parseTrajectoryAssert } from "../src/trajectory-gates.js";

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
        { event: "gate_evaluated", where: { "attributes.gate": "finalize", "attributes.result": "pass" } },
        { event: "finalization_completed" },
        { event: "gate_evaluated", where: { "attributes.gate": "finish", "attributes.result": "pass" } },
      ]],
      correlate: [{
        left: { event: "gate_evaluated", where: { "attributes.gate": "finalize" }, select: "last" },
        right: { event: "finalization_completed", select: "last" },
        same: ["run_id", "digests.head", "digests.tree"], order: "before",
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
});
