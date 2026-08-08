import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { readResults, writeResults, type HarnessAdapter } from "@skill-harness/core";
import { handleSkillCheck, type CmdCtx } from "../src/commands.js";

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

  // The flag parser dropped valueless flags entirely, so `--canary` was accepted
  // and ignored — the worst failure for a flag whose job is to refuse a bad run.
  it("a bare --canary is honored: a model that cannot quote its skill aborts the run", async () => {
    const skillDir = skillFixture();
    writeFileSync(join(skillDir, "SKILL.md"), "---\nname: demo\n---\n\n## Quote me exactly\n", "utf8");
    const ctx = fakeCtx(skillDir);
    await expect(handleSkillCheck("run --reps 1 --canary", ctx, { adapter: fakeAdapter }))
      .rejects.toThrow(/delivery canary FAILED/);
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
      // The provider is incidental to what this test asserts (which judge gets
      // *chosen*), but it has to be a non-metered one: a metered judge inherited
      // from a run's record is refused outright now — see assertJudgeAllowed.
      judge: { provider: "ollama", model: "custom-judge-model" },
      timestamp: "2026-07-05T00:00:00Z",
      label: null,
      mode: "green",
      scenarios: [{ id: "A1", judge_verdict: "FAIL", judge_reason: "stale", suspect: false, override: null, note: "" }],
    }, { shipBar: { total: 1, min_pass: 1 }, critical: [] });
    const ctx = fakeCtx(skillDir);

    await handleSkillCheck(`judge ${runDir}`, ctx, { adapter: fakeAdapter });

    const results = readResults(runDir);
    expect(results.judge).toEqual({ provider: "ollama", model: "custom-judge-model" });
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
      judge: { provider: "ollama", model: "custom-judge-model" },
      timestamp: "2026-07-05T00:00:00Z",
      label: null,
      mode: "green",
      scenarios: [{ id: "A1", judge_verdict: "FAIL", judge_reason: "stale", suspect: false, override: null, note: "" }],
    }, { shipBar: { total: 1, min_pass: 1 }, critical: [] });
    const ctx = fakeCtx(skillDir);

    await handleSkillCheck(`judge ${runDir} --judge ollama:another-judge-model`, ctx, { adapter: fakeAdapter });

    const results = readResults(runDir);
    expect(results.judge).toEqual({ provider: "ollama", model: "another-judge-model" });
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

