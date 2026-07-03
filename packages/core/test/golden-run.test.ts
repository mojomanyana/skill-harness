import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseSpec, runSkillModel, readResults,
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
    });

    expect(results.grade.passed).toBe(2);
    expect(results.grade.ship).toBe(true);
    expect(results.scenarios.map((s) => s.judge_verdict)).toEqual(["PASS", "PASS"]);

    const persisted = readResults(runDir);
    expect(persisted).toBeTruthy();
    expect(persisted!.grade.pct).toBe(100);

    const t = readFileSync(join(runDir, "A1.green.txt"), "utf8");
    expect(t).toContain("Say hello.");
    expect(t).toContain("Hello!");
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
    expect(results.grade.ship).toBe(false);
    expect(results.grade.passed).toBe(0);
  });
});
