import { expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { inspectEvalAuthoring } from "../src/authoring-preflight.js";
import { loadSpec } from "../src/spec.js";
import { lintSkill, failsGate } from "../src/lint.js";

function withSpec(check: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "authoring-"));
  try {
    mkdirSync(join(dir, "tests"));
    writeFileSync(join(dir, "SKILL.md"), "---\nname: demo\n---\nRead the applicable source.\n");
    writeFileSync(join(dir, "tests/specification.yaml"), JSON.stringify({
      skill: "demo", judge_persona: "Check behavior.", ship_bar: { total: 1, min_pass: 1 },
      scenarios: [{ id: "A", title: "Lookup", turns: ["Read the relevant source."], checklist: ["Cite release.txt line 1."],
        assert: { trace: { require_calls: [{ tool: "read", count: { min: 2 }, args: { path: { matches: "(^|/)release.txt$" } } }], forbid_calls: ["write"] } } }],
    }));
    check(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

it("surfaces brittle authoring contracts through lint without making them CI errors", () => withSpec(dir => {
  const findings = lintSkill(dir);
  expect(findings.filter(f => f.code === "authoring")).toHaveLength(3);
  expect(findings.some(failsGate)).toBe(false);
  // Genuine schema errors must still fail the same gate.
  writeFileSync(join(dir, "tests/specification.yaml"), "skill: demo\n");
  expect(lintSkill(dir).some(failsGate)).toBe(true);
}));

it("only makes capability-dependent claims for an explicitly supplied profile", () => withSpec(dir => {
  const spec = loadSpec(join(dir, "tests/specification.yaml"));
  const profile = { tools: ["read"], fixtureFiles: () => ["release.txt"] };
  const codes = () => inspectEvalAuthoring(spec, profile).map(f => f.code);
  expect(codes()).toContain("INPUT_DISCOVERY");
  expect(codes()).toContain("UNAVAILABLE_FORBIDDEN_TOOL");
  spec.scenarios[0].turns = ["Read release.txt."];
  expect(codes()).not.toContain("INPUT_DISCOVERY");
  expect(inspectEvalAuthoring(spec).map(f => f.code)).not.toContain("UNAVAILABLE_FORBIDDEN_TOOL");
  profile.tools.push("find", "write");
  expect(codes()).not.toContain("UNAVAILABLE_FORBIDDEN_TOOL");
}));

it("uses the actual declared tool filter and fixture names in ordinary lint", () => withSpec(dir => {
  const path = join(dir, "tests/specification.yaml");
  const raw = JSON.parse(readFileSync(path, "utf8"));
  mkdirSync(join(dir, "tests/fixture"));
  writeFileSync(join(dir, "tests/fixture/release.txt"), "public fixture");
  raw.scenarios[0].env = { tools: ["read"], workspace: "fixture:fixture" };
  writeFileSync(path, JSON.stringify(raw));
  let findings = lintSkill(dir);
  expect(findings.some(f => f.message.startsWith("INPUT_DISCOVERY"))).toBe(true);
  expect(findings.some(failsGate)).toBe(false);
  raw.scenarios[0].env.tools = [];
  writeFileSync(path, JSON.stringify(raw));
  findings = lintSkill(dir);
  expect(findings.some(f => f.message.startsWith("UNAVAILABLE_REQUIRED_TOOL") && failsGate(f))).toBe(true);
}));
