import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSkillModel } from "../src/run.js";
import { loadSpec } from "../src/spec.js";
import type { Arm } from "../src/arms.js";
import type { HarnessAdapter, RunReq } from "../src/adapters/types.js";

function corpus(): { root: string; dir: string; specPath: string } {
  const root = mkdtempSync(join(tmpdir(), "sh-armrun-"));
  const dir = join(root, "greeter");
  mkdirSync(join(dir, "tests"), { recursive: true });
  mkdirSync(join(root, "agents"), { recursive: true });
  for (const n of ["plan", "review"]) {
    writeFileSync(join(root, "agents", `${n}.md`), `---\nname: ${n}\ntools: read\n---\n\nbody\n`, "utf8");
  }
  writeFileSync(join(dir, "SKILL.md"), "---\nname: greeter\n---\n\n## Greet\nSay hello.\n", "utf8");
  const specPath = join(dir, "tests", "specification.yaml");
  writeFileSync(
    specPath,
    [
      "skill: greeter",
      "judge_persona: a friendly reviewer",
      "ship_bar: { total: 1, min_pass: 1, no_critical_fail: true }",
      "scenarios:",
      "  - id: A1",
      "    title: greets",
      "    turns: ['hi']",
      "    checklist: ['says hello']",
    ].join("\n") + "\n",
    "utf8",
  );
  return { root, dir, specPath };
}

/** A `mode: seeded` corpus: one scenario with a fixture, no gates declared. */
function seededCorpus(): { root: string; dir: string; specPath: string } {
  const root = mkdtempSync(join(tmpdir(), "sh-armrun-seeded-"));
  const dir = join(root, "golden");
  mkdirSync(join(dir, "tests", "fixtures", "S1"), { recursive: true });
  mkdirSync(join(root, "agents"), { recursive: true });
  for (const n of ["plan", "review"]) {
    writeFileSync(join(root, "agents", `${n}.md`), `---\nname: ${n}\ntools: read\n---\n\nbody\n`, "utf8");
  }
  writeFileSync(join(dir, "SKILL.md"), "---\nname: golden\n---\n\n## Fix\nFix it.\n", "utf8");
  writeFileSync(join(dir, "tests", "fixtures", "S1", "seed.ts"), "export const a = 1;\n", "utf8");
  const specPath = join(dir, "tests", "specification.yaml");
  writeFileSync(
    specPath,
    [
      "skill: golden",
      "judge_persona: a friendly reviewer",
      "ship_bar: { total: 1, min_pass: 1, no_critical_fail: true }",
      "scenarios:",
      "  - id: S1",
      "    title: fixes it",
      "    mode: seeded",
      "    fixture: fixtures/S1",
      "    turns: ['fix it']",
      "    checklist: ['fixes it']",
    ].join("\n") + "\n",
    "utf8",
  );
  return { root, dir, specPath };
}

function recordingAdapter(): {
  adapter: HarnessAdapter;
  reqs: RunReq[];
  seededAtCallTime: boolean[];
  piDirAtCallTime: boolean[];
} {
  const reqs: RunReq[] = [];
  // The workspace is torn down by `runRep`'s `finally` before `runSkillModel`
  // returns, so `req.cwd` is gone by the time a test can inspect it after the
  // fact — an existsSync check made AFTER the run resolves would read `false`
  // whether or not a leak happened, making it a vacuous check either way. What
  // actually matters — whether the file was there BEFORE the subject ran — has
  // to be captured here, at call time, not reconstructed afterward.
  const seededAtCallTime: boolean[] = [];
  const piDirAtCallTime: boolean[] = [];
  const adapter: HarnessAdapter = {
    name: "pi",
    available: async () => true,
    run: async (req) => {
      reqs.push(req);
      seededAtCallTime.push(existsSync(join(req.cwd, ".pi", "skills", "plan.md")));
      piDirAtCallTime.push(existsSync(join(req.cwd, ".pi")));
      return ">>> USER:\nhi\n\n<<< ASSISTANT:\nhello\n";
    },
    judge: async () => "VERDICT: PASS\n1. PASS",
    version: async () => "0.84.2",
  };
  return { adapter, reqs, seededAtCallTime, piDirAtCallTime };
}

