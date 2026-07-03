import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseSpec, runSkillModel, readResults, readJournal,
  type HarnessAdapter, type RunReq, type JudgeReq,
} from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, "fixtures", "golden-skill");

const fakeAdapter: HarnessAdapter = {
  name: "pi",
  available: async () => true,
  run: async (req: RunReq) =>
    req.turns.map((t, i) => `>>> USER (turn ${i + 1}/${req.turns.length}):\n${t}\n\n<<< ASSISTANT:\nHello!\n`).join("\n"),
  judge: async (_req: JudgeReq) => "1. PASS — greets\nVERDICT: PASS\nREASON: greeted politely",
};

describe("golden pipeline run", () => {
  it("runs, grades, scores, persists — end to end with a fake adapter", async () => {
    const skillDir = mkdtempSync(join(tmpdir(), "sc-golden-"));
    cpSync(FIXTURE, skillDir, { recursive: true });
    const specPath = join(skillDir, "tests", "specification.yaml");
    const spec = parseSpec(readFileSync(specPath, "utf8"), specPath);

    const { runDir, results } = await runSkillModel({
      spec,
      skillDir,
      specPath,
      adapter: fakeAdapter,
      model: { provider: "fireworks", model: "fake-model" },
      modelToken: "fireworks:fake-model",
      judge: { provider: "claude-code", model: "opus" },
      mode: "green",
      cwd: skillDir,
      timestamp: "2026-07-03T00-00-00-000Z",
      now: () => "2026-07-03T00:00:00.000Z",
    });

    expect(results.schema).toBe(2);
    expect(results.label).toBeNull();
    expect(results.mode).toBe("green");
    expect(results.effective_grade.passed).toBe(2);
    expect(results.effective_grade.ship).toBe(true);
    expect(results.scenarios.map((s) => s.judge_verdict)).toEqual(["PASS", "PASS"]);

    const persisted = readResults(runDir);
    expect(persisted).toBeTruthy();
    expect(persisted!.effective_grade.pct).toBe(100);

    const t = readFileSync(join(runDir, "A1.green.txt"), "utf8");
    expect(t).toContain("Say hello.");
    expect(t).toContain("Hello!");

    const events = readJournal(runDir);
    expect(events.map((e) => e.event)).toEqual([
      "run-started",
      "scenario-started", "judge-verdict",
      "scenario-started", "judge-verdict",
      "score",
    ]);
    const started = events[0] as Extract<typeof events[number], { event: "run-started" }>;
    expect(started.skill).toBe("golden-skill");
    expect(started.label).toBeNull();
    const score = events.at(-1) as Extract<typeof events[number], { event: "score" }>;
    expect(score.ship).toBe(true);
  });

  it("gates the ship bar on a critical FAIL", async () => {
    const skillDir = mkdtempSync(join(tmpdir(), "sc-golden-"));
    cpSync(FIXTURE, skillDir, { recursive: true });
    const specPath = join(skillDir, "tests", "specification.yaml");
    const spec = parseSpec(readFileSync(specPath, "utf8"), specPath);

    const failingJudge: HarnessAdapter = {
      ...fakeAdapter,
      judge: async () => "1. FAIL — rude\nVERDICT: FAIL\nREASON: no greeting",
    };
    const { results } = await runSkillModel({
      spec, skillDir, specPath,
      adapter: failingJudge,
      model: { provider: "fireworks", model: "fake-model" },
      modelToken: "fireworks:fake-model",
      judge: { provider: "claude-code", model: "opus" },
      mode: "green", cwd: skillDir,
      timestamp: "2026-07-03T00-00-00-001Z",
    });
    expect(results.effective_grade.ship).toBe(false);
    expect(results.effective_grade.passed).toBe(0);
  });

  it("critical clause alone gates: min_pass met, one critical FAIL → NOT READY", async () => {
    const skillDir = mkdtempSync(join(tmpdir(), "sc-golden-"));
    cpSync(FIXTURE, skillDir, { recursive: true });
    const specPath = join(skillDir, "tests", "specification.yaml");
    const spec = parseSpec(readFileSync(specPath, "utf8"), specPath);
    // Loosen the bar so pass-count cannot explain the gate; only the critical clause can.
    spec.ship_bar.min_pass = 1;
    const criticalId = spec.critical[0];
    const criticalScenario = spec.scenarios.find((s) => s.id === criticalId)!;

    const selectiveJudge: HarnessAdapter = {
      ...fakeAdapter,
      judge: async (req: JudgeReq) =>
        req.prompt.includes(criticalScenario.checklist[0])
          ? "1. FAIL — missed\nVERDICT: FAIL\nREASON: critical miss"
          : "1. PASS — ok\nVERDICT: PASS\nREASON: fine",
    };
    const { results } = await runSkillModel({
      spec, skillDir, specPath,
      adapter: selectiveJudge,
      model: { provider: "fireworks", model: "fake-model" },
      modelToken: "fireworks:fake-model",
      judge: { provider: "claude-code", model: "opus" },
      mode: "green", cwd: skillDir,
      timestamp: "2026-07-03T00-00-00-002Z",
    });
    expect(results.effective_grade.passed).toBeGreaterThanOrEqual(1); // min_pass satisfied
    expect(results.effective_grade.ship).toBe(false);                 // gated by critical alone
    expect(results.effective_grade.note).toMatch(/critical/);
  });
});
