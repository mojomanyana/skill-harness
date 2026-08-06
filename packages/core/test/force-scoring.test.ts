import { describe, test, expect } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  writeResults, readResults, isScoredMode, scoreContextFor, transcriptPath, diffPath,
  type ResultsDraft,
} from "../src/results.js";
import { rescoreRun } from "../src/rescore.js";
import { regradeRun } from "../src/regrade.js";
import { regateRun } from "../src/regate.js";
import { runSkillModel } from "../src/run.js";
import { lintSkill } from "../src/lint.js";
import { collectLift } from "../src/lift.js";
import { parseSpec, type Spec } from "../src/spec.js";
import { sourceHashes } from "../src/sources.js";
import type { HarnessAdapter } from "../src/adapters/types.js";

/**
 * The force epoch, end to end.
 *
 * `principal-pi-skills` measures skill-as-system-prompt as its published
 * deployment — pi 0.83.0 delivers `--skill` by progressive disclosure, so green is
 * the mode whose meaning depends on a dependency version. Ten committed force runs
 * there read `effective_grade: not scored` because scoring was hard-coded to green.
 * These tests pin the policy (force is scored) and the paths that have to work for a
 * force run to be a first-class measurement: run, rescore, grade, regate, lint,
 * lift.
 */

const SPEC_YAML = `
skill: golden
judge_persona: a judge.
ship_bar: { total: 1, min_pass: 1 }
critical: [A1]
scenarios:
  - id: A1
    title: says hello
    turns: ["Say hello."]
    checklist: ["greets the user"]
`;

function spec(): Spec {
  return parseSpec(SPEC_YAML, "/spec/tests/specification.yaml");
}

function skillTree(): { skillDir: string; specDir: string; specPath: string } {
  const skillDir = mkdtempSync(join(tmpdir(), "sh-force-"));
  const specDir = join(skillDir, "tests");
  mkdirSync(specDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), "---\nname: golden\ndescription: d\n---\n\n## Greet warmly\n", "utf8");
  const specPath = join(specDir, "specification.yaml");
  writeFileSync(specPath, SPEC_YAML, "utf8");
  return { skillDir, specDir, specPath };
}

/** A run dir shaped like a real one: transcript on disk, results.yaml written the OLD way. */
function recordedRun(opts: {
  mode: string;
  /** Written with no score context — how every force run before 0.5.0 was recorded. */
  unscored?: boolean;
  verdict?: "PASS" | "FAIL";
  reps?: number;
  passes?: number;
  threshold?: number;
  hashes?: boolean;
}): { skillDir: string; specDir: string; runDir: string } {
  const { skillDir, specDir } = skillTree();
  const runDir = join(specDir, "results", "pi-fake", "2026-08-05T00-00-00Z");
  mkdirSync(runDir, { recursive: true });
  const reps = opts.reps ?? 1;
  for (let i = 0; i < reps; i++) {
    writeFileSync(
      transcriptPath(runDir, "A1", opts.mode, reps === 1 ? undefined : i),
      "USER: Say hello.\nASSISTANT: Hi!",
      "utf8",
    );
  }
  const draft: ResultsDraft = {
    skill: "golden", harness: "pi", model: "fireworks:fake",
    harness_cli_version: "0.83.0",
    judge: { provider: "claude-code", model: "opus" },
    timestamp: "2026-08-05T00:00:00Z", label: "release-2-force", mode: opts.mode,
    ...(opts.hashes
      ? { source_hashes: sourceHashes({ skillDir, specDir, scenarios: spec().scenarios, judgePersona: "a judge." }) }
      : {}),
    scenarios: [{
      id: "A1",
      judge_verdict: opts.verdict ?? "PASS",
      judge_reason: "greeted", suspect: false, override: null, note: "",
      ...(reps > 1
        ? { reps, passes: opts.passes ?? reps, clean: reps, flakiness: 0, pass_threshold: opts.threshold ?? 0.5 }
        : {}),
    }],
  };
  writeResults(runDir, draft, opts.unscored ? null : { shipBar: { total: 1, min_pass: 1 }, critical: ["A1"] });
  return { skillDir, specDir, runDir };
}

const okJudge: HarnessAdapter = {
  name: "pi",
  available: async () => true,
  run: async () => "USER: hi\nASSISTANT: Hi!",
  judge: async () => "1. PASS — greets\nVERDICT: PASS\nREASON: says hello",
};

