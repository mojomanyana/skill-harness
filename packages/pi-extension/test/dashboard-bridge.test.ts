import { describe, expect, it } from "vitest";
import { DASHBOARD_HARNESS_SOURCE, publishDashboardHarnessBridge } from "../src/dashboard-bridge.js";

describe("dashboard harness bridge", () => {
  it("publishes the exact loaded producer API once without replacing another provider", () => {
    const target: Record<PropertyKey, unknown> = {};
    const first = publishDashboardHarnessBridge(target);
    expect(first).toMatchObject({ version: "skill-harness-dashboard-bridge-v1", sourceCommit: DASHBOARD_HARNESS_SOURCE });
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.api)).toBe(true);
    for (const name of ["learningJournal", "createTrustLifecycle", "captureArchivedWorkSignals", "createWorkSignalReviewer"]) {
      expect(typeof (first.api as Record<string, unknown>)[name]).toBe("function");
    }
    expect(publishDashboardHarnessBridge(target)).toBe(first);
    expect(() => publishDashboardHarnessBridge({ [Symbol.for("skill-harness.dashboard-host.v1")]: {} })).toThrow(/already published/);
  });
});
