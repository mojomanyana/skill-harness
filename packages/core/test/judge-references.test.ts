import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { afterEach, expect, test } from "vitest";
import { parseSpec } from "../src/spec.js";
import { buildJudgePrompt, prepareJudgePrompt } from "../src/grade.js";
import { resolveJudgeReferences } from "../src/judge-references.js";
import { rubricDigest, sourceHashes, stimulusDigest, currentHashFor } from "../src/sources.js";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const document = () => ({ skill: "demo", judge_persona: "judge", ship_bar: { total: 1, min_pass: 1 }, scenarios: [{
  id: "A1", title: "source", turns: ["Read source.txt"], checklist: ["Matches source."], judge_evidence: "response", judge_references: ["source.txt"], env: { tools: ["read"] },
}] });
test("the declarative evidence and tool profile roundtrip through parser/schema, with invalid paths refused", () => {
  const doc = document();
  const schema = JSON.parse(readFileSync(new URL("../../../schemas/specification-v1.schema.json", import.meta.url), "utf8"));
  expect(new Ajv2020({ strict: true }).compile(schema)(doc)).toBe(true);
  expect(parseSpec(JSON.stringify(doc), "test").scenarios[0]).toMatchObject({ judgeEvidence: "response", judgeReferences: ["source.txt"], tools: ["read"] });
  for (const path of ["../secret", "C:/secret", "/secret", "a\\secret", "a/../secret"]) {
    doc.scenarios[0].judge_references = [path];
    expect(() => parseSpec(JSON.stringify(doc), "test")).toThrow(/judge_references/);
  }
  doc.scenarios[0].judge_references = ["source.txt"];
  doc.scenarios[0].env.tools = ["read,bash"];
  expect(() => parseSpec(JSON.stringify(doc), "test")).toThrow(/env.tools/);
});
test("selected reference contents feed the prompt and rubric identity without becoming subject stimulus", () => {
  const root = mkdtempSync(join(tmpdir(), "harness-reference-")); dirs.push(root);
  writeFileSync(join(root, "source.txt"), "A known fact.");
  writeFileSync(join(root, "private.txt"), "DO NOT INCLUDE");
  writeFileSync(join(root, "SKILL.md"), "Skill.");
  const scenario = parseSpec(JSON.stringify(document()), "test").scenarios[0];
  const input = { skill: "demo", persona: "judge", scenario, transcript: "answer" };
  expect(() => buildJudgePrompt(input)).toThrow(/resolved/);
  const prompt = prepareJudgePrompt(input, root);
  expect(prompt).toContain("A known fact.");
  expect(prompt).not.toContain("DO NOT INCLUDE");
  const first = rubricDigest(scenario, root);
  const stimulus = stimulusDigest(scenario);
  writeFileSync(join(root, "source.txt"), "An updated fact.");
  expect(rubricDigest(scenario, root)).not.toBe(first);
  expect(stimulusDigest(scenario)).toBe(stimulus);
  const ctx = { skillDir: root, specDir: root, scenarios: [scenario], judgePersona: "judge" };
  expect(sourceHashes(ctx)["rubric:A1"]).toBe(rubricDigest(scenario, root));
  rmSync(join(root, "source.txt"));
  expect(currentHashFor("rubric:A1", ctx)).toBeNull();
  expect(() => prepareJudgePrompt(input, root)).toThrow();
});
test("bounded references reject binary/oversized content and response tasks never get code-diff priority", () => {
  const root = mkdtempSync(join(tmpdir(), "harness-reference-")); dirs.push(root);
  const scenario = parseSpec(JSON.stringify(document()), "test").scenarios[0];
  writeFileSync(join(root, "source.txt"), Buffer.from([0xff, 0xfe]));
  expect(() => resolveJudgeReferences(scenario, root)).toThrow();
  writeFileSync(join(root, "source.txt"), "x".repeat(65_537));
  expect(() => resolveJudgeReferences(scenario, root)).toThrow(/65536/);
  const base = { ...scenario, judgeReferences: undefined, mode: "seeded" as const };
  const input = { skill: "demo", persona: "judge", scenario: base, transcript: ">>> USER:\nx\n<<< ASSISTANT:\nanswer\n=== SEEDED GATES ===\n=== STAGED DIFF ===\n+code" };
  expect(buildJudgePrompt(input)).not.toContain("Grade what the diff shows the code DOES");
  expect(buildJudgePrompt({ ...input, scenario: { ...base, judgeEvidence: "code", mode: "inline" } })).toContain("Grade what the diff shows the code DOES");
  expect(buildJudgePrompt({ ...input, transcript: input.transcript.replace("+code", "(empty — the model left no staged changes)"), scenario: { ...base, judgeEvidence: undefined } })).not.toContain("Grade what the diff shows the code DOES");
});