const ARM = (root: string): Arm => ({
  name: "pi-daddy",
  extensions: [join(root, "agents", "plan.md")], // any existing file: the adapter is faked
  seedSkills: ["agents"],
  requireDefinitions: 2,
  env: { PI_GRANTS_LEDGER: "<run-dir>/pi-daddy.ledger.jsonl", WORKSPACE_LEDGER: "<workspace>/events.jsonl", PI_GRANTS_GRANT: "tool:read" },
});

describe("an arm reaches the subject and the record", () => {
  it("writes into a +arm tag, records the arm, and substitutes <run-dir>", async () => {
    const { root, dir, specPath } = corpus();
    const { adapter, reqs, seededAtCallTime } = recordingAdapter();
    const ambient = mkdtempSync(join(tmpdir(), "sh-ambient-"));
    const summary = await runSkillModel({
      spec: loadSpec(specPath),
      skillDir: dir,
      specPath,
      adapter,
      model: { provider: "openai-codex", model: "gpt-5.6-sol:medium" },
      modelToken: "openai-codex:gpt-5.6-sol:medium",
      judge: { provider: "claude-code", model: "claude-opus-4-8" },
      mode: "force",
      timestamp: "2026-08-22T00:00:00.000Z",
      arm: ARM(root),
      skillsRoot: root,
      ambientSkillsDir: ambient,
    });

    expect(summary.runDir).toContain("+pi-daddy");
    expect(summary.results.arm).toEqual({
      name: "pi-daddy",
      extensions: [join(root, "agents", "plan.md")],
      definitions: 2,
      ledger_events: 0, // I4: reportable outcome (no ledger written), not an absent field
      // The env IS the condition (grant, max depth), so it is part of the record —
      // without it two runs at different settings are byte-identical here and in
      // the same `+pi-daddy` tag, and `stability` reads the difference between two
      // conditions as one lineage flipping. Recorded as DECLARED: the substituted
      // form carries this run's temp path, which would make one condition look
      // like a new one on every run.
      env: { PI_GRANTS_GRANT: "tool:read", PI_GRANTS_LEDGER: "<run-dir>/pi-daddy.ledger.jsonl", WORKSPACE_LEDGER: "<workspace>/events.jsonl" },
    });

    const req = reqs[0];
    expect(req.extensions).toContain(join(root, "agents", "plan.md"));
    expect(req.armEnv!.PI_GRANTS_LEDGER).toBe(join(summary.runDir, "pi-daddy.ledger.jsonl"));
    expect(req.armEnv!.WORKSPACE_LEDGER).toBe(join(req.cwd, "events.jsonl"));
    expect(req.armEnv!.PI_GRANTS_GRANT).toBe("tool:read");
    expect(seededAtCallTime[0]).toBe(true);
  });

  it("changes nothing for the control arm", async () => {
    const { root, dir, specPath } = corpus();
    const { adapter, reqs, piDirAtCallTime } = recordingAdapter();
    const summary = await runSkillModel({
      spec: loadSpec(specPath),
      skillDir: dir,
      specPath,
      adapter,
      model: { provider: "openai-codex", model: "gpt-5.6-sol:medium" },
      modelToken: "openai-codex:gpt-5.6-sol:medium",
      judge: { provider: "claude-code", model: "claude-opus-4-8" },
      mode: "force",
      timestamp: "2026-08-22T00:00:00.000Z",
      skillsRoot: root,
    });
    expect(summary.runDir).not.toContain("+");
    expect(summary.results.arm).toBeUndefined();
    expect(reqs[0].armEnv).toBeUndefined();
    expect(piDirAtCallTime[0]).toBe(false);
  });
});

