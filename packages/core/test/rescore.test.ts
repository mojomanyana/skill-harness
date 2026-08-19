import { describe, it, expect } from "vitest";
import { mkdtempSync, cpSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSpec, runSkillModel, readResults, readJournal, rescoreRun, type HarnessAdapter } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, "fixtures", "golden-skill");

/** A run where A1 passes 2 of 3 reps and B1 passes 3 of 3. */
async function runWithWobble(threshold: number, critical = true) {
  const skillDir = mkdtempSync(join(tmpdir(), "sc-rescore-"));
  cpSync(FIXTURE, skillDir, { recursive: true });
  const specPath = join(skillDir, "tests", "specification.yaml");
  // A1 is critical in the golden fixture: gate it at `threshold`
  writeFileSync(specPath, readFileSync(specPath, "utf8").replace(
    "  - id: A1\n    title: says hello\n    critical: true\n",
    `  - id: A1\n    title: says hello\n    critical: true\n    pass_threshold: ${threshold}\n`,
  ));
  if (!critical) {
    writeFileSync(specPath, readFileSync(specPath, "utf8")
      .replace("critical: [A1]", "critical: []")
      .replace("    critical: true\n", ""));
  }
  const spec = parseSpec(readFileSync(specPath, "utf8"), specPath);
  let a1 = 0;
  const adapter: HarnessAdapter = {
    name: "pi", available: async () => true,
    run: async (r) => r.turns.map((t) => `>>> USER:\n${t}\n\n<<< ASSISTANT:\nHello!\n`).join("\n"),
    // A1's first rep fails, the other two pass; B1 always passes
    judge: async (r) => {
      const isA1 = r.prompt.includes("greets the user");
      if (isA1 && a1++ === 0) return "1. FAIL nope\nVERDICT: FAIL\nREASON: missed";
      return "1. PASS ok\nVERDICT: PASS\nREASON: fine";
    },
  };
  const { runDir } = await runSkillModel({
    spec, skillDir, specPath, adapter,
    model: { provider: "fireworks", model: "fake" }, modelToken: "fireworks:fake",
    judge: { provider: "claude-code", model: "opus" },
    mode: "green", timestamp: "2026-08-04T00-00-00-000Z", now: () => "2026-08-04T00:00:00.000Z",
    label: "release-1", reps: 3,
  });
  return { skillDir, specPath, runDir };
}

describe("rescoreRun", () => {
  it("never loosens a critical scenario below all-clean-repetitions-pass", async () => {
    const { skillDir, specPath, runDir } = await runWithWobble(1.0);
    const before = readResults(runDir)!;
    expect(before.scenarios.find((s) => s.id === "A1")!.judge_verdict).toBe("FAIL");
    expect(before.effective_grade.ship).toBe(false);

    // A lower declared threshold cannot weaken critical release semantics.
    writeFileSync(specPath, readFileSync(specPath, "utf8").replace("pass_threshold: 1", "pass_threshold: 0.5"));
    const spec = parseSpec(readFileSync(specPath, "utf8"), specPath);
    const { results, changes } = rescoreRun({ runDir, spec, now: () => "2026-08-04T01:00:00.000Z" });

    expect(changes).toEqual([]);
    expect(results.scenarios.find((s) => s.id === "A1")!.judge_verdict).toBe("FAIL");
    expect(results.scenarios.find((s) => s.id === "A1")!.pass_threshold).toBe(1);
    expect(results.effective_grade.ship).toBe(false);
    // persisted, and journaled
    expect(readResults(runDir)!.effective_grade.ship).toBe(false);
    expect(readJournal(runDir).map((e) => e.event)).toContain("rescore");
    expect(skillDir).toBeTruthy();
  });

  it("is a no-op when the threshold is unchanged", async () => {
    const { specPath, runDir } = await runWithWobble(0.5);
    const spec = parseSpec(readFileSync(specPath, "utf8"), specPath);
    const { changes } = rescoreRun({ runDir, spec });
    expect(changes).toEqual([]);
  });

  it("tightening ordinary policy also re-collapses — PASS to FAIL", async () => {
    const { specPath, runDir } = await runWithWobble(0.5, false);
    expect(readResults(runDir)!.scenarios.find((s) => s.id === "A1")!.judge_verdict).toBe("PASS");
    writeFileSync(specPath, readFileSync(specPath, "utf8").replace("pass_threshold: 0.5", "pass_threshold: 1.0"));
    const spec = parseSpec(readFileSync(specPath, "utf8"), specPath);
    const { results, changes } = rescoreRun({ runDir, spec });
    expect(changes[0]).toMatchObject({ id: "A1", from: "PASS", to: "FAIL" });
    expect(results.effective_grade.ship).toBe(false);
  });

  it("never invents a rate: ERROR and single-rep verdicts are carried verbatim", async () => {
    const { specPath, runDir } = await runWithWobble(1.0);
    const p = join(runDir, "results.yaml");
    // simulate a judge-outage ERROR with rep data, and a single-rep scenario
    let y = readFileSync(p, "utf8")
      .replace("judge_verdict: PASS", "judge_verdict: ERROR"); // first scenario in file
    writeFileSync(p, y);
    writeFileSync(specPath, readFileSync(specPath, "utf8").replace("pass_threshold: 1", "pass_threshold: 0.5"));
    const spec = parseSpec(readFileSync(specPath, "utf8"), specPath);
    const { results } = rescoreRun({ runDir, spec });
    const errored = results.scenarios.filter((s) => s.judge_verdict === "ERROR");
    expect(errored.length).toBe(1); // untouched, not collapsed into PASS/FAIL
  });
});
