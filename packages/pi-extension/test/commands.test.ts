import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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
  judge: async () => '{"votes":[{"criterion":1,"vote":"PASS","reason":"ok"}],"verdict":"PASS","reason":"fine"}',
};

describe("handleSkillCheck", () => {
  it("accepts quoted separate-eval paths while keeping results out of the skill repo", async () => {
    const root = mkdtempSync(join(tmpdir(), "sc-cmd-overlay-"));
    const skillDir = join(root, "skills", "writer");
    const testsDir = join(root, "eval repo", "writer", "tests");
    mkdirSync(skillDir, { recursive: true }); mkdirSync(testsDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "---\nname: writer\ndescription: Write text\n---\nWrite clearly.\n");
    writeFileSync(join(testsDir, "specification.yaml"), "skill: writer\njudge_persona: a judge\nship_bar: { total: 1, min_pass: 1 }\nscenarios:\n  - id: A1\n    title: Draft\n    turns: [hi]\n    checklist: [ok]\n");
    const ctx = fakeCtx(root);
    await handleSkillCheck('run skills/writer --specs "eval repo" --model local:subject --judge local:judge', ctx, { adapter: fakeAdapter });
    expect(ctx.notified.some(notification => notification.msg.startsWith("writer "))).toBe(true);
  });
  it("run streams verdicts and reports the scorecard", async () => {
    const skillDir = skillFixture();
    const ctx = fakeCtx(skillDir);
    await handleSkillCheck("run --reps 1", ctx, { adapter: fakeAdapter });

    const summary = ctx.notified.find((n) => /demo/.test(n.msg));
    expect(summary).toBeTruthy();
    expect(summary!.msg).toMatch(/SHIP|NOT READY/);
    expect(ctx.notified.some((n) => /A1/.test(n.msg))).toBe(true);
  });

  it("run --only executes the selected scenario without changing its source specification", async () => {
    const skillDir = skillFixture();
    const specPath = join(skillDir, "tests", "specification.yaml");
    const spec = readFileSync(specPath, "utf8") + "  - id: A2\n    title: other\n    turns: [\"other\"]\n    checklist: [\"ok\"]\n";
    writeFileSync(specPath, spec.replace("total: 1, min_pass: 1", "total: 2, min_pass: 2"));
    const before = readFileSync(specPath);
    const subjects: string[][] = [];
    let judges = 0;
    const adapter: HarnessAdapter = {
      ...fakeAdapter,
      run: async req => { subjects.push(req.turns); return fakeAdapter.run(req); },
      judge: async req => { judges++; return fakeAdapter.judge(req); },
    };
    await handleSkillCheck("run --only A2 --reps 1", fakeCtx(skillDir), { adapter });
    expect(subjects).toEqual([["other"]]);
    expect(judges).toBe(1);
    expect(readFileSync(specPath)).toEqual(before);
  });

  it.each([
    ["run", "--out another-run"],
    ["run", "--spec alternate.yaml"],
    ["run", "--unknown-option"],
    ["judge", "--only A1"],
    ["judge", "--out another-run"],
    ["judge", "--spec alternate.yaml"],
    ["judge", "--unparsed-only"],
    ["judge", "--model local:subject"],
  ])("refuses unsupported %s flags before calls or mutations: %s", async (command, flags) => {
    const skillDir = skillFixture();
    const runDir = join(skillDir, "tests", "results", "pi-fake", "saved");
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, "A1.green.txt"), "USER: hi\nASSISTANT: ok");
    const snapshot = () => readdirSync(skillDir, { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => [join(entry.parentPath, entry.name), readFileSync(join(entry.parentPath, entry.name)).toString("base64")])
      .sort(([a], [b]) => a.localeCompare(b));
    const before = snapshot();
    let calls = 0;
    const adapter: HarnessAdapter = {
      ...fakeAdapter,
      available: async () => { calls++; return true; },
      run: async () => { calls++; throw new Error("Unexpected subject call"); },
      judge: async () => { calls++; throw new Error("Unexpected judge call"); },
    };
    const target = command === "judge" ? ` "${runDir}"` : "";
    await expect(handleSkillCheck(`${command}${target} ${flags}`, fakeCtx(skillDir), { adapter }))
      .rejects.toThrow(/Unsupported flag.*no evaluation started/);
    expect(calls).toBe(0);
    expect(snapshot()).toEqual(before);
  });

  it.each(["--only", "--only A1,", "--only A1,A1"])("rejects malformed selection before starting: %s", async flags => {
    await expect(handleSkillCheck(`run ${flags}`, fakeCtx("missing-skill"), { adapter: fakeAdapter }))
      .rejects.toThrow(/--only requires/);
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

  it("judge migrates a retained direct-Claude run to the current Pi default", async () => {
    const skillDir = skillFixture();
    const runDir = join(skillDir, "tests", "results", "pi-fake", "2026-07-05T00-00-00Z");
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, "A1.green.txt"), "USER: hi\nASSISTANT: ok", "utf8");
    writeResults(runDir, {
      skill: "demo", harness: "pi", model: "fireworks:accounts/fireworks/models/deepseek-v4-pro",
      judge: { provider: "claude-code", model: "opus" },
      timestamp: "2026-07-05T00:00:00Z", label: null, mode: "green",
      scenarios: [{ id: "A1", judge_verdict: "FAIL", judge_reason: "stale", suspect: false, override: null, note: "" }],
    }, { shipBar: { total: 1, min_pass: 1 }, critical: [] });
    const ctx = fakeCtx(skillDir);

    await handleSkillCheck(`judge ${runDir}`, ctx, { adapter: fakeAdapter });

    expect(readResults(runDir).judge).toEqual({ provider: "openai-codex", model: "gpt-5.6-sol" });
    expect(ctx.notified.some((n) => /recorded judge claude-code:opus was removed/.test(n.msg))).toBe(true);
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

    process.env.SKILL_HARNESS_JUDGE = "malformed";
    try {
      await handleSkillCheck(`judge ${runDir} --judge ollama:another-judge-model`, ctx, { adapter: fakeAdapter });
    } finally {
      delete process.env.SKILL_HARNESS_JUDGE;
    }

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

  it.each(["run demo --affected", "judge . --auto-rejudge", "judge . --secondary-judge claude-code:x", "judge . --tie-break-judge claude-code:x"])(
    "refuses a removed flag before invoking an adapter: %s",
    async (args) => {
      await expect(handleSkillCheck(args, fakeCtx(process.cwd()), { adapter: fakeAdapter })).rejects.toThrow(/was removed/);
    },
  );
});