describe("the scoring-mode policy", () => {
  test("green and force are scored; red is the control", () => {
    expect(isScoredMode("green")).toBe(true);
    expect(isScoredMode("force")).toBe(true);
    expect(isScoredMode("red")).toBe(false);
    // An unknown mode is not scored: a mode nobody has classified has not been
    // shown to deliver the skill.
    expect(isScoredMode("beige")).toBe(false);
  });

  test("scoreContextFor gates on mode AND on partial", () => {
    const s = spec();
    expect(scoreContextFor({ mode: "force" }, s)).toEqual({ shipBar: s.ship_bar, critical: s.critical });
    expect(scoreContextFor({ mode: "red" }, s)).toBeNull();
    // A subset passing says nothing about the ship bar, whatever the delivery.
    expect(scoreContextFor({ mode: "force", partial: true }, s)).toBeNull();
    expect(scoreContextFor({ mode: "green", partial: true }, s)).toBeNull();
  });
});

describe("a force run is a scored measurement", () => {
  test("run writes a real grade for force and a placeholder for red", async () => {
    for (const [mode, scored] of [["force", true], ["red", false]] as const) {
      const { skillDir, specPath } = skillTree();
      const { results } = await runSkillModel({
        spec: spec(), skillDir, specPath, adapter: okJudge,
        model: { provider: "fireworks", model: "fake" }, modelToken: "fireworks:fake",
        judge: { provider: "claude-code", model: "opus" }, mode,
        timestamp: "2026-08-06T00:00:00Z",
      });
      expect(results.mode).toBe(mode);
      if (scored) {
        expect(results.effective_grade.total).toBe(1);
        expect(results.effective_grade.ship).toBe(true);
        expect(results.effective_grade.note).not.toMatch(/not scored/);
      } else {
        expect(results.effective_grade.note).toBe("mode=red (not scored)");
      }
    }
  });

  // The exact 0b workflow: the rep data is committed, the scoring policy was the
  // gate. `rescore` is free and offline, so ten run dirs become ten scorecards at
  // zero spend.
  test("rescore turns a pre-0.5.0 force run's `not scored` placeholder into a real grade", () => {
    const { runDir } = recordedRun({ mode: "force", unscored: true, reps: 3, passes: 3 });
    expect(readResults(runDir).effective_grade.note).toBe("mode=force (not scored)");

    const { results, changes } = rescoreRun({ runDir, spec: spec(), now: () => "2026-08-06T00:00:00Z" });

    expect(changes).toEqual([]); // no verdict moved — the grade is what was missing
    expect(results.effective_grade).toMatchObject({ passed: 1, total: 1, pct: 100, letter: "A", ship: true });
    expect(readResults(runDir).effective_grade.ship).toBe(true); // persisted, not just returned
  });

  test("rescore leaves a red baseline unscored", () => {
    const { runDir } = recordedRun({ mode: "red", unscored: true, reps: 3, passes: 3 });
    const { results } = rescoreRun({ runDir, spec: spec(), now: () => "2026-08-06T00:00:00Z" });
    expect(results.effective_grade.note).toBe("mode=red (not scored)");
  });

  test("a rescore carries the harness CLI version forward — provenance is not this rewrite's to restate", () => {
    const { runDir } = recordedRun({ mode: "force", unscored: true, reps: 3, passes: 3 });
    const { results } = rescoreRun({ runDir, spec: spec(), now: () => "2026-08-06T00:00:00Z" });
    expect(results.harness_cli_version).toBe("0.83.0");
  });

  test("grade re-judges a force run from its own `.force.txt` transcripts and scores it", async () => {
    const { runDir, specDir } = recordedRun({ mode: "force", unscored: true, verdict: "FAIL" });
    const results = await regradeRun({
      runDir, spec: spec(), adapter: okJudge, judge: { provider: "claude-code", model: "opus" },
      specDir, now: () => "2026-08-06T00:00:00Z",
    });
    expect(results.scenarios[0].judge_verdict).toBe("PASS"); // the judge was actually reached
    expect(results.mode).toBe("force");
    expect(results.effective_grade.ship).toBe(true);
    expect(results.harness_cli_version).toBe("0.83.0");
  });
});

