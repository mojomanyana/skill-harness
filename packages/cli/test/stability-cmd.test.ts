import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeResults, loadSpec, sourceHashes, type ScenarioResult } from "@skill-harness/core";
import { main, cmdLint } from "../src/cli.js";

/**
 * The `stability` command and lint's info severity — the two places a boundary cell
 * reaches a human who did not go looking for it.
 */

const SPEC = `skill: golden
judge_persona: a judge.
ship_bar: { total: 1, min_pass: 1 }
critical: [A5]
scenarios:
  - id: A5
    title: holds the line
    turns: ["do it"]
    checklist: ["holds"]
`;

const tmps: string[] = [];
beforeEach(() => { process.exitCode = 0; delete process.env.GITHUB_ACTIONS; });
afterEach(() => {
  process.exitCode = 0;
  delete process.env.GITHUB_ACTIONS;
  while (tmps.length) rmSync(tmps.pop()!, { recursive: true, force: true });
});

async function capture<T>(fn: () => Promise<T>): Promise<{ result: T; logs: string }> {
  const logs: string[] = [];
  const orig = console.log;
  console.log = ((...a: unknown[]) => { logs.push(a.map(String).join(" ")); }) as typeof console.log;
  try {
    return { result: await fn(), logs: logs.join("\n") };
  } finally {
    console.log = orig;
  }
}

function cell(verdict: "PASS" | "FAIL"): ScenarioResult {
  return {
    id: "A5", judge_verdict: verdict, judge_reason: "because", suspect: false, override: null, note: "",
    reps: 3, passes: verdict === "PASS" ? 3 : 0, clean: 3, flakiness: 0, pass_threshold: 0.5,
  };
}

/** A skills root holding one skill with `verdicts.length` force runs of scenario A5. */
function rootWithRuns(verdicts: Array<"PASS" | "FAIL">): string {
  const root = mkdtempSync(join(tmpdir(), "sc-stabcmd-"));
  tmps.push(root);
  const skillDir = join(root, "golden");
  const specDir = join(skillDir, "tests");
  mkdirSync(specDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), "---\nname: golden\n---\n\n## Hold the line\n", "utf8");
  writeFileSync(join(specDir, "specification.yaml"), SPEC, "utf8");
  const spec = loadSpec(join(specDir, "specification.yaml"));
  const hashes = sourceHashes({ skillDir, specDir, scenarios: spec.scenarios, judgePersona: spec.judge_persona });
  verdicts.forEach((v, i) => {
    const ts = `2026-08-0${i + 1}T00:00:00Z`;
    const runDir = join(specDir, "results", "pi-fake", ts.replace(/[:.]/g, "-"));
    mkdirSync(runDir, { recursive: true });
    writeResults(runDir, {
      skill: "golden", harness: "pi", model: "fireworks:fake",
      judge: { provider: "claude-code", model: "opus" },
      timestamp: ts, label: null, mode: "force", source_hashes: hashes, scenarios: [cell(v)],
    }, { shipBar: spec.ship_bar, critical: spec.critical });
  });
  return root;
}

describe("skill-harness stability", () => {
  it("reports a boundary cell, its path, and that within-run flakiness cannot see it", async () => {
    const root = rootWithRuns(["PASS", "FAIL"]);
    const { logs } = await capture(() => main(["stability", "golden", "--skills", root]));
    expect(logs).toMatch(/⇄ CRITICAL A5 flipped its verdict in 1 of 1/);
    expect(logs).toMatch(/PASS!→FAIL!/);
    expect(logs).toMatch(/INTERNALLY UNANIMOUS/);
    expect(logs).toMatch(/1 boundary cell/);
    expect(logs).toMatch(/mode=force/);
    // A read-only view is never a gate: it says what it found and exits clean.
    expect(process.exitCode).toBe(0);
  });

  it("says so plainly when nothing flipped, without claiming more than one step proves", async () => {
    const root = rootWithRuns(["PASS", "PASS"]);
    const { logs } = await capture(() => main(["stability", "golden", "--skills", root]));
    expect(logs).toMatch(/0 boundary cell/);
    expect(logs).not.toMatch(/⇄/);
    expect(logs).toMatch(/1 held their verdict/);
  });

  it("--all lists the quiet cells too", async () => {
    const root = rootWithRuns(["PASS", "PASS"]);
    const { logs } = await capture(() => main(["stability", "golden", "--skills", root, "--all"]));
    expect(logs).toMatch(/A5 held its verdict across 1 comparable run-to-run step/);
  });

  it("explains itself instead of printing an empty table when there is one run", async () => {
    const root = rootWithRuns(["PASS"]);
    const { logs } = await capture(() => main(["stability", "golden", "--skills", root]));
    expect(logs).toMatch(/0 boundary cell/);
    expect(logs).toMatch(/no comparable step/);
  });

  it("rejects a window that cannot contain a step", async () => {
    const root = rootWithRuns(["PASS", "FAIL"]);
    await expect(main(["stability", "golden", "--skills", root, "--window", "1"]))
      .rejects.toThrow(/--window must be an integer >= 2/);
  });

  it("is in --help, next to the other free commands", async () => {
    const { logs } = await capture(() => main(["help"]));
    expect(logs).toMatch(/stability <skill\|all>/);
    expect(logs).toMatch(/free, offline/);
  });
});

describe("cmdLint with a boundary cell", () => {
  function lintArgs(root: string) {
    return { _: ["golden"], flags: { skills: root }, multi: {} };
  }

  it("prints the note, keeps the skill's ✓, and exits 0", async () => {
    const root = rootWithRuns(["PASS", "FAIL"]);
    const { logs } = await capture(() => cmdLint(lintArgs(root)));
    expect(logs).toMatch(/ℹ .*A5: stability —/);
    expect(logs).toMatch(/^✓ /m); // the gate still passes
    expect(logs).toMatch(/0 finding\(s\), 1 note\(s\) \(do not fail the gate\)/);
    expect(process.exitCode).toBe(0);
  });

  it("annotates GitHub Actions as a notice, not an error", async () => {
    process.env.GITHUB_ACTIONS = "true";
    const root = rootWithRuns(["PASS", "FAIL"]);
    const { logs } = await capture(() => cmdLint(lintArgs(root)));
    expect(logs).toMatch(/::notice title=skill-harness::.*stability/);
    expect(logs).not.toMatch(/::error title=skill-harness::.*stability/);
  });
});
