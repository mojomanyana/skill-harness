import * as adapters from "@skill-harness/adapters";
import { learningJournal } from "../../adapters/src/learning-journal.js";

export const DASHBOARD_HARNESS_SOURCE = "127b349310dd8f28e5d6b12148a063fce66a77dd";
export const DASHBOARD_HARNESS_BRIDGE = Symbol.for("skill-harness.dashboard-host.v1");

const names = [
  "learningJournal", "createTrustLifecycle", "openTrustLifecycle", "trustPolicyDigest",
  "archivePolicyBinding", "ingestPolicySource", "readArchiveCheckpoint", "readArchiveSource",
  "retainArchiveSource", "captureArchivedWorkSignals", "readRetainedExecution", "projectRetainedExecutions",
  "createWorkCaseReviewer", "createWorkSignalReviewer", "retainBlindIntervention", "openBlindIntervention",
] as const;

export interface DashboardHarnessBridge {
  version: "skill-harness-dashboard-bridge-v1";
  sourceCommit: typeof DASHBOARD_HARNESS_SOURCE;
  api: Readonly<Record<(typeof names)[number], (...args: any[]) => any>>;
}

/** Same-process handoff for the loaded extension. This identifies bundled source; it is not human authentication. */
export function publishDashboardHarnessBridge(target: Record<PropertyKey, unknown> = globalThis): DashboardHarnessBridge {
  const old = target[DASHBOARD_HARNESS_BRIDGE];
  if (old) {
    if ((old as DashboardHarnessBridge).version === "skill-harness-dashboard-bridge-v1" &&
        (old as DashboardHarnessBridge).sourceCommit === DASHBOARD_HARNESS_SOURCE) return old as DashboardHarnessBridge;
    throw new Error("dashboard harness bridge already published by another provider");
  }
  const api = Object.freeze(Object.fromEntries(names.map(name => {
    const value = name === "learningJournal" ? learningJournal : adapters[name];
    if (typeof value !== "function") throw new Error(`dashboard harness export ${name} is unavailable`);
    return [name, value];
  }))) as DashboardHarnessBridge["api"];
  const bridge = Object.freeze({ version: "skill-harness-dashboard-bridge-v1" as const, sourceCommit: DASHBOARD_HARNESS_SOURCE, api });
  Object.defineProperty(target, DASHBOARD_HARNESS_BRIDGE, { value: bridge, enumerable: false, configurable: false, writable: false });
  return bridge;
}