describe("an arm reaches a seeded scenario's subject", () => {
  it("merges the arm's extensions into a seeded scenario's request, with <run-dir> substituted", async () => {
    const { root, dir, specPath } = seededCorpus();
    const { adapter, reqs } = recordingAdapter();
    const ambient = mkdtempSync(join(tmpdir(), "sh-ambient-seeded-"));
    const summary = await runSkillModel({
      spec: loadSpec(specPath),
      skillDir: dir,
      specPath,
      adapter,
      model: { provider: "openai-codex", model: "gpt-5.6-sol:medium" },
      modelToken: "openai-codex:gpt-5.6-sol:medium",
      judge: { provider: "claude-code", model: "claude-opus-4-8" },
      mode: "force",
      timestamp: "2026-08-22T00:00:00.000Z",
      arm: ARM(root),
      skillsRoot: root,
      ambientSkillsDir: ambient,
    });

    expect(summary.runDir).toContain("+pi-daddy");
    expect(summary.results.arm).toEqual({
      name: "pi-daddy",
      extensions: [join(root, "agents", "plan.md")],
      definitions: 2,
      ledger_events: 0, // I4: reportable outcome (no ledger written), not an absent field
      // The env IS the condition (grant, max depth), so it is part of the record —
      // without it two runs at different settings are byte-identical here and in
      // the same `+pi-daddy` tag, and `stability` reads the difference between two
      // conditions as one lineage flipping. Recorded as DECLARED: the substituted
      // form carries this run's temp path, which would make one condition look
      // like a new one on every run.
      env: { PI_GRANTS_GRANT: "tool:read", PI_GRANTS_LEDGER: "<run-dir>/pi-daddy.ledger.jsonl", WORKSPACE_LEDGER: "<workspace>/events.jsonl" },
    });

    // A seeded scenario declares no `env.extensions` of its own here, so
    // anything in `req.extensions` had to come from the arm — this would be
    // `[]` if the arm's contribution never reached `runSeeded`'s request.
    const req = reqs[0];
    expect(req.extensions).toEqual([join(root, "agents", "plan.md")]);
    expect(req.armEnv!.PI_GRANTS_LEDGER).toBe(join(summary.runDir, "pi-daddy.ledger.jsonl"));
    expect(req.armEnv!.WORKSPACE_LEDGER).toBe(join(req.cwd, "events.jsonl"));
    expect(req.armEnv!.PI_GRANTS_GRANT).toBe("tool:read");
  });
});

describe("the arm's ledger is counted into the record (I4)", () => {
  // The pi-daddy ledger is gitignored and uncounted otherwise, so a vacuous arm
  // run (extension loaded, nothing ever delegated) would commit a record
  // indistinguishable from one that actually exercised delegation. The count
  // has to come from the SAME path the arm's own env points pi-daddy at
  // (`req.armEnv.PI_GRANTS_LEDGER`, with `<run-dir>` already substituted) —
  // faking that write is what proves `countLedgerEvents` reads the real file
  // rather than always reporting 0.
  //
  // Mutation: hardcoding `run.ts`'s `countLedgerEvents` to always `return 0`
  // (or dropping `ledger_events` from the recorded `arm` block entirely) makes
  // this test's `toBe(3)` assertion fail.
  it("records a non-zero ledger_events count when the subject actually wrote ledger lines", async () => {
    const { root, dir, specPath } = corpus();
    const ambient = mkdtempSync(join(tmpdir(), "sh-ambient-ledger-"));
    const adapter: HarnessAdapter = {
      name: "pi",
      available: async () => true,
      run: async (req) => {
        const ledgerPath = req.armEnv!.PI_GRANTS_LEDGER;
        writeFileSync(
          ledgerPath,
          [
            JSON.stringify({ tool: "read", at: "2026-08-22T00:00:00Z" }),
            JSON.stringify({ tool: "write", at: "2026-08-22T00:00:01Z" }),
            JSON.stringify({ tool: "read", at: "2026-08-22T00:00:02Z" }),
          ].join("\n") + "\n",
          "utf8",
        );
        return ">>> USER:\nhi\n\n<<< ASSISTANT:\nhello\n";
      },
      judge: async () => "VERDICT: PASS\n1. PASS",
      version: async () => "0.84.2",
    };
    const summary = await runSkillModel({
      spec: loadSpec(specPath),
      skillDir: dir,
      specPath,
      adapter,
      model: { provider: "openai-codex", model: "gpt-5.6-sol:medium" },
      modelToken: "openai-codex:gpt-5.6-sol:medium",
      judge: { provider: "claude-code", model: "claude-opus-4-8" },
      mode: "force",
      timestamp: "2026-08-22T00:00:00.000Z",
      arm: ARM(root),
      skillsRoot: root,
      ambientSkillsDir: ambient,
    });

    expect(summary.results.arm?.ledger_events).toBe(3);
  });
});

