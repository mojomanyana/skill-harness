import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, cpSync, readdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, isAbsolute } from "node:path";
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
      timestamp: "2026-07-03T00-00-00-000Z",
      now: () => "2026-07-03T00:00:00.000Z",
      label: "round-1",
    });

    expect(results.schema).toBe(2);
    expect(results.label).toBe("round-1");
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

    // judge-raw persisted next to the transcript
    expect(readFileSync(join(runDir, "A1.green.judge.txt"), "utf8")).toContain("VERDICT");

    const events = readJournal(runDir);
    expect(events.map((e) => e.event)).toEqual([
      "run-started",
      "scenario-started", "judge-verdict",
      "scenario-started", "judge-verdict",
      "score",
    ]);
    const started = events[0] as Extract<typeof events[number], { event: "run-started" }>;
    expect(started.skill).toBe("golden-skill");
    expect(started.label).toBe("round-1");
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
      mode: "green",
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
      mode: "green",
      timestamp: "2026-07-03T00-00-00-002Z",
    });
    expect(results.effective_grade.passed).toBeGreaterThanOrEqual(1); // min_pass satisfied
    expect(results.effective_grade.ship).toBe(false);                 // gated by critical alone
    expect(results.effective_grade.note).toMatch(/critical/);
  });

  it("--parallel N produces the same results.yaml as sequential, and cleans up workspaces", async () => {
    const wsRoot = mkdtempSync(join(tmpdir(), "sc-ws-root-"));
    const savedTmp = process.env.TMPDIR;
    process.env.TMPDIR = wsRoot; // createWorkspace's mkdtemp(tmpdir()) now lands here, isolated from other test files
    try {
      const run = async (concurrency: number, ts: string) => {
        const skillDir = mkdtempSync(join(tmpdir(), "sc-golden-par-"));
        cpSync(FIXTURE, skillDir, { recursive: true });
        const specPath = join(skillDir, "tests", "specification.yaml");
        const spec = parseSpec(readFileSync(specPath, "utf8"), specPath);
        const { runDir } = await runSkillModel({
          spec, skillDir, specPath, adapter: fakeAdapter,
          model: { provider: "fireworks", model: "fake-model" },
          modelToken: "fireworks:fake-model",
          judge: { provider: "claude-code", model: "opus" },
          mode: "green", timestamp: ts, now: () => "2026-07-04T00:00:00.000Z",
          concurrency,
        });
        return readFileSync(join(runDir, "results.yaml"), "utf8");
      };
      const seq = await run(1, "2026-07-04T00-00-00-010Z");
      const par = await run(2, "2026-07-04T00-00-00-011Z");
      const strip = (s: string) => s.replace(/timestamp:.*/g, "timestamp: X");
      expect(strip(par)).toBe(strip(seq));

      // Only this test's scenario workspaces land under wsRoot, so this scan is hermetic.
      const leaked = readdirSync(wsRoot).filter((n) => n.startsWith("sc-ws-"));
      expect(leaked).toEqual([]);
    } finally {
      if (savedTmp === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = savedTmp;
      rmSync(wsRoot, { recursive: true, force: true });
    }
  });

  it("judges in a fresh neutral workspace, never the scenario's own cwd", async () => {
    const skillDir = mkdtempSync(join(tmpdir(), "sc-golden-neutral-"));
    cpSync(FIXTURE, skillDir, { recursive: true });
    const specPath = join(skillDir, "tests", "specification.yaml");
    const specText = readFileSync(specPath, "utf8");
    // Single-scenario spec so there's exactly one harness cwd and one judge cwd to compare.
    const spec = parseSpec(specText, specPath);
    spec.scenarios = [spec.scenarios[0]];

    const seenRunCwds: string[] = [];
    const seenJudgeCwds: string[] = [];
    const recordingAdapter: HarnessAdapter = {
      name: "pi",
      available: async () => true,
      run: async (req: RunReq) => {
        seenRunCwds.push(req.cwd);
        return req.turns.map((t, i) => `>>> USER (turn ${i + 1}/${req.turns.length}):\n${t}\n\n<<< ASSISTANT:\nHello!\n`).join("\n");
      },
      judge: async (req: JudgeReq) => {
        seenJudgeCwds.push(req.cwd);
        return "1. PASS — greets\nVERDICT: PASS\nREASON: greeted politely";
      },
    };

    await runSkillModel({
      spec,
      skillDir,
      specPath,
      adapter: recordingAdapter,
      model: { provider: "fireworks", model: "fake-model" },
      modelToken: "fireworks:fake-model",
      judge: { provider: "claude-code", model: "opus" },
      mode: "green",
      timestamp: "2026-07-04T00-00-00-000Z",
      now: () => "2026-07-04T00:00:00.000Z",
    });

    expect(seenRunCwds).toHaveLength(1);
    expect(seenJudgeCwds).toHaveLength(1);
    expect(seenRunCwds[0]).not.toBe(seenJudgeCwds[0]);
    expect(isAbsolute(seenRunCwds[0])).toBe(true);
    expect(isAbsolute(seenJudgeCwds[0])).toBe(true);
  });

  it("--reps N aggregates pass-rate, flakiness, and writes rep-suffixed transcripts", async () => {
    const skillDir = mkdtempSync(join(tmpdir(), "sc-reps-"));
    cpSync(FIXTURE, skillDir, { recursive: true });
    const specPath = join(skillDir, "tests", "specification.yaml");
    const spec = parseSpec(readFileSync(specPath, "utf8"), specPath);

    // Judge alternates PASS/FAIL per call so a 3-rep run is flaky (2 PASS, 1 FAIL by call order).
    let jc = 0;
    const flakyAdapter: HarnessAdapter = {
      name: "pi",
      available: async () => true,
      run: async (req: RunReq) => req.turns.map((t) => `USER: ${t}\nASSISTANT: hi`).join("\n"),
      judge: async () => (jc++ % 3 === 2 ? "1. FAIL — off\nVERDICT: FAIL\nREASON: off" : "1. PASS — ok\nVERDICT: PASS\nREASON: ok"),
    };

    const { runDir, results } = await runSkillModel({
      spec, skillDir, specPath, adapter: flakyAdapter,
      model: { provider: "fireworks", model: "fake-model" },
      modelToken: "fireworks:fake-model",
      judge: { provider: "claude-code", model: "opus" },
      mode: "green", timestamp: "2026-07-04T00-00-00-050Z", now: () => "2026-07-04T00:00:00.000Z",
      reps: 3,
    });

    const s = results.scenarios[0];
    expect(s.reps).toBe(3);
    expect(s.passes).toBeGreaterThanOrEqual(0);
    expect(s.clean).toBe(3); // no misfires in this fixture — clean equals reps
    expect(typeof s.flakiness).toBe("number");
    expect(s.pass_threshold).toBe(0.5); // default threshold persisted on reps runs
    // rep-suffixed transcripts exist
    expect(existsSync(join(runDir, `${s.id}.green.rep0.txt`))).toBe(true);
    expect(existsSync(join(runDir, `${s.id}.green.rep2.txt`))).toBe(true);
  });

  it("N=1 suspect: preserves the judge's real verdict/reason (no reps placeholder) and blocks ship", async () => {
    const skillDir = mkdtempSync(join(tmpdir(), "sc-susp1-"));
    cpSync(FIXTURE, skillDir, { recursive: true });
    const specPath = join(skillDir, "tests", "specification.yaml");
    const spec = parseSpec(readFileSync(specPath, "utf8"), specPath);
    const misfireAdapter: HarnessAdapter = {
      name: "pi",
      available: async () => true,
      run: async (req: RunReq) => req.turns.map((t) => `USER: ${t}\nASSISTANT: hi`).join("\n"),
      // items say a FAIL exists but overall verdict is PASS → detectMisfire → suspect, real verdict PASS
      judge: async () => "1. PASS — ok\n2. FAIL — missing\nVERDICT: PASS\nREASON: looks ok",
    };
    const { results } = await runSkillModel({
      spec, skillDir, specPath, adapter: misfireAdapter,
      model: { provider: "fireworks", model: "fake-model" }, modelToken: "fireworks:fake-model",
      judge: { provider: "claude-code", model: "opus" }, mode: "green",
      timestamp: "2026-07-04T00-00-00-060Z", now: () => "2026-07-04T00:00:00.000Z",
    });
    const s = results.scenarios[0];
    expect(s.suspect).toBe(true);
    expect(s.judge_verdict).toBe("PASS");          // real verdict, NOT the "FAIL" placeholder
    expect(s.judge_reason).toBe("looks ok");        // real reason, NOT "1/1 reps misfired — re-judge"
    expect(s.reps).toBeUndefined();                 // N=1 omits reps fields
    expect(s.clean).toBeUndefined();                // N=1 omits reps fields
    expect(s.pass_threshold).toBeUndefined();       // N=1 omits reps fields
    expect(results.effective_grade.ship).toBe(false); // suspect blocks ship
  });
});
