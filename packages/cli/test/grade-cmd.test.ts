import { describe, test, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeResults, readResults, type HarnessAdapter } from "@skill-harness/core";
import { cmdGrade } from "../src/cli.js";

const SPEC = `
skill: golden
judge_persona: a friendly greeter judge.
ship_bar: { total: 1, min_pass: 1 }
critical: [A1]
scenarios:
  - id: A1
    title: says hello
    turns: ["Say hello."]
    checklist: ["greets the user"]
`;

const MULTI_SPEC = `
skill: golden
judge_persona: a friendly greeter judge.
ship_bar: { total: 3, min_pass: 3 }
critical: [A1]
scenarios:
  - id: A1
    title: says hello
    turns: ["Say hello."]
    checklist: ["greets the user"]
  - id: B1
    title: holds
    turns: ["Again."]
    checklist: ["greets again"]
  - id: C1
    title: closes
    turns: ["Bye."]
    checklist: ["says goodbye"]
`;

function threeScenarioRun() {
  const skillDir = tmp();
  mkdirSync(join(skillDir, "tests"), { recursive: true });
  writeFileSync(join(skillDir, "tests", "specification.yaml"), MULTI_SPEC, "utf8");
  const runDir = join(skillDir, "tests", "results", "pi-fake", "2026-07-03T00-00-00Z");
  mkdirSync(runDir, { recursive: true });
  writeResults(runDir, {
    skill: "golden", harness: "pi", model: "fireworks:fake",
    judge: { provider: "claude-code", model: "opus" },
    timestamp: "2026-07-03T00:00:00Z", label: null, mode: "green",
    scenarios: [
      { id: "A1", judge_verdict: "PASS", judge_reason: "greeted", suspect: false, override: null, note: "" },
      { id: "B1", judge_verdict: "PASS", judge_reason: "again", suspect: false, override: null, note: "" },
      { id: "C1", judge_verdict: "PASS", judge_reason: "bye", suspect: false, override: null, note: "" },
    ],
  }, { shipBar: { total: 3, min_pass: 3, no_critical_fail: true }, critical: ["A1"] });
  return { runDir, skillDir };
}

const tmps: string[] = [];
function tmp() {
  const d = mkdtempSync(join(tmpdir(), "sc-grade-cmd-"));
  tmps.push(d);
  return d;
}
afterEach(() => {
  while (tmps.length) rmSync(tmps.pop()!, { recursive: true, force: true });
});

function args(runDir: string) {
  return { _: [runDir], flags: {}, multi: {} };
}

describe("cmdGrade refuses to destroy a run with no green transcripts", () => {
  test("rejects with /no green transcripts/ and leaves results.yaml unchanged", async () => {
    const skillDir = tmp();
    mkdirSync(join(skillDir, "tests"), { recursive: true });
    writeFileSync(join(skillDir, "tests", "specification.yaml"), SPEC, "utf8");
    const runDir = join(skillDir, "tests", "results", "pi-fake", "2026-07-03T00-00-00Z");
    mkdirSync(runDir, { recursive: true });
    // NOTE: no *.green.txt transcripts written for this run.
    writeResults(runDir, {
      skill: "golden", harness: "pi", model: "fireworks:fake",
      judge: { provider: "claude-code", model: "opus" },
      timestamp: "2026-07-03T00:00:00Z", label: null, mode: "green",
      scenarios: [{ id: "A1", judge_verdict: "PASS", judge_reason: "greeted", suspect: false, override: null, note: "" }],
    }, { shipBar: { total: 1, min_pass: 1, no_critical_fail: true }, critical: ["A1"] });
    const before = readFileSync(join(runDir, "results.yaml"), "utf8");

    await expect(cmdGrade(args(runDir))).rejects.toThrow(/no green transcripts/);

    expect(readFileSync(join(runDir, "results.yaml"), "utf8")).toBe(before);
  });
});

describe("cmdGrade refuses to shrink a run when only some transcripts survive", () => {
  test("rejects with /missing transcripts/ (before judging) and leaves results.yaml unchanged", async () => {
    const { runDir } = threeScenarioRun();
    // Simulate a committed run where only the overridden A1 transcript was
    // preserved (un-gitignored); B1/C1 transcripts are absent after a fresh clone.
    writeFileSync(join(runDir, "A1.green.txt"), "USER: Say hello.\nASSISTANT: Hi!", "utf8");
    const before = readFileSync(join(runDir, "results.yaml"), "utf8");

    await expect(cmdGrade(args(runDir))).rejects.toThrow(/cannot re-grade B1, C1/);

    // Nothing overwritten: the recorded B1/C1 verdicts survive intact.
    expect(readFileSync(join(runDir, "results.yaml"), "utf8")).toBe(before);
  });
});

function repsRunFixture() {
  const skillDir = tmp();
  mkdirSync(join(skillDir, "tests"), { recursive: true });
  writeFileSync(join(skillDir, "tests", "specification.yaml"), SPEC, "utf8");
  const runDir = join(skillDir, "tests", "results", "pi-fake", "2026-07-03T00-00-00Z");
  mkdirSync(runDir, { recursive: true });
  // A --reps 2 run: only rep-suffixed transcripts exist, no plain A1.green.txt.
  writeFileSync(join(runDir, "A1.green.rep0.txt"), "USER: Say hello.\nASSISTANT: Hi!", "utf8");
  writeFileSync(join(runDir, "A1.green.rep1.txt"), "USER: Say hello.\nASSISTANT: Hello!", "utf8");
  writeResults(runDir, {
    skill: "golden", harness: "pi", model: "fireworks:fake",
    judge: { provider: "claude-code", model: "opus" },
    timestamp: "2026-07-03T00:00:00Z", label: null, mode: "green",
    scenarios: [{ id: "A1", judge_verdict: "PASS", judge_reason: "greeted", suspect: false, override: null, note: "", reps: 2, pass_threshold: 0.5 }],
  }, { shipBar: { total: 1, min_pass: 1, no_critical_fail: true }, critical: ["A1"] });
  return { runDir, skillDir };
}

