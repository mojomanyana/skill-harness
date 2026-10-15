import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { loadCalibration, prepareCalibration, runCalibration, type CalibrationControl } from "../src/calibration.js";
import { prepareJudgePrompt } from "../src/grade.js";
import { unavailableExecution } from "../src/judge-evidence.js";
import type { HarnessAdapter } from "../src/adapters/types.js";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const transcript = (answer: string) => `>>> USER:\nWhat is the capacity?\n\n<<< ASSISTANT:\n${answer}\n\n=== SEEDED GATES ===\n\n=== STAGED DIFF ===\n  (empty — the model left no staged changes)`;
function setup() {
  const dir = mkdtempSync(join(tmpdir(), "harness-calibration-")); dirs.push(dir);
  const specPath = join(dir, "specification.yaml");
  writeFileSync(join(dir, "release.txt"), "Capacity: 12\n");
  writeFileSync(specPath, JSON.stringify({ skill: "lookup", judge_persona: "Check the cited evidence", ship_bar: { total: 1, min_pass: 1 }, scenarios: [{
    id: "A1", title: "Capacity", mode: "seeded", fixture: "fixture", judge_evidence: "response", judge_references: ["release.txt"],
    turns: ["What is the capacity?"], checklist: ["Gives the capacity supported by release.txt."],
  }] }));
  const controls: CalibrationControl[] = [
    { id: "supported", scenarioId: "A1", expected: "PASS", kind: "authored", transcript: transcript("12 (release.txt)."), rationale: "Matches the selected source." },
    { id: "invented", scenarioId: "A1", expected: "FAIL", kind: "authored", transcript: transcript("99."), rationale: "Contradicts the source." },
    { id: "equivalent", scenarioId: "A1", expected: "PASS", kind: "equivalent", equivalentTo: "supported", transcript: transcript("release.txt states capacity twelve."), rationale: "Different wording expresses the same fact." },
  ].map(control => ({ ...control, review: { status: "accepted", by: "operator" } })) as CalibrationControl[];
  return { dir, specPath, controls };
}
const judge = { provider: "openai-codex", model: "chosen-at-run-time" };
function adapter(replies: string[], prompts: string[] = []): HarnessAdapter {
  let next = 0;
  return { name: "pi", available: async () => true, run: async () => { throw new Error("No subject call allowed"); }, judge: async req => { prompts.push(req.prompt); return replies[next++]; } };
}
const reply = (verdict: "PASS" | "FAIL") => JSON.stringify({ verdict, reason: "control", votes: [{ criterion: 1, vote: verdict, reason: "control" }] });

test("authoring computes bindings and calibration preserves the exact production prompt including empty seeded framing", async () => {
  const { dir, specPath, controls } = setup();
  const loaded = prepareCalibration({ specPath, controls });
  expect(loaded.ready).toBe(true);
  const input = { skill: loaded.spec.skill, persona: loaded.spec.judge_persona, scenario: loaded.spec.scenarios[0], transcript: controls[0].transcript,
    execution: unavailableExecution("This control has no bound execution trace; evaluate its supplied response/reference only.") };
  expect(loaded.controls[0].prompt).toBe(prepareJudgePrompt(input, dir));
  expect(loaded.controls[0].prompt).toContain("=== STAGED DIFF ===");
  expect(loaded.controls[0].prompt).not.toContain("Grade what the diff shows the code DOES");
  const prompts: string[] = [];
  const result = await runCalibration(loaded, { adapter: adapter([reply("PASS"), reply("FAIL"), reply("PASS")], prompts), judge, output: join(dir, "results") });
  expect(result).toMatchObject({ status: "matched", matched: 3, judgeCalls: 3, completed: 3, falsePasses: [], falseFailures: [], modelQualityScore: false });
  expect(prompts).toEqual(loaded.controls.map(control => control.prompt));
  const request = JSON.parse(readFileSync(join(dir, "results", "supported.request.json"), "utf8"));
  expect(request.sha256).toBe(createHash("sha256").update(request.prompt).digest("hex"));
  await expect(runCalibration(loaded, { adapter: adapter([]), judge, output: join(dir, "results") })).rejects.toThrow(/EEXIST/);
});