describe("regate works on a force run's saved diffs", () => {
  const SEEDED_SPEC = `
skill: golden
judge_persona: a judge.
ship_bar: { total: 1, min_pass: 1 }
critical: []
scenarios:
  - id: A1
    title: seeded one
    turns: ["fix it"]
    checklist: ["fixes it"]
    mode: seeded
    fixture: fixtures/A1
    assert:
      diff_contains: ["localhost:8080"]
`;
  const DIFF = `diff --git a/app.ts b/app.ts
--- a/app.ts
+++ b/app.ts
@@ -1,2 +1,3 @@
 const port = 3000;
+const url = "localhost:8080";
`;

  test("it reads `.force.diff.txt`, not green artifacts that were never written", async () => {
    const { skillDir, specDir } = skillTree();
    mkdirSync(join(specDir, "fixtures", "A1"), { recursive: true });
    const seededSpec = parseSpec(SEEDED_SPEC, join(specDir, "specification.yaml"));
    const runDir = join(specDir, "results", "pi-fake", "2026-08-05T00-00-00Z");
    mkdirSync(runDir, { recursive: true });
    writeFileSync(
      transcriptPath(runDir, "A1", "force"),
      `USER: fix it\nASSISTANT: done\n\n=== SEEDED GATES ===\n  diff_contains "spike": MISSING\n\n=== STAGED DIFF ===\n${DIFF}\n`,
      "utf8",
    );
    writeFileSync(diffPath(runDir, "A1", "force"), DIFF, "utf8");
    writeResults(runDir, {
      skill: "golden", harness: "pi", model: "fireworks:fake",
      harness_cli_version: "0.83.0",
      judge: { provider: "claude-code", model: "opus" },
      timestamp: "2026-08-05T00:00:00Z", label: "release-2-force", mode: "force",
      source_hashes: sourceHashes({ skillDir, specDir, scenarios: seededSpec.scenarios, judgePersona: "a judge." }),
      scenarios: [{ id: "A1", judge_verdict: "FAIL", judge_reason: 'staged diff missing "spike"', suspect: false, override: null, note: "" }],
    }, null);

    const { results, judgeCalls } = await regateRun({
      runDir, spec: seededSpec, specDir, adapter: okJudge,
      judge: { provider: "claude-code", model: "opus" }, now: () => "2026-08-06T00:00:00Z",
    });

    expect(judgeCalls).toBe(1); // the flipped rep was judged from the saved transcript
    expect(results.scenarios[0].judge_verdict).toBe("PASS");
    expect(results.effective_grade.ship).toBe(true); // and the force run is now scored
    expect(results.harness_cli_version).toBe("0.83.0");
  });
});

describe("lint points a pre-0.5.0 force run at the free remedy", () => {
  test("the stale-grade finding names rescore, not a re-run", () => {
    const { skillDir } = recordedRun({ mode: "force", unscored: true, hashes: true });
    const findings = lintSkill(skillDir);
    const stale = findings.filter((f) => f.code === "consistency" && /effective_grade is stale/.test(f.message));
    expect(stale).toHaveLength(1);
    expect(stale[0].message).toMatch(/rescore \(free, offline\)/);
    expect(stale[0].message).not.toMatch(/re-run/);
  });

  test("a force run already rescored produces no consistency finding", () => {
    const { skillDir, runDir } = recordedRun({ mode: "force", unscored: true, hashes: true });
    rescoreRun({ runDir, spec: spec(), now: () => "2026-08-06T00:00:00Z" });
    expect(lintSkill(skillDir).filter((f) => f.code === "consistency")).toEqual([]);
  });
});

describe("lift in the force epoch", () => {
  /** Write one run into an existing skill tree. */
  function addRun(specDir: string, mode: string, ts: string, verdict: "PASS" | "FAIL"): void {
    const runDir = join(specDir, "results", "pi-fake", ts.replace(/[:.]/g, "-"));
    mkdirSync(runDir, { recursive: true });
    writeResults(runDir, {
      skill: "golden", harness: "pi", model: "fireworks:fake",
      judge: { provider: "claude-code", model: "opus" },
      timestamp: ts, label: null, mode,
      scenarios: [{ id: "A1", judge_verdict: verdict, judge_reason: "", suspect: false, override: null, note: "" }],
    }, mode === "red" ? null : { shipBar: { total: 1, min_pass: 1 }, critical: ["A1"] });
  }

  // A red baseline is `--no-skills` whatever the mode, so red-vs-force is as valid
  // a comparison as red-vs-green. Without this, a corpus that switched to force
  // delivery lost its lift entirely — the skill's whole value story.
  test("a force run is the skill side of the lift, and says so", () => {
    const { skillDir, specDir } = skillTree();
    addRun(specDir, "red", "2026-08-05T00:00:00Z", "FAIL");
    addRun(specDir, "force", "2026-08-05T01:00:00Z", "PASS");
    const [lift] = collectLift(skillDir);
    expect(lift.mode).toBe("force");
    expect(lift.gained).toBe(1);
    expect(lift.delta).toBe(1);
  });

  test("the most recent delivery wins when a tag holds both epochs", () => {
    const { skillDir, specDir } = skillTree();
    addRun(specDir, "red", "2026-08-05T00:00:00Z", "FAIL");
    addRun(specDir, "green", "2026-08-05T01:00:00Z", "FAIL");
    addRun(specDir, "force", "2026-08-05T02:00:00Z", "PASS");
    const [lift] = collectLift(skillDir);
    expect(lift.mode).toBe("force");
    expect(lift.greenTimestamp).toBe("2026-08-05T02:00:00Z"); // the skill-active side
    expect(lift.gained).toBe(1);
  });
});
