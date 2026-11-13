import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCalibration, parseSpec, prepareCalibration } from "@skill-harness/core";
import { evidenceReviewPattern } from "../src/evidence-review-pattern.js";
import { authoringReference } from "../src/authoring-reference.js";
import { skillAuthorTool } from "../src/authoring.js";
import type { CmdCtx } from "../src/commands.js";

const roots: string[] = [];
const root = () => { const dir = mkdtempSync(join(tmpdir(), "harness-evidence-pattern-")); roots.push(dir); return dir; };
afterEach(() => { vi.unstubAllGlobals(); for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const packet = (id: string) => JSON.parse(evidenceReviewPattern().specification.scenarios.find(s => s.id === id)!.turns[0].split("Evidence packet: ")[1]);

it("keeps the optional pattern discoverable without adding its full controls to ordinary reference calls", async () => {
  const cwd = root(); const fetch = vi.fn(() => { throw new Error("No network allowed"); }); vi.stubGlobal("fetch", fetch);
  const ctx: CmdCtx = { cwd, hasUI: false, ui: { notify: vi.fn() } };
  const ordinary = (await skillAuthorTool.execute("ordinary", { action: "reference" }, new AbortController().signal, undefined, ctx)).details as any;
  expect(ordinary.patterns.map((p: any) => p.id)).toContain("evidence-review");
  expect(ordinary).not.toHaveProperty("selectedPattern");
  const selected = (await skillAuthorTool.execute("selected", { action: "reference", pattern: "evidence-review" }, new AbortController().signal, undefined, ctx)).details as any;
  expect(selected).toMatchObject({ readOnly: true, providerCalls: 0, selectedPattern: { labelStatus: "proposed", modelQualityEvaluated: false } });
  expect(selected.schemaIdentity).toEqual(ordinary.schemaIdentity);
  expect(readdirSync(cwd)).toEqual([]);
  expect(fetch).not.toHaveBeenCalled();
  selected.selectedPattern.specification.scenarios[0].turns[0] = "caller mutation";
  expect(authoringReference("evidence-review").selectedPattern!.specification.scenarios[0].turns[0]).not.toBe("caller mutation");
  expect(() => authoringReference("unknown" as never)).toThrow("Unknown authoring reference pattern");
});

it("uses the existing parser and calibration binding, with every label still proposed and no execution evidence", () => {
  const dir = root(); const pattern = evidenceReviewPattern();
  const specPath = join(dir, "specification.yaml"); writeFileSync(specPath, JSON.stringify(pattern.specification));
  const parsed = parseSpec(JSON.stringify(pattern.specification), "evidence-review-pattern");
  expect(parsed.scenarios).toHaveLength(8);
  expect(parsed.scenarios.every(s => s.judgeEvidence === "response" && s.tools?.length === 0)).toBe(true);
  expect(pattern.requirements.flatMap(r => r.scenarios)).toEqual(parsed.scenarios.map(s => s.id));
  const prepared = prepareCalibration({ specPath, controls: pattern.proposedControls });
  expect(prepared).toMatchObject({ ready: false, calibrationScope: "answer-judge", executionGates: "not-evaluated" });
  expect(prepared.controls).toHaveLength(26);
  expect(prepared.issues).toHaveLength(26);
  expect(prepared.issues.every(issue => issue.includes("expected label needs author review"))).toBe(true);
  expect(prepared.controls.every(c => c.executionEvidence === "unknown" && c.review.status === "proposed")).toBe(true);
  for (const scenario of parsed.scenarios) {
    const controls = prepared.controls.filter(c => c.scenarioId === scenario.id && !c.id.endsWith("-invented-execution"));
    expect(controls.map(c => [c.kind, c.expected])).toEqual([["authored", "PASS"], ["authored", "FAIL"], ["equivalent", "PASS"]]);
    expect(controls[1].expectedCriteria).toEqual(["FAIL", "PASS"]);
    // Proposed criterion expectations and rationales never become judge authority.
    expect(controls[0].prompt).not.toContain(pattern.proposedControls.find(c => c.id === controls[0].id)!.rationale);
    expect(controls[0].prompt).not.toContain("expectedCriteria");
  }
  const invented = prepared.controls.filter(c => c.id.endsWith("-invented-execution"));
  expect(invented.map(c => c.id)).toEqual(["E1-invented-execution", "V1-invented-execution"]);
  expect(invented.every(c => c.kind === "authored" && c.expected === "FAIL")).toBe(true);
  expect(invented.map(c => c.expectedCriteria)).toEqual([["PASS", "FAIL"], ["PASS", "FAIL"]]);
  expect(prepared.controls.filter(c => c.expected === "PASS")).toHaveLength(16);
  expect(prepared.controls.filter(c => c.expected === "FAIL")).toHaveLength(10);
  const changed = structuredClone(pattern.specification); changed.scenarios[0].turns[0] += " Changed endpoint.";
  writeFileSync(specPath, JSON.stringify(changed));
  expect(() => loadCalibration(prepared.manifestPath)).toThrow("specification changed");
});

it("keeps arithmetic, endpoint and condition counterexamples independent rather than using arithmetic as approval", () => {
  const endpoint = packet("E1"), baseline = packet("E2"), conditions = packet("E3"), wrong = packet("E4"), valid = packet("V1");
  for (const p of [endpoint, baseline, conditions, valid]) {
    expect([median(p.beforeMs), median(p.afterMs)]).toEqual(p.reportedMedians);
  }
  expect(endpoint.beforeEndpoint).not.toBe(endpoint.afterEndpoint);
  expect(baseline.baseline).toContain("missing");
  expect(conditions.beforeConditions).not.toBe(conditions.afterConditions);
  expect(median(wrong.afterMs)).toBe(90);
  expect(wrong.reportedMedians[1]).toBe(20);
  expect(wrong.reportedReductionPercent).toBe(83.3);
  expect((median(valid.beforeMs) - median(valid.afterMs)) / median(valid.beforeMs)).toBe(0.25);
  expect(valid.baseline).toContain("immutable archives");
  expect(valid.endpoint).toContain("normal panel-open path");
});

it("retains normal-path, fresh-input and ownership contrasts, without making a helper's passing result authoritative", () => {
  const revision = packet("T1"), fresh = packet("T2"), ownership = packet("T3");
  expect(revision.normalPath).toContain("key contains no revision");
  expect(revision.testPath).toContain("unconditionally");
  expect(fresh.writer).toContain("without packing");
  expect(fresh.testedFixture).toContain("already has packed");
  const prefix = ownership.cleanup.split("starts with ")[1];
  const existingName = ownership.existingObject.split("named ")[1];
  expect(existingName.startsWith(prefix)).toBe(true);
  // The controls evaluate a review of supplied facts, not the underlying program's real execution.
  expect(evidenceReviewPattern().proposedControls.filter(c => ["T1", "T2", "T3"].includes(c.scenarioId)).every(c => c.provenance?.startsWith("Authored synthetic"))).toBe(true);
});