describe("judge --auto-rejudge (extension parity)", () => {
  const SPEC = `skill: demo
judge_persona: p
ship_bar: { total: 1, min_pass: 1, no_critical_fail: true }
critical: []
scenarios:
  - id: A1
    title: one
    turns: ["x"]
    checklist: ["does the thing"]
`;

  function setup() {
    const dir = mkdtempSync(join(tmpdir(), "sh-ext-adj-"));
    const runDir = join(dir, "tests", "results", "tag", "2026-08-08T00-00-00");
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(dir, "tests", "specification.yaml"), SPEC, "utf8");
    writeFileSync(join(runDir, "A1.green.txt"), "USER: x\nASSISTANT: done", "utf8");
    writeResults(runDir, {
      skill: "demo", harness: "pi", model: "fireworks:x",
      judge: { provider: "claude-code", model: "opus" },
      timestamp: "2026-08-08T00-00-00", label: null, mode: "green",
      scenarios: [{ id: "A1", judge_verdict: "PASS", judge_reason: "ok", suspect: false, override: null, note: "" }],
    }, { shipBar: { total: 1, min_pass: 1, no_critical_fail: true }, critical: [] });
    return { dir, runDir };
  }

  /** A judge that misfires once, then answers cleanly. Counts every call. */
  function misfiringJudge() {
    const state = { calls: 0 };
    let first = true;
    const adapter = {
      name: "pi",
      available: async () => true,
      run: async () => "",
      judge: async () => {
        state.calls++;
        if (first) { first = false; return "1. PASS\nVERDICT: FAIL\nREASON: contradicts itself"; }
        return "1. PASS\nVERDICT: PASS\nREASON: fine";
      },
    } as unknown as HarnessAdapter;
    return { state, adapter };
  }

  function ctxWith(confirmAnswer?: boolean) {
    const said: string[] = [];
    const ui: Record<string, unknown> = { notify: (m: string) => said.push(m), setStatus: () => {} };
    // Omitting `confirm` models `-p` / `--mode json`, where no dialog exists.
    if (confirmAnswer !== undefined) ui.confirm = async () => confirmAnswer;
    return { said, ctx: { cwd: "/tmp", hasUI: true, ui } as unknown as CmdCtx };
  }

  it("spends nothing extra without the flag", async () => {
    const { runDir } = setup();
    const { state, adapter } = misfiringJudge();
    const { ctx } = ctxWith(true);
    await handleSkillCheck(`judge ${runDir}`, ctx, { adapter });
    expect(state.calls).toBe(1); // the first-wave regrade only
  });

  it("discloses the ceiling in counts, never dollars", async () => {
    const { runDir } = setup();
    const { adapter } = misfiringJudge();
    const { said, ctx } = ctxWith(true);
    await handleSkillCheck(`judge ${runDir} --auto-rejudge`, ctx, { adapter });
    const text = said.join("\n");
    expect(text).toMatch(/additional judge call\(s\)/);
    expect(text).not.toMatch(/\$/);
  });

  it("cancels without spending when the dialog is declined", async () => {
    const { runDir } = setup();
    const { state, adapter } = misfiringJudge();
    const { said, ctx } = ctxWith(false);
    await handleSkillCheck(`judge ${runDir} --auto-rejudge`, ctx, { adapter });
    expect(state.calls).toBe(1); // first wave only — the dialog stopped it
    expect(said.join("\n")).toMatch(/cancelled — nothing spent/);
  });

  it("proceeds when the dialog is accepted", async () => {
    const { runDir } = setup();
    const { state, adapter } = misfiringJudge();
    const { ctx } = ctxWith(true);
    await handleSkillCheck(`judge ${runDir} --auto-rejudge`, ctx, { adapter });
    expect(state.calls).toBe(2); // first wave + one adjudication call
  });

  it("treats the flag as consent when no dialog exists, and says so", async () => {
    // `-p` / `--mode json`: no confirm surface. Typing --auto-rejudge IS the
    // authorization, exactly as on the CLI — but it is said out loud so the
    // consent path is visible in the transcript rather than inferred.
    const { runDir } = setup();
    const { state, adapter } = misfiringJudge();
    const { said, ctx } = ctxWith(undefined);
    await handleSkillCheck(`judge ${runDir} --auto-rejudge`, ctx, { adapter });
    expect(state.calls).toBe(2);
    expect(said.join("\n")).toMatch(/`--auto-rejudge` is the authorization/);
  });

  it("accepts a tie-break judge, at parity with the CLI", async () => {
    const { runDir } = setup();
    const { state, adapter } = misfiringJudge();
    const { said, ctx } = ctxWith(true);
    await handleSkillCheck(`judge ${runDir} --auto-rejudge --tie-break-judge claude-code:j3`, ctx, { adapter });
    expect(said.join("\n")).toMatch(/tie-break judge: claude-code:j3/);
    // Ceiling doubles with a third judge available.
    expect(said.join("\n")).toMatch(/up to 2 additional judge call\(s\)/);
    expect(state.calls).toBe(3); // first wave + secondary + tie-break
  });

  it("refuses a metered secondary judge", async () => {
    const { runDir } = setup();
    const { adapter } = misfiringJudge();
    const { ctx } = ctxWith(true);
    await expect(
      handleSkillCheck(`judge ${runDir} --auto-rejudge --secondary-judge anthropic:claude-opus-4-8`, ctx, { adapter }),
    ).rejects.toThrow(/metered|allow-metered-judge/i);
  });
});
