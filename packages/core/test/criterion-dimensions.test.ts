import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { afterEach, expect, it } from "vitest";
import { reportCriterionDimensions } from "../src/criterion-dimensions.js";
import { diagnoseRun } from "../src/diagnose.js";
import { buildJudgePrompt, formatJudgeRawReplies, parseStructuredJudgeReply } from "../src/grade.js";
import { loadSpec, parseSpec } from "../src/spec.js";
import { readResults, type ResultsFile } from "../src/results.js";
import { runSkillModel } from "../src/run.js";
import { gatesDigest, personaDigest, policyDigest, rubricDigest, stimulusDigest } from "../src/sources.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const digest = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");
const rawSpec = () => ({ skill: "research", judge_persona: "Use only the evidence", ship_bar: { total: 1, min_pass: 1 }, scenarios: [{
  id: "A", title: "Unknown current version", turns: ["Do these files establish the current registry version?"],
  checklist: ["Report the installed version accurately.", "Identify the dated evidence needed next.", "Cite sources and do not invent live access."],
}] });
const dimensions = ["task-correctness", "method-completeness", "mixed"];
const reply = JSON.stringify({ votes: [
  { criterion: 1, vote: "PASS", reason: "Version correct" },
  { criterion: 2, vote: "FAIL", reason: "Missing next evidence" },
  { criterion: 3, vote: "PASS", reason: "Cited, no invented access" },
], verdict: "FAIL", reason: "Next evidence omitted" });
const transcript = ">>> USER:\nDo these files establish the current registry version?\n\n<<< ASSISTANT:\nInstalled: 3.2.1 (project.txt). Current registry tag is unresolved; no live lookup occurred.\n";
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "dimension-report-")); roots.push(root);
  mkdirSync(join(root, "tests")); writeFileSync(join(root, "SKILL.md"), "---\nname: research\ndescription: Research\n---\nUse evidence.");
  const specPath = join(root, "tests", "specification.yaml");
  const doc = rawSpec(); Object.assign(doc.scenarios[0], { criterion_dimensions: dimensions });
  writeFileSync(specPath, JSON.stringify(doc));
  const spec = loadSpec(specPath), scenario = spec.scenarios[0], runDir = join(root, "run"); mkdirSync(runDir);
  const prompt = buildJudgePrompt({ skill: spec.skill, persona: spec.judge_persona, scenario, transcript });
  const judge = { provider: "local", model: "judge" };
  const input = JSON.stringify({ schema: 1, judge, execution: null, prompts: [prompt] }) + "\n";
  const sha = digest(input), inputName = `judge-input.${sha}.txt`;
  writeFileSync(join(runDir, inputName), input); writeFileSync(join(runDir, "A.force.txt"), transcript); writeFileSync(join(runDir, "A.force.judge.txt"), reply);
  const parsed = parseStructuredJudgeReply(reply, 3);
  const result: ResultsFile = { schema: 2, skill: spec.skill, harness: "pi", model: "local:subject", judge, timestamp: "2026-10-28T00:00:00Z", label: null, mode: "force",
    effective_grade: { passed: 0, total: 1, pct: 0, letter: "F", ship: false, note: "" },
    source_hashes: { "rubric:A": rubricDigest(scenario), "rubric:__persona": personaDigest(spec.judge_persona) },
    scenarios: [{ id: "A", judge_verdict: "FAIL", judge_reason: parsed.reason, suspect: false, override: null, note: "",
      rep_judgments: [{ repetition: 0, recorded_verdict: "FAIL", judgments: [{ ordinal: 1, judge, ...parsed, suspect: false, judgeFormat: "json", input: { artifact: inputName, sha256: sha, execution: "unknown" } }] }] }],
  };
  const save = () => writeFileSync(join(runDir, "results.yaml"), JSON.stringify(result)); save();
  return { root, specPath, spec, runDir, result, save, inputName, report: () => reportCriterionDimensions(runDir, spec, join(root, "tests")) };
}

it("validates ordered author dimensions and leaves omitted metadata unclassified", () => {
  const doc = rawSpec();
  expect(parseSpec(JSON.stringify(doc), "spec").scenarios[0].criterionDimensions).toBeUndefined();
  Object.assign(doc.scenarios[0], { criterion_dimensions: dimensions });
  expect(parseSpec(JSON.stringify(doc), "spec").scenarios[0].criterionDimensions).toEqual(dimensions);
  const schema = JSON.parse(readFileSync(new URL("../../../schemas/specification-v1.schema.json", import.meta.url), "utf8"));
  const validate = new Ajv2020({ strict: true }).compile(schema);
  expect(validate(doc)).toBe(true);
  for (const bad of [[], ["mixed"], ["task-correctness", "mixed", "unclassified"], null, "mixed"]) {
    Object.assign(doc.scenarios[0], { criterion_dimensions: bad });
    expect(() => parseSpec(JSON.stringify(doc), "spec")).toThrow(/criterion_dimensions/);
  }
  Object.assign(doc.scenarios[0], { criterion_dimensions: ["mixed", "mixed", "wrong"] });
  expect(validate(doc)).toBe(false);
});

