import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { readResults, writeResults, type HarnessAdapter } from "@skill-check/core";
import { handleSkillCheck } from "../src/commands.js";

function skillFixture(): string {
  const d = mkdtempSync(join(tmpdir(), "sc-cmd-"));
  mkdirSync(join(d, "tests"), { recursive: true });
  writeFileSync(join(d, "tests", "specification.yaml"),
    `skill: demo\njudge_persona: a judge.\nship_bar: { total: 1, min_pass: 1 }\nscenarios:\n  - id: A1\n    title: t\n    turns: ["hi"]\n    checklist: ["ok"]\n`, "utf8");
  return d;
}

interface Notification { msg: string; level: string }

function fakeCtx(cwd: string) {
  const notified: Notification[] = [];
  const statuses: string[] = [];
  return {
    cwd,
    hasUI: true,
    ui: {
      notify: (msg: string, level: string = "info") => notified.push({ msg, level }),
      setStatus: (_key: string, msg: string) => statuses.push(msg),
    },
    notified,
    statuses,
  };
}

const fakeAdapter: HarnessAdapter = {
  name: "pi",
  available: async () => true,
  run: async () => "USER: hi\nASSISTANT: ok",
  judge: async () => "1. PASS — ok\nVERDICT: PASS\nREASON: fine",
};

describe("handleSkillCheck", () => {
  it("run streams verdicts and reports the scorecard", async () => {
    const skillDir = skillFixture();
    const ctx = fakeCtx(skillDir);
    await handleSkillCheck("run --reps 1", ctx, { adapter: fakeAdapter });

    const summary = ctx.notified.find((n) => /demo/.test(n.msg));
    expect(summary).toBeTruthy();
    expect(summary!.msg).toMatch(/SHIP|NOT READY/);
    expect(ctx.notified.some((n) => /A1/.test(n.msg))).toBe(true);
  });

  it("a trailing --mode with no value is treated as unset (defaults to green), not an invalid mode", async () => {
    const skillDir = skillFixture();
    const ctx = fakeCtx(skillDir);
    await handleSkillCheck("run --reps 1 --mode", ctx, { adapter: fakeAdapter });

    const summary = ctx.notified.find((n) => /demo/.test(n.msg));
    expect(summary).toBeTruthy();
    expect(summary!.msg).toMatch(/SHIP/); // green mode + the fake adapter's PASS verdict ships
  });

  it("unknown subcommand shows usage", async () => {
    const ctx = fakeCtx(process.cwd());
    await expect(handleSkillCheck("bogus", ctx)).resolves.not.toThrow();

    expect(ctx.notified.some((n) => /run/.test(n.msg) && /judge/.test(n.msg) && /review/.test(n.msg))).toBe(true);
  });

  it("review starts the server and notifies a URL", async () => {
    const skillDir = skillFixture();
    const ctx = fakeCtx(skillDir);
    const handle = await handleSkillCheck("review", ctx, { adapter: fakeAdapter });

    expect(handle).toBeTruthy();
    expect(ctx.notified.some((n) => /http:\/\/127\.0\.0\.1:\d+/.test(n.msg))).toBe(true);
    (handle as { close: () => void } | undefined)?.close();
  });

  it("judge re-judges a run dir's green transcripts and rewrites results.yaml", async () => {
    const skillDir = skillFixture();
    const runDir = join(skillDir, "tests", "results", "pi-fake", "2026-07-05T00-00-00Z");
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, "A1.green.txt"), "USER: hi\nASSISTANT: ok", "utf8");
    const ctx = fakeCtx(skillDir);

    await handleSkillCheck(`judge ${runDir}`, ctx, { adapter: fakeAdapter });

    const results = readResults(runDir);
    expect(results.scenarios[0]).toMatchObject({ id: "A1", judge_verdict: "PASS" });
    expect(ctx.notified.some((n) => /re-judged/.test(n.msg))).toBe(true);
  });

  it("judge re-judges with the run's RECORDED judge, not a hardcoded default", async () => {
    const skillDir = skillFixture();
    const runDir = join(skillDir, "tests", "results", "pi-fake", "2026-07-05T00-00-00Z");
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, "A1.green.txt"), "USER: hi\nASSISTANT: ok", "utf8");
    writeResults(runDir, {
      skill: "demo",
      harness: "pi",
      model: "fireworks:accounts/fireworks/models/deepseek-v4-pro",
      judge: { provider: "fireworks", model: "custom-judge-model" },
      timestamp: "2026-07-05T00:00:00Z",
      label: null,
      mode: "green",
      scenarios: [{ id: "A1", judge_verdict: "FAIL", judge_reason: "stale", suspect: false, override: null, note: "" }],
    }, { shipBar: { total: 1, min_pass: 1 }, critical: [] });
    const ctx = fakeCtx(skillDir);

    await handleSkillCheck(`judge ${runDir}`, ctx, { adapter: fakeAdapter });

    const results = readResults(runDir);
    expect(results.judge).toEqual({ provider: "fireworks", model: "custom-judge-model" });
  });

  it("judge honors an explicit --judge flag over the run's recorded judge", async () => {
    const skillDir = skillFixture();
    const runDir = join(skillDir, "tests", "results", "pi-fake", "2026-07-05T00-00-00Z");
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, "A1.green.txt"), "USER: hi\nASSISTANT: ok", "utf8");
    writeResults(runDir, {
      skill: "demo",
      harness: "pi",
      model: "fireworks:accounts/fireworks/models/deepseek-v4-pro",
      judge: { provider: "fireworks", model: "custom-judge-model" },
      timestamp: "2026-07-05T00:00:00Z",
      label: null,
      mode: "green",
      scenarios: [{ id: "A1", judge_verdict: "FAIL", judge_reason: "stale", suspect: false, override: null, note: "" }],
    }, { shipBar: { total: 1, min_pass: 1 }, critical: [] });
    const ctx = fakeCtx(skillDir);

    await handleSkillCheck(`judge ${runDir} --judge fireworks:another-judge-model`, ctx, { adapter: fakeAdapter });

    const results = readResults(runDir);
    expect(results.judge).toEqual({ provider: "fireworks", model: "another-judge-model" });
  });

  it("judge resolves a relative run-dir against ctx.cwd, not process.cwd()", async () => {
    const skillDir = skillFixture();
    const runDir = join(skillDir, "tests", "results", "pi-fake", "2026-07-05T00-00-00Z");
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, "A1.green.txt"), "USER: hi\nASSISTANT: ok", "utf8");
    const relRunDir = relative(skillDir, runDir);
    const ctx = fakeCtx(skillDir);

    await handleSkillCheck(`judge ${relRunDir}`, ctx, { adapter: fakeAdapter });

    const results = readResults(runDir);
    expect(results.scenarios[0]).toMatchObject({ id: "A1", judge_verdict: "PASS" });
  });
});
