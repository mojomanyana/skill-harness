import { describe, test, expect, vi, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HARNESS_VERSION, BAKED_DEFAULT_JUDGE, type HarnessAdapter } from "@skill-harness/core";
import { main, help, cmdRun, cmdGrade } from "../src/cli.js";

/** Capture console.log output while `fn` runs. */
async function captured(fn: () => Promise<void> | void): Promise<string> {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...a) => void lines.push(a.join(" ")));
  try {
    await fn();
  } finally {
    spy.mockRestore();
  }
  return lines.join("\n");
}

afterEach(() => {
  delete process.env.SKILL_HARNESS_JUDGE;
  delete process.env.SKILL_HARNESS_ALLOW_METERED_JUDGE;
  process.exitCode = 0;
});

/** A skill dir with one scenario and one already-graded run, for the grade path. */
function skillWithRun(recordedJudge: { provider: string; model: string }): string {
  const root = mkdtempSync(join(tmpdir(), "sh-judge-"));
  const skillDir = join(root, "demo");
  const testsDir = join(skillDir, "tests");
  mkdirSync(testsDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), "---\nname: demo\n---\nbody\n", "utf8");
  writeFileSync(
    join(testsDir, "specification.yaml"),
    `skill: demo\njudge_persona: a judge.\nship_bar: { total: 1, min_pass: 1 }\ncritical: []\nscenarios:\n  - id: A1\n    title: t\n    turns: ["do it"]\n    checklist: ["does it"]\n`,
    "utf8",
  );
  const runDir = join(testsDir, "results", "pi-fake", "2026-08-05T00-00-00Z");
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, "A1.green.txt"), "USER: do it\nASSISTANT: done", "utf8");
  writeFileSync(
    join(runDir, "results.yaml"),
    `schema: 2\nskill: demo\nharness: pi\nmodel: fireworks:fake\njudge: {provider: ${recordedJudge.provider}, model: ${recordedJudge.model}}\n` +
      `timestamp: '2026-08-05T00:00:00Z'\nlabel: null\nmode: green\n` +
      `effective_grade: {passed: 1, total: 1, pct: 100, letter: A, ship: true, note: ''}\n` +
      `scenarios:\n  - {id: A1, judge_verdict: PASS, judge_reason: ok, suspect: false, override: null, note: ''}\n`,
    "utf8",
  );
  return runDir;
}

describe("a metered judge is refused before anything is spent", () => {
  // The subject model is chosen per run and paying for it is the point. The judge
  // is a default, and a default that bills is a bug — this one billed a corpus once.
  test("run refuses an explicit --judge on a metered provider", async () => {
    await expect(
      cmdRun({ _: ["demo"], flags: { skills: "/nonexistent", judge: "anthropic:claude-opus-4-8" }, multi: {} }),
    ).rejects.toThrow(/refusing to judge with anthropic:claude-opus-4-8/);
  });

  // Ordering matters: the refusal has to beat every other failure, or a user with a
  // metered judge and a valid skill tree spends subject tokens before hearing about it.
  test("the refusal precedes even a bad --skills root", async () => {
    await expect(
      cmdRun({ _: ["demo"], flags: { skills: "/nonexistent", judge: "anthropic:x" }, multi: {} }),
    ).rejects.toThrow(/refusing to judge/);
  });

  test("--allow-metered-judge lets a deliberate metered run through to its real work", async () => {
    // It still fails — on the harness or the nonexistent skills root — but NOT on the
    // judge gate, which is what proves the opt-in works rather than that something
    // else happened to throw.
    let msg = "";
    try {
      await cmdRun({
        _: ["demo"],
        flags: { skills: "/nonexistent", judge: "anthropic:x", "allow-metered-judge": true },
        multi: {},
      });
    } catch (e) {
      msg = e instanceof Error ? e.message : String(e);
    }
    expect(msg).not.toBe("");
    expect(msg).not.toMatch(/refusing to judge/);
  });

  // The path nobody types a flag for: `grade` re-judges with the judge the RUN
  // recorded, so a results.yaml naming a metered judge spends on every regrade.
  // (Latent in the reference corpus — all ~140 committed runs there say claude-code —
  // which is why it needs a test rather than a bug report.)
  test("grade refuses a metered judge inherited from the run's own results.yaml", async () => {
    const runDir = skillWithRun({ provider: "anthropic", model: "claude-opus-4-8" });
    await expect(cmdGrade({ _: [runDir], flags: {}, multi: {} })).rejects.toThrow(
      /refusing to judge with anthropic:claude-opus-4-8[\s\S]*recorded judge/,
    );
  });

  test("grade proceeds when the recorded judge is a subscription one", async () => {
    const runDir = skillWithRun({ provider: "claude-code", model: "claude-opus-4-8" });
    const fake: HarnessAdapter = {
      name: "pi",
      available: async () => true,
      run: async () => "USER: do it\nASSISTANT: done",
      judge: async () => "1. PASS — ok\nVERDICT: PASS\nREASON: fine",
    };
    // Runs to completion rather than being gated — the point is that the policy
    // does not stand between a subscription judge and its work.
    await expect(cmdGrade({ _: [runDir], flags: {}, multi: {} }, fake)).resolves.toBeUndefined();
  });
});

describe("--version", () => {
  // A stale global install is the failure this exists to make visible: a 0.1.0
  // binary grading a 0.3.x corpus produces plausible numbers and says nothing.
  // Before this, `--version` was `unknown command` and exited 1.
  test("prints the harness version and exits clean", async () => {
    const out = await captured(() => main(["--version"]));
    expect(out.trim()).toBe(HARNESS_VERSION);
    // Untouched means success — `unknown command` used to set it to 1.
    expect(process.exitCode ?? 0).toBe(0);
  });

  test("-v is the same thing", async () => {
    expect((await captured(() => main(["-v"]))).trim()).toBe(HARNESS_VERSION);
  });

  test("the bare `version` subcommand works too", async () => {
    expect((await captured(() => main(["version"]))).trim()).toBe(HARNESS_VERSION);
  });
});

describe("help", () => {
  test("names the running version, so a screenshot of it is dateable", () => {
    expect(help()).toContain(HARNESS_VERSION);
  });

  // Rendered per call rather than frozen at module load, so what it prints is what
  // the next command will actually use.
  test("shows the environment's judge when one is set, not the baked default", () => {
    expect(help()).toContain(BAKED_DEFAULT_JUDGE);
    process.env.SKILL_HARNESS_JUDGE = "fireworks:accounts/fireworks/models/kimi-k3";
    const withEnv = help();
    expect(withEnv).toContain("kimi-k3");
    expect(withEnv).not.toContain(BAKED_DEFAULT_JUDGE);
  });
});