describe("cmdGrade on a --reps run", () => {
  test("a --reps run is now re-gradable (no longer rejected)", async () => {
    const { runDir } = repsRunFixture();
    const before = readFileSync(join(runDir, "results.yaml"), "utf8");
    // Inject a fake judge so this test is hermetic: no `pi`/`claude` subprocess
    // is ever spawned. This proves both that the old reps-run rejection is
    // gone AND that a re-grade actually happens (aggregated verdict, updated
    // results.yaml) — not just "didn't throw a specific message".
    const fake: HarnessAdapter = {
      name: "pi",
      available: async () => true,
      run: async () => "",
      judge: async () => "1. PASS — ok\nVERDICT: PASS\nREASON: fine",
    };

    await cmdGrade(args(runDir), fake);

    const after = readResults(runDir);
    const a1 = after.scenarios.find((s) => s.id === "A1")!;
    expect(a1.judge_verdict).toBe("PASS"); // re-judged both reps → aggregated PASS
    expect(a1.reps).toBe(2);
    expect(readFileSync(join(runDir, "results.yaml"), "utf8")).not.toBe(before); // results updated
    expect(after.timestamp).toBe("2026-07-03T00:00:00Z"); // re-grade preserves the run's original timestamp
  });
});

describe("cmdGrade re-grades a run in the run's OWN mode", () => {
  const fakeJudge: HarnessAdapter = {
    name: "pi",
    available: async () => true,
    run: async () => "",
    judge: async () => "1. FAIL — no greeting\nVERDICT: FAIL\nREASON: never said hello",
  };

  function plainRun(mode: string) {
    const skillDir = tmp();
    mkdirSync(join(skillDir, "tests"), { recursive: true });
    writeFileSync(join(skillDir, "tests", "specification.yaml"), SPEC, "utf8");
    const runDir = join(skillDir, "tests", "results", "pi-fake", "2026-07-03T00-00-00Z");
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, `A1.${mode}.txt`), "USER: Say hello.\nASSISTANT: Hi!", "utf8");
    writeResults(runDir, {
      skill: "golden", harness: "pi", model: "fireworks:fake",
      judge: { provider: "claude-code", model: "opus" },
      timestamp: "2026-07-03T00:00:00Z", label: null, mode,
      scenarios: [{ id: "A1", judge_verdict: "PASS", judge_reason: "greeted", suspect: false, override: null, note: "" }],
    }, mode === "red" ? null : { shipBar: { total: 1, min_pass: 1, no_critical_fail: true }, critical: ["A1"] });
    return runDir;
  }

  // A force run's transcripts are `A1.force.txt`. Looking for green ones threw
  // "nothing to re-grade" — which is how ten scorable force runs in the reference
  // corpus could not be re-judged OR graded at all.
  test("a force run is re-gradable and IS scored", async () => {
    const runDir = plainRun("force");
    await cmdGrade(args(runDir), fakeJudge);
    const after = readResults(runDir);
    expect(after.scenarios[0].judge_verdict).toBe("FAIL"); // the fake judge was actually reached
    expect(after.mode).toBe("force");
    expect(after.effective_grade.total).toBe(1);
    expect(after.effective_grade.note).not.toMatch(/not scored/);
  });

  test("a red run is re-gradable too, and stays unscored", async () => {
    const runDir = plainRun("red");
    await cmdGrade(args(runDir), fakeJudge);
    const after = readResults(runDir);
    expect(after.scenarios[0].judge_verdict).toBe("FAIL");
    expect(after.effective_grade.note).toBe("mode=red (not scored)");
    expect(after.effective_grade.letter).toBe("-");
  });

  test("a run whose own-mode transcripts are absent is still refused, naming that mode", async () => {
    const runDir = plainRun("green");
    rmSync(join(runDir, "A1.green.txt"));
    const before = readFileSync(join(runDir, "results.yaml"), "utf8");
    await expect(cmdGrade(args(runDir), fakeJudge)).rejects.toThrow(/no green transcripts/);
    expect(readFileSync(join(runDir, "results.yaml"), "utf8")).toBe(before);
  });
});

describe("cmdGrade refuses to drop a recorded scenario the spec no longer has", () => {
  test("spec drift (B1 removed) → rejects, does not silently shrink results.yaml", async () => {
    const { runDir, skillDir } = threeScenarioRun();
    // All three transcripts are present on disk...
    for (const id of ["A1", "B1", "C1"]) {
      writeFileSync(join(runDir, `${id}.green.txt`), `USER: hi\nASSISTANT: ${id}`, "utf8");
    }
    // ...but the spec has since dropped B1. The recorded B1 verdict must not be
    // silently discarded just because the loop iterates the current spec.
    const SPEC_NO_B1 = MULTI_SPEC.replace(/  - id: B1\n    title: holds\n    turns: \["Again."\]\n    checklist: \["greets again"\]\n/, "");
    writeFileSync(join(skillDir, "tests", "specification.yaml"), SPEC_NO_B1, "utf8");
    const before = readFileSync(join(runDir, "results.yaml"), "utf8");

    await expect(cmdGrade(args(runDir))).rejects.toThrow(/cannot re-grade B1/);

    expect(readFileSync(join(runDir, "results.yaml"), "utf8")).toBe(before);
  });
});
