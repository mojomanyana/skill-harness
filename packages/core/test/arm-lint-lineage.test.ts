import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintSkill } from "../src/lint.js";
import { writeResults, loadSpec, currentHashFor, scenarioSourceKeys, PERSONA_KEY, SKILL_KEY, SKILL_PROMPT_KEY } from "../src/index.js";

// Copied from packages/core/test/lint.test.ts rather than imported (that file
// does not export it) — kept byte-identical so this test and the existing lint
// tests cannot drift apart on corpus shape.
const tmps: string[] = [];
function skill(specYaml: string, extra?: (dir: string) => void): string {
  const d = mkdtempSync(join(tmpdir(), "sc-lint-"));
  tmps.push(d);
  writeFileSync(join(d, "SKILL.md"), "---\nname: x\n---\n", "utf8");
  mkdirSync(join(d, "tests"), { recursive: true });
  writeFileSync(join(d, "tests", "specification.yaml"), specYaml, "utf8");
  extra?.(d);
  return d;
}
afterEach(() => { while (tmps.length) rmSync(tmps.pop()!, { recursive: true, force: true }); });

const GOOD = `skill: demo\njudge_persona: a judge.\nship_bar: { total: 1, min_pass: 1 }\ncritical: [A1]\nscenarios:\n  - id: A1\n    title: t\n    turns: ["hi"]\n    checklist: ["ok"]\n`;

/**
 * The real digests `stability` would have recorded for a run measured against this
 * corpus right now — both planted runs record the SAME values, so a pair is
 * "comparable" (`compareSources` sees shared keys with no drift) and any verdict
 * difference between them is a genuine flip candidate, not an artifact of a spec
 * edit. Without this, two synthetic runs carry no `source_hashes` at all, `stability`
 * reports every pair `unverified`, and a finding-count comparison is vacuous — see
 * the module doc on `an arm tag is its own lineage` below.
 */
function currentSourceHashes(skillDir: string): Record<string, string> {
  const spec = loadSpec(join(skillDir, "tests", "specification.yaml"));
  const ctx = { skillDir, specDir: join(skillDir, "tests"), scenarios: spec.scenarios, judgePersona: spec.judge_persona };
  const keys = [SKILL_KEY, SKILL_PROMPT_KEY, PERSONA_KEY, ...scenarioSourceKeys(spec.scenarios[0])];
  const hashes: Record<string, string> = {};
  for (const k of keys) {
    const v = currentHashFor(k, ctx);
    if (typeof v === "string") hashes[k] = v;
  }
  return hashes;
}

/** Plant one committed, comparable run dir under `<tag>/<ts>` with the given verdict. */
function committedRun(
  skillDir: string,
  tag: string,
  ts: string,
  tsIso: string,
  verdict: "PASS" | "FAIL",
  sourceHashes: Record<string, string>,
): string {
  const runDir = join(skillDir, "tests", "results", tag, ts);
  mkdirSync(runDir, { recursive: true });
  writeResults(
    runDir,
    {
      skill: "demo", harness: "pi", model: "fireworks:fake",
      judge: { provider: "anthropic", model: "opus" }, timestamp: tsIso,
      label: null, mode: "green",
      scenarios: [{ id: "A1", judge_verdict: verdict, judge_reason: "ok", suspect: false, override: null, note: "" }],
      source_hashes: sourceHashes,
    },
    { shipBar: { total: 1, min_pass: 1, no_critical_fail: true }, critical: ["A1"] },
  );
  return runDir;
}

/**
 * The claim under test is the design's central one: an arm-tagged directory is a
 * separate lineage, so it neither adds findings to nor removes findings from the
 * control's — even when the arm's own behaviour genuinely differs (that IS the
 * point of measuring an arm). Two comparable runs recording DIFFERENT verdicts is
 * exactly the shape `stability` exists to flag as a run-over-run flip when they
 * belong to the SAME lineage — so this corpus is only a meaningful test of
 * lineage separation because a flip is actually possible here. (Verified by a
 * one-off mutation, not committed as a test: planting both runs under the SAME
 * tag instead of `<tag>+pi-daddy` makes the finding count move from 0 to 1 — a
 * `stability` finding reporting the PASS→FAIL flip. That is exactly what this
 * test proves does NOT happen once the arm gets its own tag.)
 */
describe("an arm tag is its own lineage", () => {
  it("an arm run with a DIFFERENT verdict does not disturb the control's findings", () => {
    const skillDir = skill(GOOD);
    const hashes = currentSourceHashes(skillDir);
    committedRun(skillDir, "pi-fake", "2026-07-01T00-00-00Z", "2026-07-01T00:00:00Z", "PASS", hashes);
    const before = lintSkill(skillDir);

    const results = join(skillDir, "tests", "results");
    const [tag] = readdirSync(results);
    // The arm's own run: same scenario, same recorded sources, a DIFFERENT verdict —
    // a real arm is expected to change behaviour. It is planted under `<tag>+pi-daddy`,
    // its own lineage, not merged into the control's.
    committedRun(skillDir, `${tag}+pi-daddy`, "2026-07-02T00-00-00Z", "2026-07-02T00:00:00Z", "FAIL", hashes);
    const after = lintSkill(skillDir);

    expect(after.length).toBe(before.length);
  });
});
