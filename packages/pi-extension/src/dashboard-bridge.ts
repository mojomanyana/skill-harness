import { learningJournal } from "../../adapters/src/learning-journal.js";
import { createTrustLifecycle, openTrustLifecycle, trustPolicyDigest } from "../../adapters/src/trust-lifecycle.js";
import { archivePolicyBinding, ingestPolicySource } from "../../adapters/src/archive-policy.js";
import { readArchiveCheckpoint } from "../../adapters/src/archive-checkpoint.js";
import { readArchiveSource, retainArchiveSource } from "../../adapters/src/evidence-archive.js";
import { captureArchivedWorkSignals } from "../../adapters/src/archived-work.js";
import { readRetainedExecution, projectRetainedExecutions } from "../../adapters/src/execution-retention-archive.js";
import { createWorkCaseReviewer, createWorkSignalReviewer } from "../../adapters/src/work-case-review.js";
import { retainBlindIntervention, openBlindIntervention } from "../../adapters/src/blind-intervention.js";
import { retainLearningLifecycle, readLearningLifecycle } from "../../adapters/src/learning-lifecycle.js";

export const DASHBOARD_HARNESS_SOURCE = "28b55d40a64ce7af8ed23410a137f2e3a075e522";
export const DASHBOARD_HARNESS_BRIDGE = Symbol.for("skill-harness.dashboard-host.v1");

const functions = {
  learningJournal, createTrustLifecycle, openTrustLifecycle, trustPolicyDigest,
  archivePolicyBinding, ingestPolicySource, readArchiveCheckpoint, readArchiveSource,
  retainArchiveSource, captureArchivedWorkSignals, readRetainedExecution, projectRetainedExecutions,
  createWorkCaseReviewer, createWorkSignalReviewer, retainBlindIntervention, openBlindIntervention,
  retainLearningLifecycle, readLearningLifecycle,
} as const;

export interface DashboardHarnessBridge {
  version: "skill-harness-dashboard-bridge-v1";
  sourceCommit: typeof DASHBOARD_HARNESS_SOURCE;
  api: Readonly<typeof functions>;
}

/** Same-process handoff for the loaded extension. This identifies bundled source; it is not human authentication. */
export function publishDashboardHarnessBridge(target: Record<PropertyKey, unknown> = globalThis): DashboardHarnessBridge {
  const old = target[DASHBOARD_HARNESS_BRIDGE];
  if (old) {
    if ((old as DashboardHarnessBridge).version === "skill-harness-dashboard-bridge-v1" &&
        (old as DashboardHarnessBridge).sourceCommit === DASHBOARD_HARNESS_SOURCE) return old as DashboardHarnessBridge;
    throw new Error("dashboard harness bridge already published by another provider");
  }
  const api = Object.freeze({ ...functions });
  const bridge = Object.freeze({ version: "skill-harness-dashboard-bridge-v1" as const, sourceCommit: DASHBOARD_HARNESS_SOURCE, api });
  Object.defineProperty(target, DASHBOARD_HARNESS_BRIDGE, { value: bridge, enumerable: false, configurable: false, writable: false });
  return bridge;
}
