import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "../../../schemas");

describe("versioned public schemas", () => {
  it.each([
    ["specification-v1.schema.json", "https://skill-harness.dev/schemas/specification-v1.schema.json"],
    ["results-v2.schema.json", "https://skill-harness.dev/schemas/results-v2.schema.json"],
    ["results-v3.schema.json", "https://skill-harness.dev/schemas/results-v3.schema.json"],
  ])("ships parseable %s", (file, id) => {
    const schema = JSON.parse(readFileSync(join(root, file), "utf8"));
    expect(schema.$schema).toContain("2020-12");
    expect(schema.$id).toBe(id);
  });

  it("requires self-screening observations in results v3 while keeping v2 valid (breaks if schema bump becomes cosmetic)", () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    const v2Schema = JSON.parse(readFileSync(join(root, "results-v2.schema.json"), "utf8"));
    const v3Schema = JSON.parse(readFileSync(join(root, "results-v3.schema.json"), "utf8"));
    const v2 = { schema: 2, skill: "x", harness: "pi", model: "p:m", judge: { provider: "p", model: "j" }, timestamp: "t", label: null, mode: "red", effective_grade: { passed: 0, total: 0, pct: 0, letter: "-", ship: false, note: "" }, scenarios: [] };
    expect(ajv.compile(v2Schema)(v2)).toBe(true);
    const validateV3 = ajv.compile(v3Schema);
    expect(validateV3({ ...v2, schema: 3 })).toBe(false);
    const h = "a".repeat(64);
    const v3 = { ...v2, schema: 3, subject_invocations: [{ scenario_id: "A1", repetition: 0, prompt: { capture_version: "prompt-provenance-v1", request_index: 0, raw_sha256: h, normalized_sha256: h, normalization_rule: "cwd-line-v1", bytes: 1, contract_sha256: h, contract_bytes: 1, contract_occurrences: 0, mechanism: "none", status: "PASS" } }], scenarios: [{ id: "A1", criterion_count: 1, judge_verdict: "PASS", judge_reason: "ok", suspect: false, override: null, note: "", objective: { status: "PASS", assertions: [{ kind: "skill_delivered", status: "PASS", detail: "observed" }] }, rep_judgments: [{ repetition: 0, recorded_verdict: "PASS", objective: { status: "PASS", assertions: [{ kind: "skill_delivered", status: "PASS", detail: "observed" }] }, judgments: [{ ordinal: 1, judge: { provider: "p", model: "j" }, verdict: "PASS", reason: "ok", suspect: false, criteria: [{ index: 1, verdict: "PASS", reason: "ok" }] }] }] }] };
    expect(validateV3(v3), JSON.stringify(validateV3.errors)).toBe(true);
    const noInvocations = structuredClone(v3); delete (noInvocations as any).subject_invocations;
    expect(validateV3(noInvocations)).toBe(false);
    const noStatus = structuredClone(v3); delete (noStatus as any).subject_invocations[0].prompt.status;
    expect(validateV3(noStatus)).toBe(false);
    const noRepObjective = structuredClone(v3); delete (noRepObjective as any).scenarios[0].rep_judgments[0].objective;
    expect(validateV3(noRepObjective)).toBe(false);
    const noScenarioObjective = structuredClone(v3); delete (noScenarioObjective as any).scenarios[0].objective;
    expect(validateV3(noScenarioObjective)).toBe(false);
  });

});