test("proposed labels and missing contrast types validate offline but cannot trigger judging", async () => {
  const { dir, specPath, controls } = setup();
  controls[0].review = { status: "proposed" };
  const loaded = prepareCalibration({ specPath, controls: controls.slice(0, 2) });
  expect(loaded.ready).toBe(false);
  expect(loaded.issues).toEqual(expect.arrayContaining([expect.stringContaining("author review"), expect.stringContaining("equivalent")]));
  const prompts: string[] = [];
  await expect(runCalibration(loaded, { adapter: adapter([], prompts), judge, output: join(dir, "results") })).rejects.toThrow(/not ready/);
  expect(prompts).toEqual([]);
});

test("changed source and transcript bindings fail offline, and simplified answer-only calibration is refused", () => {
  const { dir, specPath, controls } = setup();
  const loaded = prepareCalibration({ specPath, controls });
  writeFileSync(join(dir, "release.txt"), "Capacity: 13\n");
  expect(() => loadCalibration(loaded.manifestPath)).toThrow(/reference\/rubric changed/);
  writeFileSync(join(dir, "release.txt"), "Capacity: 12\n");
  const manifest = JSON.parse(readFileSync(loaded.manifestPath, "utf8"));
  manifest.controls[0].transcript += " altered";
  writeFileSync(loaded.manifestPath, JSON.stringify(manifest));
  expect(() => loadCalibration(loaded.manifestPath)).toThrow(/Invalid calibration control/);
  controls[0].transcript = "12 (release.txt).";
  expect(() => prepareCalibration({ specPath, manifestPath: join(dir, "other.json"), controls })).toThrow(/complete production-shaped transcript/);
});

test("both mismatch directions are retained and infrastructure errors leave later controls unrun", async () => {
  const { dir, specPath, controls } = setup();
  const loaded = prepareCalibration({ specPath, controls });
  const mismatched = await runCalibration(loaded, { adapter: adapter([reply("FAIL"), reply("PASS"), reply("PASS")]), judge, output: join(dir, "mismatch") });
  expect(mismatched).toMatchObject({ status: "mismatch", falseFailures: ["supported"], falsePasses: ["invented"], completed: 3 });
  const failed = await runCalibration(loaded, { adapter: adapter(["[judge error: authentication unavailable]"]), judge, output: join(dir, "error") });
  expect(failed).toMatchObject({ status: "error", completed: 0, errors: ["supported"], unrun: ["invented", "equivalent"], falseFailures: [], judgeCalls: 1 });
  await expect(runCalibration(loaded, { adapter: { ...adapter([]), name: "direct-api" }, judge, output: join(dir, "refused") })).rejects.toThrow(/requires Pi/);
});

test("a thrown structured retry preserves the first reply and counts both actual invocations", async () => {
  const { dir, specPath, controls } = setup();
  const loaded = prepareCalibration({ specPath, controls });
  let calls = 0;
  const fixture = adapter([]);
  fixture.judge = async () => { if (++calls === 1) return "not JSON"; throw new Error("transport failed"); };
  const output = join(dir, "retry-error");
  const result = await runCalibration(loaded, { adapter: fixture, judge, output });
  expect(result).toMatchObject({ status: "error", judgeCalls: 2, completed: 0, errors: ["supported"], unrun: ["invented", "equivalent"] });
  expect(JSON.parse(readFileSync(join(output, "supported.attempt-1.reply.json"), "utf8")).reply).toBe("not JSON");
  expect(JSON.parse(readFileSync(join(output, "supported.attempt-2.request.json"), "utf8")).prompt).toContain("Your reply was not valid");
});

test("saved controls bind the selected original bytes rather than accepting a provenance claim", () => {
  const { dir, specPath, controls } = setup();
  controls[0].kind = "saved";
  controls[0].provenance = "selected retained run";
  expect(() => prepareCalibration({ specPath, controls })).toThrow(/bound original transcript/);
  controls[0].sourceTranscript = "retained.txt";
  writeFileSync(join(dir, "retained.txt"), controls[0].transcript);
  const loaded = prepareCalibration({ specPath, controls });
  expect(loaded.ready).toBe(true);
  writeFileSync(join(dir, "retained.txt"), controls[0].transcript + " altered");
  expect(() => loadCalibration(loaded.manifestPath)).toThrow(/original saved transcript changed/);
});
