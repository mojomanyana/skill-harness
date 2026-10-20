import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { closeSync, existsSync, ftruncateSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { forkSavedRun, planSavedAnswers } from "../src/saved-run.js";
import { parseSpec, type Spec } from "../src/spec.js";
import { sourceHashes } from "../src/sources.js";
import { readResults, transcriptPath, writeResults, type ResultsFile } from "../src/results.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const hash = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

function fixture(): { root: string; skillDir: string; specDir: string; runDir: string; spec: Spec; result: ResultsFile } {
  const root = mkdtempSync(join(tmpdir(), "sh-saved-run-"));
  roots.push(root);
  const skillDir = join(root, "skill"), specDir = join(root, "evals");
  mkdirSync(skillDir);
  mkdirSync(join(specDir, "fixtures", "source"), { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), "---\nname: demo\ndescription: Answer from sources.\n---\n## Evidence\nUse supplied evidence.\n");
  writeFileSync(join(specDir, "fixtures", "source", "facts.txt"), "Capacity is 42.\n");
  writeFileSync(join(specDir, "reference.txt"), "Capacity is 42.\n");
  const spec = parseSpec(JSON.stringify({
    skill: "demo", judge_persona: "Judge source support.", ship_bar: { total: 2, min_pass: 2 },
    scenarios: [
      { id: "A1", title: "Source answer", turns: ["Read facts.txt and give capacity."],
        checklist: ["Reports 42."], judge_evidence: "response", judge_references: ["reference.txt"],
        env: { workspace: "fixture:fixtures/source", tools: ["read"] } },
      { id: "A2", title: "Other task", turns: ["Say hello."], checklist: ["Greets the user."] },
    ],
  }), join(specDir, "specification.yaml"));
  const runDir = join(root, "original");
  const result = writeResults(runDir, {
    skill: spec.skill, harness: "pi", model: "provider:subject", judge: { provider: "other", model: "judge" },
    timestamp: "2026-10-17T00:00:00Z", label: null, mode: "force",
    source_hashes: sourceHashes({ skillDir, specDir, scenarios: spec.scenarios, judgePersona: spec.judge_persona }),
    scenarios: spec.scenarios.map(s => ({ id: s.id, judge_verdict: s.id === "A1" ? "FAIL" : "PASS",
      judge_reason: "Recorded judgment", suspect: false, override: null, note: "" })),
  }, { shipBar: spec.ship_bar, critical: [] });
  for (const s of spec.scenarios) writeFileSync(transcriptPath(runDir, s.id, "force"), ">>> USER:\nQuestion\n<<< ASSISTANT:\nSaved answer\n");
  return { root, skillDir, specDir, runDir, spec, result };
}

describe("saved-answer planning", () => {
  it("reuses matching inputs even when the saved answer failed, without rewriting scores or calling providers", () => {
    const f = fixture();
    const before = readFileSync(join(f.runDir, "results.yaml"));
    const plan = planSavedAnswers(f.runDir, f.spec, f.skillDir, f.specDir);
    expect(plan).toMatchObject({ providerCalls: 0, resultsChanged: false });
    expect(plan.scenarios.map(s => [s.id, s.action])).toEqual([["A1", "reuse"], ["A2", "reuse"]]);
    expect(plan.scenarios[0].note).toMatch(/including failures/);
    expect(plan.scenarios[0].note).toMatch(/not a new stability sample/);
    expect(readFileSync(join(f.runDir, "results.yaml"))).toEqual(before);
    expect(readResults(f.runDir)?.scenarios[0].judge_verdict).toBe("FAIL");
  });

  it("corrected judge-only references or rubric require regrading only the affected saved answer", () => {
    const f = fixture();
    writeFileSync(join(f.specDir, "reference.txt"), "Capacity is 42; the trial is scoped to one region.\n");
    f.spec.scenarios[0].checklist = ["Reports the capacity without inventing regional scope."];
    const plan = planSavedAnswers(f.runDir, f.spec, f.skillDir, f.specDir);
    expect(plan.scenarios.map(s => [s.id, s.action])).toEqual([["A1", "regrade"], ["A2", "reuse"]]);
    expect(plan.scenarios[0].changed).toEqual(["rubric:A1"]);
  });

  it("changed subject fixtures require a fresh answer without invalidating unrelated scenarios", () => {
    const f = fixture();
    writeFileSync(join(f.specDir, "fixtures", "source", "facts.txt"), "Capacity is now 64.\n");
    const plan = planSavedAnswers(f.runDir, f.spec, f.skillDir, f.specDir);
    expect(plan.scenarios.map(s => [s.id, s.action])).toEqual([["A1", "rerun"], ["A2", "reuse"]]);
    expect(plan.scenarios[0].changed).toContain("fixture:fixtures/source");
  });

  it("chooses free policy recomputation and saved-gate replay before fresh execution", () => {
    const f = fixture();
    f.spec.scenarios[0].passThreshold = 0.75;
    f.spec.scenarios[1].assert = { output_excludes: ["DO_NOT_PUBLISH"] };
    expect(planSavedAnswers(f.runDir, f.spec, f.skillDir, f.specDir).scenarios.map(s => [s.id, s.action]))
      .toEqual([["A1", "rescore"], ["A2", "regate"]]);
  });

  it("requires inspection when a retained transcript is missing instead of promising reusable answers", () => {
    const f = fixture();
    rmSync(transcriptPath(f.runDir, "A1", "force"));
    expect(planSavedAnswers(f.runDir, f.spec, f.skillDir, f.specDir).scenarios.map(s => [s.id, s.action]))
      .toEqual([["A1", "inspect"], ["A2", "reuse"]]);
  });

  it("requires every expected repetition, not just the same number of transcript-looking paths", () => {
    const f = fixture();
    writeResults(f.runDir, { ...f.result, scenarios: [
      { ...f.result.scenarios[0], reps: 2, passes: 0, clean: 2, flakiness: 0, pass_threshold: 0.5 },
      f.result.scenarios[1],
    ] });
    rmSync(transcriptPath(f.runDir, "A1", "force"));
    for (const rep of [0, 2]) writeFileSync(transcriptPath(f.runDir, "A1", "force", rep), "saved answer\n");
    expect(planSavedAnswers(f.runDir, f.spec, f.skillDir, f.specDir).scenarios[0].action).toBe("inspect");
    rmSync(transcriptPath(f.runDir, "A1", "force", 2));
    writeFileSync(transcriptPath(f.runDir, "A1", "force", 1), "saved answer\n");
    expect(planSavedAnswers(f.runDir, f.spec, f.skillDir, f.specDir).scenarios[0].action).toBe("reuse");
  });

  it.each(["empty", "directory", "unexpected-rep"] as const)("does not treat a %s transcript as a reusable single answer", kind => {
    const f = fixture(), path = transcriptPath(f.runDir, "A1", "force");
    rmSync(path);
    if (kind === "empty") writeFileSync(path, "");
    if (kind === "directory") mkdirSync(path);
    if (kind === "unexpected-rep") writeFileSync(transcriptPath(f.runDir, "A1", "force", 0), "saved answer\n");
    expect(planSavedAnswers(f.runDir, f.spec, f.skillDir, f.specDir).scenarios[0].action).toBe("inspect");
  });

  it("does not invent input identity for legacy or future-unrecognized records", () => {
    const f = fixture();
    const unknown = { ...f.result.source_hashes!, "future-input:binding": "f".repeat(64) };
    writeResults(f.runDir, { ...f.result, source_hashes: unknown });
    expect(planSavedAnswers(f.runDir, f.spec, f.skillDir, f.specDir).scenarios.every(s => s.action === "inspect")).toBe(true);
    writeResults(f.runDir, { ...f.result, source_hashes: undefined });
    expect(planSavedAnswers(f.runDir, f.spec, f.skillDir, f.specDir).scenarios.every(s => s.action === "inspect")).toBe(true);
  });
});

describe("saved-run evidence fork", () => {
  it("copies exclusively, records source byte identities, and leaves the original unchanged when judgments change", () => {
    const f = fixture(), destination = join(f.root, "regraded");
    const before = Object.fromEntries(readdirSync(f.runDir).map(name => [name, readFileSync(join(f.runDir, name))]));
    expect(forkSavedRun(f.runDir, destination)).toBe(destination);
    for (const [name, data] of Object.entries(before)) expect(readFileSync(join(destination, name))).toEqual(data);
    const name = readdirSync(destination).find(n => n.startsWith("reuse-source-") && n.endsWith(".json"))!;
    const receipt = JSON.parse(readFileSync(join(destination, name), "utf8"));
    expect(receipt).toMatchObject({ schema: 1, purpose: "saved-answer-regrade", subjectCalls: 0 });
    for (const item of receipt.files) expect(item.sha256).toBe(hash(before[item.path]));
    writeFileSync(join(destination, "results.yaml"), "changed copied judgment\n");
    for (const [name, data] of Object.entries(before)) expect(readFileSync(join(f.runDir, name))).toEqual(data);
    expect(() => forkSavedRun(f.runDir, destination)).toThrow();
    expect(readFileSync(join(destination, "results.yaml"), "utf8")).toBe("changed copied judgment\n");
  });

  it("refuses a destination within the original before writing anything", () => {
    const f = fixture(), destination = join(f.runDir, "nested");
    expect(() => forkSavedRun(f.runDir, destination)).toThrow(/outside the original/);
    expect(existsSync(destination)).toBe(false);
  });

  it("checks canonical destination ancestry so an alias cannot write inside the source", () => {
    const f = fixture(), alias = join(f.root, "alias");
    symlinkSync(f.runDir, alias, process.platform === "win32" ? "junction" : "dir");
    const destination = join(alias, "nested");
    expect(() => forkSavedRun(f.runDir, destination)).toThrow(/outside the original/);
    expect(existsSync(join(f.runDir, "nested"))).toBe(false);
  });

  it("refuses linked source entries without copying their target contents", () => {
    const f = fixture(), outside = join(f.root, "outside"), destination = join(f.root, "copy");
    mkdirSync(outside);
    writeFileSync(join(outside, "private.txt"), "not selected");
    symlinkSync(outside, join(f.runDir, "linked"), process.platform === "win32" ? "junction" : "dir");
    expect(() => forkSavedRun(f.runDir, destination)).toThrow(/symbolic links/);
    expect(existsSync(destination)).toBe(false);
  });

  it("checks size limits before loading oversized evidence into memory", () => {
    const f = fixture(), destination = join(f.root, "copy");
    const fd = openSync(join(f.runDir, "oversized.bin"), "wx");
    try { ftruncateSync(fd, 64 * 1024 * 1024 + 1); } finally { closeSync(fd); }
    expect(() => forkSavedRun(f.runDir, destination)).toThrow(/byte limit/);
    expect(existsSync(destination)).toBe(false);
  });

  it("refuses an excessively deep tree without creating a partial destination", () => {
    const f = fixture(), destination = join(f.root, "copy");
    mkdirSync(join(f.runDir, ...Array.from({ length: 17 }, () => "d")), { recursive: true });
    expect(() => forkSavedRun(f.runDir, destination)).toThrow(/depth limit/);
    expect(existsSync(destination)).toBe(false);
  });
});
