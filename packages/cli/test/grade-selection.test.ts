import { afterEach, expect, test } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSpec, readResults, sourceHashes, rubricDigest, writeResults, type HarnessAdapter } from "@skill-harness/core";
import { cmdGrade, type Args } from "../src/cli.js";

const temporary: string[] = [];
afterEach(() => { for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "harness-grade-selection-")); temporary.push(root);
  const tests = join(root, "skill", "tests"), specPath = join(tests, "specification.yaml");
  const runDir = join(tests, "results", "pi-fixture", "original");
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(root, "skill", "SKILL.md"), "---\nname: greeting\ndescription: Respond to greetings.\n---\nGreet the user.\n");
  const source = {
    skill: "greeting", judge_persona: "Check the greeting.", ship_bar: { total: 2, min_pass: 2 },
    scenarios: [
      { id: "A1", title: "Greeting", turns: ["Hello"], checklist: ["Greets the user."] },
      { id: "A2", title: "Farewell", turns: ["Goodbye"], checklist: ["Says goodbye."] },
    ],
  };
  writeFileSync(specPath, JSON.stringify(source));
  const spec = loadSpec(specPath);
  const judge = { provider: "openai-codex", model: "recorded-judge" };
  writeResults(runDir, {
    skill: "greeting", harness: "pi", model: "fixture:subject", judge,
    timestamp: "2026-10-01T00:00:00.000Z", label: null, mode: "force",
    source_hashes: sourceHashes({ skillDir: join(root, "skill"), specDir: tests, scenarios: spec.scenarios, judgePersona: spec.judge_persona }),
    scenarios: [
      { id: "A1", judge_verdict: "FAIL", judge_reason: "Historical disagreement", suspect: true, override: null, note: "Keep this note" },
      { id: "A2", judge_verdict: "PASS", judge_reason: "Historical clean judgment", suspect: false, override: null, note: "Untouched" },
    ],
  }, { shipBar: spec.ship_bar, critical: [] });
  writeFileSync(join(runDir, "A1.force.txt"), ">>> USER:\nHello\n\n<<< ASSISTANT:\nHello there!\n");
  writeFileSync(join(runDir, "A2.force.txt"), ">>> USER:\nGoodbye\n\n<<< ASSISTANT:\nGoodbye!\n");
  const calls: string[] = [];
  const adapter: HarnessAdapter = {
    name: "pi", available: async () => true,
    run: async () => { throw new Error("No subject call allowed"); },
    judge: async request => {
      calls.push(request.prompt);
      return JSON.stringify({ verdict: "PASS", reason: "Supported greeting", votes: [{ criterion: 1, vote: "PASS", reason: "Supported greeting" }] });
    },
  };
  const args = (flags: Args["flags"], run = runDir): Args => ({ _: [run], flags, multi: {} });
  return { root, tests, specPath, source, runDir, calls, adapter, args };
}

test("partial filters cannot credit untouched historical judgments to a newly selected judge", async () => {
  const f = fixture(), before = readFileSync(join(f.runDir, "results.yaml"));
  for (const flags of [
    { "suspect-only": true, judge: "openai-codex:new-judge" },
    { only: "A1,A2", "suspect-only": true, judge: "openai-codex:new-judge" },
  ]) {
    await expect(cmdGrade(f.args(flags), f.adapter)).rejects.toThrow(/recorded judge/);
  }
  expect(f.calls).toEqual([]);
  expect(readFileSync(join(f.runDir, "results.yaml"))).toEqual(before);
});

test("empty or duplicate explicit scenario selection cannot expand to a full paid regrade or create a copy", async () => {
  const f = fixture(), output = join(f.root, "must-not-exist");
  for (const only of ["", " , ", true, "A1,A1"]) {
    await expect(cmdGrade(f.args({ only, out: output }), f.adapter)).rejects.toThrow(/only/i);
  }
  expect(f.calls).toEqual([]);
  expect(existsSync(output)).toBe(false);
});

test("copied selective regrading preserves originals and persona staleness, and accepts an explicit spec on follow-up", async () => {
  const f = fixture();
  const original = new Map(readdirSync(f.runDir).map(name => [name, readFileSync(join(f.runDir, name))]));
  const previous = readResults(f.runDir);
  f.source.judge_persona = "Check only the stated greeting requirements.";
  f.source.scenarios[0].checklist = ["Greets the user without adding unsupported claims."];
  writeFileSync(f.specPath, JSON.stringify(f.source));
  const output = join(f.root, "arbitrary-copy");
  await cmdGrade(f.args({ only: "A1", out: output }), f.adapter);
  const copied = readResults(output), current = loadSpec(f.specPath);
  expect(f.calls).toHaveLength(1);
  expect(copied.timestamp).toBe(previous.timestamp);
  expect(copied.judge).toEqual(previous.judge);
  expect(copied.scenarios[1]).toEqual(previous.scenarios[1]);
  expect(copied.source_hashes?.["rubric:A1"]).toBe(rubricDigest(current.scenarios[0], f.tests));
  expect(copied.source_hashes?.["rubric:__persona"]).toBe(previous.source_hashes?.["rubric:__persona"]);
  expect(readdirSync(output).some(name => name.startsWith("reuse-source-") && name.endsWith(".json"))).toBe(true);
  await cmdGrade(f.args({ only: "A2", spec: f.specPath }, output), f.adapter);
  expect(f.calls).toHaveLength(2);
  expect(readResults(output).source_hashes?.["rubric:__persona"]).toBe(previous.source_hashes?.["rubric:__persona"]);
  expect(readdirSync(f.runDir).sort()).toEqual([...original.keys()].sort());
  for (const [name, bytes] of original) expect(readFileSync(join(f.runDir, name))).toEqual(bytes);
});
