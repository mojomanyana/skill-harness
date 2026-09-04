import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cmdMutationTest, help } from "../src/cli.js";

afterEach(() => { vi.restoreAllMocks(); process.exitCode = 0; });

const REQUIRED_CASES = [
  "remove-required-event", "add-forbidden-tool-side-effect-approval", "reorder-transition",
  "substitute-workspace-id", "concurrent-writer", "approval-expired-or-mismatched",
  "evidence-before-change", "evidence-before-authority", "evidence-before-build-completion",
  "head-equal-tree-different", "command-receipt-nonzero", "remove-requirement-coverage",
  "mutate-superseded-task", "reuse-context-id", "mismatch-finalization-identity",
  "v3-blocked-critical-code", "v3-stale-gate-must-block", "v3-finalize-gate-must-be-ok",
  "v3-discard-requires-explicit-request", "v3-side-effect-approval-and-gate", "v3-governed-spawn-started",
  "schema-v3-missing-observation-rejected", "schema-v3-panel-divergence-rejected",
  "schema-v3-missing-criterion-rejected", "schema-v3-per-repetition-objective-rejected",
  "schema-v3-top-level-verdict-rejected", "schema-v3-unsupported-pass-rejected", "schema-v3-adjudication-state-rejected", "delivery-zero-not-measured", "delivery-duplicate-not-measured", "delivery-unobservable-error",
  "delivery-objective-suppresses-judge", "delivery-error-suppresses-adjudication", "observer-normalization-scope", "observer-contract-binding", "observer-mac-tamper-rejected",
  "observer-extension-forgery-rejected", "observer-argv-wiring", "screen-ceiling-boundary",
  "screen-undelivered-filter", "screen-suspect-filter", "screen-unsupported-pass-filter",
] as const;

describe("mutation-test command", () => {
  it("is free/offline and prints every required mutation class", async () => {
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((value) => lines.push(String(value)));
    await cmdMutationTest();
    const output = lines.join("\n");
    for (const id of REQUIRED_CASES) expect(output).toContain(id);
    const detected = output.match(/(\d+)\/(\d+) mutations detected/);
    expect(detected).not.toBeNull();
    expect(Number(detected![1])).toBe(REQUIRED_CASES.length);
    expect(Number(detected![2])).toBe(REQUIRED_CASES.length);
    expect(output).toContain("no model or judge calls");
    expect(process.exitCode ?? 0).toBe(0);
  });

  it("runs from outside the source checkout like an installed free command", async () => {
    const cwd = process.cwd(), elsewhere = mkdtempSync(join(tmpdir(), "mutation-installed-"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    try { process.chdir(elsewhere); await expect(cmdMutationTest()).resolves.toBeUndefined(); expect(process.exitCode ?? 0).toBe(0); }
    finally { process.chdir(cwd); rmSync(elsewhere, { recursive: true, force: true }); }
  });

  it("is documented beside compare in CLI help", () => {
    expect(help()).toContain("mutation-test");
    expect(help()).toContain("compare <skill|all>");
  });
});