it("a correct answer's missing method step stays a saved criterion failure without becoming a correctness or scenario pass", async () => {
  const f = fixture(); const specWithoutDimensions = parseSpec(JSON.stringify(rawSpec()), "spec");
  let calls = 0;
  const run = await runSkillModel({ skillDir: f.root, specPath: f.specPath, spec: specWithoutDimensions, model: { provider: "local", model: "subject" }, modelToken: "local:subject", judge: { provider: "local", model: "judge" }, mode: "force", reps: 2, timestamp: "2026-10-28T00:00:00.000Z",
    adapter: { name: "pi", available: async () => true, run: async () => { calls++; return transcript; }, judge: async () => { calls++; return reply; } } });
  const files = Object.fromEntries(readdirSync(run.runDir).map(name => [name, digest(readFileSync(join(run.runDir, name)))]));
  const unclassified = reportCriterionDimensions(run.runDir, specWithoutDimensions, join(f.root, "tests"));
  expect(unclassified.counts.unclassified).toEqual({ pass: 4, fail: 2, unavailable: 0 });
  const report = diagnoseRun(run.runDir, f.root, f.specPath).criterionDimensions;
  expect(report.counts["task-correctness"]).toEqual({ pass: 2, fail: 0, unavailable: 0 });
  expect(report.counts["method-completeness"]).toEqual({ pass: 0, fail: 2, unavailable: 0 });
  expect(report.counts.mixed).toEqual({ pass: 2, fail: 0, unavailable: 0 });
  expect(report.coverage).toEqual({ expectedVotes: 6, availableVotes: 6, unavailableVotes: 0, unknownScenarioSizes: 0 });
  expect(report.scenarios[0].original.judge_verdict).toBe("FAIL");
  expect(readResults(run.runDir).effective_grade.ship).toBe(false);
  expect(report.metadataSha256).not.toBe(unclassified.metadataSha256);
  expect(report.scenarios[0].repetitions.map(r => [r.repetition, r.judgment?.ordinal])).toEqual([[0, 1], [1, 1]]);
  expect(Object.fromEntries(readdirSync(run.runDir).map(name => [name, digest(readFileSync(join(run.runDir, name)))]))).toEqual(files);
  expect(calls).toBe(4);
});

it("dimension edits change only report metadata, not prompts or stimulus/rubric/policy/gate identities", () => {
  const f = fixture(), before = structuredClone(f.spec.scenarios[0]);
  before.traceAssert = { require_calls: [{ tool: "read", count: { min: 1 } }] };
  const after = { ...before, criterionDimensions: ["mixed", "mixed", "task-correctness"] as const };
  const changed = { ...after, criterionDimensions: [...after.criterionDimensions] };
  for (const fn of [stimulusDigest, rubricDigest, policyDigest, gatesDigest]) expect(fn(before)).toBe(fn(changed));
  const input = { skill: f.spec.skill, persona: f.spec.judge_persona, transcript };
  expect(buildJudgePrompt({ ...input, scenario: before })).toBe(buildJudgePrompt({ ...input, scenario: changed }));
  const old = f.report(); f.spec.scenarios[0].criterionDimensions = changed.criterionDimensions;
  expect(f.report().metadataSha256).not.toBe(old.metadataSha256);
  expect(f.report().coverage.availableVotes).toBe(3);
});

it.each(["missing identity", "changed rubric", "changed persona", "missing votes", "malformed votes", "suspect", "multi judge", "missing input", "tampered input", "tampered reply", "missing reply", "changed transcript"])("marks %s unavailable rather than reading reasons or prose as votes", kind => {
  const f = fixture(), row = f.result.scenarios[0], judgment = row.rep_judgments![0].judgments[0];
  if (kind === "missing identity") delete f.result.source_hashes;
  if (kind === "changed rubric") f.spec.scenarios[0].checklist[0] = "Changed condition";
  if (kind === "changed persona") f.spec.judge_persona = "Different judgment";
  if (kind === "missing votes") delete judgment.criteria;
  if (kind === "malformed votes") judgment.criteria![0].index = 2;
  if (kind === "suspect") judgment.suspect = true;
  if (kind === "multi judge") row.rep_judgments![0].judgments.push({ ...judgment, ordinal: 2 });
  if (kind === "missing input") delete judgment.input;
  if (kind === "tampered input") writeFileSync(join(f.runDir, f.inputName), "changed");
  if (kind === "tampered reply") writeFileSync(join(f.runDir, "A.force.judge.txt"), reply.replace("Missing next evidence", "Changed reason"));
  if (kind === "missing reply") rmSync(join(f.runDir, "A.force.judge.txt"));
  if (kind === "changed transcript") writeFileSync(join(f.runDir, "A.force.txt"), "changed");
  f.save(); const report = f.report();
  if (["missing identity", "changed rubric", "changed persona"].includes(kind)) {
    expect(report.coverage).toEqual({ expectedVotes: 0, availableVotes: 0, unavailableVotes: 0, unknownScenarioSizes: 1 });
    expect(report.scenarios[0].unavailableReason).toContain("identity");
    return;
  }
  expect(report.coverage).toEqual({ expectedVotes: 3, availableVotes: 0, unavailableVotes: 3, unknownScenarioSizes: 0 });
  expect(report.scenarios[0].repetitions[0].unavailableReason).toBeTruthy();
  expect(report.scenarios[0].repetitions[0].votes.every(v => v.verdict === null)).toBe(true);
});

