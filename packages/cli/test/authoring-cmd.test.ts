import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { prepareCalibration, runSkillModel, loadSpec, type CalibrationControl, type HarnessAdapter } from "@skill-harness/core";
import { cmdCalibrate, cmdPreflight, cmdDiagnose, main } from "../src/cli.js";

const directories: string[] = [];
afterEach(() => { vi.restoreAllMocks(); process.exitCode = 0; for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });

test("separate-repo preflight and explicit calibration use the same authored spec without subject calls", async () => {
  const root = mkdtempSync(join(tmpdir(), "harness-author-cli-")); directories.push(root);
  const skills = join(root, "skills"), specs = join(root, "evals"), tests = join(specs, "lookup", "tests");
  mkdirSync(join(skills, "lookup"), { recursive: true }); mkdirSync(tests, { recursive: true });
  writeFileSync(join(skills, "lookup", "SKILL.md"), "---\nname: lookup\ndescription: Answer a supplied fact.\n---\nUse the supplied evidence.");
  const specPath = join(tests, "specification.yaml");
  writeFileSync(specPath, JSON.stringify({ skill: "lookup", judge_persona: "Check accuracy", ship_bar: { total: 1, min_pass: 1 }, scenarios: [
    { id: "A1", title: "Supplied fact", turns: ["Capacity is twelve. What is the capacity?"], env: { tools: [] }, checklist: ["Reports twelve."] },
  ] }));
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  await cmdPreflight({ _: ["lookup"], flags: { skills, specs }, multi: {} });
  expect(JSON.parse(String(log.mock.calls.at(-1)![0]))).toMatchObject({ status: "checked", providerCalls: 0 });
  const controls = [
    { id: "correct", expected: "PASS", kind: "authored", answer: "12" },
    { id: "wrong", expected: "FAIL", kind: "authored", answer: "99" },
    { id: "equivalent", expected: "PASS", kind: "equivalent", equivalentTo: "correct", answer: "Twelve." },
  ].map(c => ({ ...c, scenarioId: "A1", transcript: `>>> USER:\nCapacity is twelve. What is the capacity?\n\n<<< ASSISTANT:\n${c.answer}\n`, rationale: "Compare with the supplied capacity.", review: { status: "accepted", by: "operator" } })) as CalibrationControl[];
  const prepared = prepareCalibration({ specPath, controls });
  let calls = 0;
  const adapter: HarnessAdapter = { name: "pi", available: async () => true, run: async () => { throw Error("No subject calls"); }, judge: async () => {
    const vote = controls[calls++].expected;
    return JSON.stringify({ verdict: vote, reason: "fixture", votes: [{ criterion: 1, vote, reason: "fixture" }] });
  } };
  const args = { _: [prepared.manifestPath], flags: {}, multi: {} };
  await cmdCalibrate(args, adapter);
  expect(JSON.parse(String(log.mock.calls.at(-1)![0]))).toMatchObject({ status: "validated", providerCalls: 0, cases: 3 });
  expect(calls).toBe(0);
  await expect(cmdCalibrate({ ...args, flags: { run: true } }, adapter)).rejects.toThrow(/explicitly selected/);
  expect(calls).toBe(0);
  const out = join(tests, "calibration-results");
  await cmdCalibrate({ ...args, flags: { run: true, judge: "local:fixture-judge", out } }, adapter);
  expect(JSON.parse(String(log.mock.calls.at(-1)![0]))).toMatchObject({ status: "matched", judgeCalls: 3, modelQualityScore: false });
  expect(JSON.parse(readFileSync(join(out, "inputs.json"), "utf8")).manifestSha256).toBe(prepared.manifestSha256);
  expect(calls).toBe(3);
});

test("CLI skill creation points to the current Pi model instead of launching another author", async () => {
  await expect(main(["create", "social media manager"])).rejects.toThrow(/current Pi model/);
});

test("diagnose text and JSON expose the same mixed failure without regrading or changing a saved result", async () => {
  const root = mkdtempSync(join(tmpdir(), "harness-diagnose-cli-")); directories.push(root);
  const skillDir = join(root, "lookup"), tests = join(skillDir, "tests");
  mkdirSync(tests, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), "---\nname: lookup\ndescription: Answer a supplied fact.\n---\nUse evidence.");
  const specPath = join(tests, "specification.yaml");
  writeFileSync(specPath, JSON.stringify({ skill: "lookup", judge_persona: "Check the supplied facts", ship_bar: { total: 1, min_pass: 1 },
    scenarios: [{ id: "A1", title: "Known fact and missing next step", turns: ["Capacity is twelve. What is it?"],
      checklist: ["Reports twelve.", "Does not invent a guarantee and identifies what would settle the missing guarantee."],
      criterion_dimensions: ["task-correctness", "mixed"] }] }));
  let calls = 0;
  const result = await runSkillModel({ skillDir, specPath, spec: loadSpec(specPath), model: { provider: "local", model: "subject" }, modelToken: "local:subject", judge: { provider: "local", model: "judge" }, mode: "force", timestamp: "2026-10-28T12:00:00.000Z",
    adapter: { name: "pi", available: async () => true,
      run: async () => { calls++; return ">>> USER:\nCapacity is twelve. What is it?\n\n<<< ASSISTANT:\nTwelve; a guarantee is unknown.\n"; },
      judge: async () => { calls++; return JSON.stringify({ verdict: "FAIL", reason: "Missing next evidence.", votes: [
        { criterion: 1, vote: "PASS", reason: "Correct capacity." }, { criterion: 2, vote: "FAIL", reason: "Missing next evidence." },
      ] }); } } });
  const before = readFileSync(join(result.runDir, "results.yaml"));
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const args = { _: [result.runDir], flags: { skills: root }, multi: {} };
  await cmdDiagnose(args);
  const json = JSON.parse(String(log.mock.calls.at(-1)![0]));
  expect(json.criterionDimensions.scenarios[0].counts).toMatchObject({ "task-correctness": { pass: 1, fail: 0 }, mixed: { pass: 0, fail: 1 } });
  await cmdDiagnose({ ...args, flags: { ...args.flags, format: "text" } });
  const text = String(log.mock.calls.at(-1)![0]);
  expect(text).toContain("recorded FAIL");
  expect(text).toContain("task-correctness: 1 PASS, 0 FAIL, 0 unavailable");
  expect(text).toContain("mixed: 0 PASS, 1 FAIL, 0 unavailable");
  expect(text).toContain("not passing answers");
  expect(text).not.toContain("method-completeness: 1");
  expect(readFileSync(join(result.runDir, "results.yaml"))).toEqual(before);
  expect(calls).toBe(2); // Only the scripted setup, never diagnosis.
  await expect(cmdDiagnose({ ...args, flags: { ...args.flags, format: "invalid" } })).rejects.toThrow(/json or text/);
});