describe("the empty-response retry re-seeds the fresh workspace (T1)", () => {
  // `run.ts` tears down the half-mutated workspace and creates a fresh one when
  // the subject returns a blank assistant turn, then retries once. The fresh
  // workspace starts with no `.pi/skills/` at all — a retry that skipped
  // re-seeding would run pi-daddy with nothing to spawn on the attempt that
  // actually counts (the one whose transcript gets graded), while every artifact
  // still says `+pi-daddy`.
  //
  // Mutation: deleting the second `seedArmDefinitions(...)` call in run.ts (the
  // one inside the `attempt > 0` branch, right after the fresh workspace is
  // created) makes this test's second `seededFlags` entry come back `false`.
  it("seeds the arm's definitions into the retry's fresh workspace, not just the first attempt", async () => {
    const { root, dir, specPath } = corpus();
    const ambient = mkdtempSync(join(tmpdir(), "sh-ambient-retry-"));
    const cwds: string[] = [];
    const seededFlags: boolean[] = [];
    let calls = 0;
    const adapter: HarnessAdapter = {
      name: "pi",
      available: async () => true,
      run: async (req) => {
        calls += 1;
        cwds.push(req.cwd);
        seededFlags.push(existsSync(join(req.cwd, ".pi", "skills", "plan.md")));
        // Attempt 1: a blank assistant turn — the harness-timeout shape that
        // triggers the retry. Attempt 2: an ordinary answer.
        return calls === 1 ? ">>> USER:\nhi\n\n<<< ASSISTANT:\n" : ">>> USER:\nhi\n\n<<< ASSISTANT:\nhello\n";
      },
      judge: async () => "VERDICT: PASS\n1. PASS",
      version: async () => "0.84.2",
    };
    const summary = await runSkillModel({
      spec: loadSpec(specPath),
      skillDir: dir,
      specPath,
      adapter,
      model: { provider: "openai-codex", model: "gpt-5.6-sol:medium" },
      modelToken: "openai-codex:gpt-5.6-sol:medium",
      judge: { provider: "claude-code", model: "claude-opus-4-8" },
      mode: "force",
      timestamp: "2026-08-22T00:00:00.000Z",
      arm: ARM(root),
      skillsRoot: root,
      ambientSkillsDir: ambient,
    });

    expect(calls).toBe(2); // the retry actually happened
    expect(cwds[0]).not.toBe(cwds[1]); // in a genuinely fresh workspace
    expect(seededFlags).toEqual([true, true]); // seeded on BOTH attempts
    // The graded transcript is the retry's, and it was seeded — a real answer,
    // not the harness-timeout ERROR the un-fixed code would have produced.
    expect(summary.results.scenarios[0].judge_verdict).toBe("PASS");
  });
});