it("does not present an enlarged current rubric as known historical vote coverage", () => {
  const f = fixture();
  f.spec.scenarios[0].checklist.push("A newly added requirement");
  f.spec.scenarios[0].criterionDimensions!.push("method-completeness");
  const report = f.report();
  expect(report.scenarios[0].criteria).toHaveLength(4);
  expect(report.scenarios[0].mappingApplied).toBe(false);
  expect(report.scenarios[0].repetitions).toEqual([]);
  expect(report.coverage).toEqual({ expectedVotes: 0, availableVotes: 0, unavailableVotes: 0, unknownScenarioSizes: 1 });
  expect(Object.values(report.counts).every(c => c.pass + c.fail + c.unavailable === 0)).toBe(true);
});

it("preserves overrides and objective failures independently of criterion counts", () => {
  const f = fixture(), row = f.result.scenarios[0];
  row.override = "PASS"; row.note = "Human accepts this omission";
  row.objective = { status: "FAIL", assertions: [{ kind: "require_calls", status: "FAIL", detail: "Missing call" }] };
  row.rep_judgments![0].objective = row.objective; f.save();
  const report = f.report();
  expect(report.scenarios[0].original).toMatchObject({ judge_verdict: "FAIL", override: "PASS", objective: { status: "FAIL" } });
  expect(report.scenarios[0].repetitions[0].objective?.status).toBe("FAIL");
  expect(report.counts["method-completeness"].fail).toBe(1);
  expect(report.coverage.availableVotes).toBe(3);
});

it("hashes exact artifact bytes instead of a lossy UTF-8 round trip", () => {
  const f = fixture(), j = f.result.scenarios[0].rep_judgments![0].judgments[0];
  const saved = JSON.parse(readFileSync(join(f.runDir, f.inputName), "utf8"));
  saved.note = "\ufffd";
  const bytes = Buffer.from(JSON.stringify(saved) + "\n"), sha = digest(bytes), name = `judge-input.${sha}.txt`;
  writeFileSync(join(f.runDir, name), bytes); j.input = { artifact: name, sha256: sha, execution: "unknown" }; f.save();
  expect(f.report().coverage.availableVotes).toBe(3);
  const offset = bytes.indexOf(Buffer.from("\ufffd"));
  const changed = Buffer.concat([bytes.subarray(0, offset), Buffer.from([0xff]), bytes.subarray(offset + 3)]);
  expect(changed.toString("utf8")).toBe(bytes.toString("utf8"));
  expect(digest(changed)).not.toBe(sha);
  writeFileSync(join(f.runDir, name), changed);
  expect(f.report().coverage.availableVotes).toBe(0);
  expect(f.report().scenarios[0].repetitions[0].unavailableReason).toContain("changed");
});

it("accepts only the bound final response of a validation-guided structured retry", () => {
  const f = fixture(), j = f.result.scenarios[0].rep_judgments![0].judgments[0];
  const saved = JSON.parse(readFileSync(join(f.runDir, f.inputName), "utf8"));
  let error = ""; try { parseStructuredJudgeReply("not json", 3); } catch (e) { error = (e as Error).message; }
  saved.prompts.push(`${saved.prompts[0]}\n\nYour reply was not valid: ${JSON.stringify(error)}; reply with only the JSON object.`);
  const bytes = JSON.stringify(saved) + "\n", sha = digest(bytes), name = `judge-input.${sha}.txt`;
  writeFileSync(join(f.runDir, name), bytes); j.input = { artifact: name, sha256: sha, execution: "unknown" }; j.judgeRetries = 1;
  writeFileSync(join(f.runDir, "A.force.judge.txt"), formatJudgeRawReplies(["not json", reply])); f.save();
  expect(f.report().coverage.availableVotes).toBe(3);
  writeFileSync(join(f.runDir, "A.force.judge.txt"), formatJudgeRawReplies([reply, reply]));
  expect(f.report().coverage.availableVotes).toBe(0);
});
