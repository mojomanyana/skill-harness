import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { skillCheckRunTool } from "../src/tool.js";
import { handleSkillCheck } from "../src/commands.js";
import { getProcessSignal, ProcessControlError, type HarnessAdapter } from "@skill-harness/core";

function skillFixture(): string {
  const d = mkdtempSync(join(tmpdir(), "sc-tool-"));
  mkdirSync(join(d, "sub", "tests"), { recursive: true });
  writeFileSync(join(d, "sub", "tests", "specification.yaml"),
    `skill: demo\njudge_persona: a judge.\nship_bar: { total: 1, min_pass: 1 }\nscenarios:\n  - id: A1\n    title: t\n    turns: ["hi"]\n    checklist: ["ok"]\n`, "utf8");
  return d;
}

const fakeAdapter = {
  name: "pi",
  available: async () => true,
  run: async () => "USER: hi\nASSISTANT: ok",
  judge: async () => '{"votes":[{"criterion":1,"vote":"PASS","reason":"ok"}],"verdict":"PASS","reason":"fine"}',
} as any;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function commandContext(cwd: string) {
  return { cwd, hasUI: true, ui: { notify: () => {}, setStatus: () => {} } };
}

describe("skillCheckRunTool", () => {
  it("executes and returns the scorecard content + details, streaming via onUpdate", async () => {
    const root = skillFixture();
    const updates: any[] = [];
    const result = await skillCheckRunTool.execute(
      "id1",
      { skill: join(root, "sub"), mode: "green" },
      new AbortController().signal,
      (u: any) => updates.push(u),
      { cwd: root, __adapter: fakeAdapter } as any
    );
    expect(result.details).toMatchObject({ skill: "demo" });
    expect(result.content[0].text).toMatch(/SHIP|NOT READY/);
    expect(updates.length).toBeGreaterThan(0);
  });

  it("exposes typebox parameters and prompt guidelines", () => {
    expect(skillCheckRunTool.name).toBe("skill_check_run");
    expect(skillCheckRunTool.promptGuidelines?.length).toBeGreaterThan(0);
    expect(skillCheckRunTool.parameters).toBeTruthy();
  });

  it("shares the evaluation slot between slash-command runs, tool runs and judge commands", async () => {
    const root = skillFixture(), skillDir = join(root, "sub");
    const started = deferred(), release = deferred();
    let subjectCalls = 0, judgeCalls = 0;
    const adapter: HarnessAdapter = { ...fakeAdapter,
      run: async () => { subjectCalls++; started.resolve(); await release.promise; return "USER: hi\nASSISTANT: ok"; },
      judge: async () => { judgeCalls++; return fakeAdapter.judge(); },
    };
    const active = handleSkillCheck("run --model local:subject --judge local:judge", commandContext(skillDir), { adapter });
    await started.promise;
    const prior = join(skillDir, "tests", "results", "pi-fake", "prior");
    mkdirSync(prior, { recursive: true });
    writeFileSync(join(prior, "A1.green.txt"), "USER: hi\nASSISTANT: ok");
    try {
      await expect(skillCheckRunTool.execute("overlap", { skill: skillDir }, new AbortController().signal, undefined,
        { cwd: root, __adapter: adapter })).rejects.toThrow(/already running/);
      await expect(handleSkillCheck(`judge "${prior}" --judge local:judge`, commandContext(skillDir), { adapter }))
        .rejects.toThrow(/already running/);
      expect(subjectCalls).toBe(1);
      expect(judgeCalls).toBe(0);
    } finally { release.resolve(); await active; }
    expect(judgeCalls).toBe(1);
  });

  it("an active judge command also blocks a new subject run until settlement", async () => {
    const root = skillFixture(), skillDir = join(root, "sub");
    const prior = join(skillDir, "tests", "results", "pi-fake", "prior");
    mkdirSync(prior, { recursive: true });
    writeFileSync(join(prior, "A1.green.txt"), "USER: hi\nASSISTANT: ok");
    const started = deferred(), release = deferred();
    let subjectCalls = 0, judgeCalls = 0;
    const adapter: HarnessAdapter = { ...fakeAdapter,
      run: async () => { subjectCalls++; return fakeAdapter.run(); },
      judge: async () => { judgeCalls++; started.resolve(); await release.promise; return fakeAdapter.judge(); },
    };
    const active = handleSkillCheck(`judge "${prior}" --judge local:judge`, commandContext(skillDir), { adapter });
    await started.promise;
    try {
      await expect(handleSkillCheck("run --model local:subject --judge local:judge", commandContext(skillDir), { adapter }))
        .rejects.toThrow(/already running/);
      expect(subjectCalls).toBe(0);
      expect(judgeCalls).toBe(1);
    } finally { release.resolve(); await active; }
  });

  it("propagates tool cancellation and releases the shared slot after the active run settles", async () => {
    const root = skillFixture(), skillDir = join(root, "sub");
    const started = deferred(), controller = new AbortController();
    let subjectCalls = 0, judgeCalls = 0;
    const adapter: HarnessAdapter = { ...fakeAdapter,
      run: async () => {
        subjectCalls++;
        const signal = getProcessSignal();
        if (!signal) throw new Error("Cancellation signal was not propagated");
        return new Promise<string>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new ProcessControlError("aborted", "test cancellation")), { once: true });
          started.resolve();
        });
      },
      judge: async () => { judgeCalls++; return fakeAdapter.judge(); },
    };
    const active = skillCheckRunTool.execute("cancel", { skill: skillDir, model: "local:subject", judge: "local:judge" },
      controller.signal, undefined, { cwd: root, __adapter: adapter });
    const rejected = expect(active).rejects.toThrow(/cancellation|aborted/);
    await started.promise;
    controller.abort();
    await rejected;
    expect(subjectCalls).toBe(1);
    expect(judgeCalls).toBe(0);
    await expect(handleSkillCheck("run --model local:subject --judge local:judge", commandContext(skillDir), { adapter: fakeAdapter }))
      .resolves.toBeUndefined();
  });

  it("reports focused coverage, repetitions, expected vs observed failures, keepTaskOpen, and session model fallback", async () => {
    const d = mkdtempSync(join(tmpdir(), "sc-tool-multi-"));
    mkdirSync(join(d, "sub", "tests"), { recursive: true });
    writeFileSync(
      join(d, "sub", "tests", "specification.yaml"),
      `skill: demo-multi\njudge_persona: a judge.\nship_bar: { total: 2, min_pass: 2 }\nscenarios:\n  - id: A1\n    title: first\n    turns: ["hi"]\n    checklist: ["must include exact citation"]\n  - id: A2\n    title: second\n    turns: ["bye"]\n    checklist: ["must say bye"]\n`,
      "utf8",
    );
    const failAdapter = {
      name: "pi",
      available: async () => true,
      run: async () => "USER: hi\nASSISTANT: vague reply without citation",
      judge: async () =>
        '{"votes":[{"criterion":1,"vote":"FAIL","reason":"missing exact citation"}],"verdict":"FAIL","reason":"missing exact citation"}',
    } as any;
    const result = await skillCheckRunTool.execute(
      "focused-fail",
      { skill: join(d, "sub"), scenarios: ["A1"], reps: 2, mode: "green" },
      new AbortController().signal,
      undefined,
      { cwd: d, model: { provider: "google", id: "gemini-flash-latest" }, __adapter: failAdapter } as any,
    );
    expect(result.isError).toBe(true);
    expect("evaluationGap" in result.details).toBe(false);
    if (!("evaluationGap" in result.details)) {
      expect(result.details.keepTaskOpen).toBe(true);
      expect(result.details.reps).toBe(2);
      expect(result.details.coverage.scope).toBe("focused");
      expect(result.details.coverage.label).toBe("focused coverage (1/2 scenarios)");
      expect(result.details.coverage.scenariosRun).toEqual(["A1"]);
      expect(result.details.scenarios[0]?.expected).toEqual(["must include exact citation"]);
      expect(result.details.scenarios[0]?.observed).toMatch(/missing exact citation/);
    }
    expect(result.content[0].text).toMatch(/focused coverage \(1\/2 scenarios\)/);
    expect(result.content[0].text).toMatch(/reps=2/);
    expect(result.content[0].text).toMatch(/expected: must include exact citation/);
    expect(result.content[0].text).toMatch(/observed:.*missing exact citation/);
    expect(result.content[0].text).toMatch(/Task remains open/);
  });

  it("flags an evaluation gap and offers to create one when no specification exists", async () => {
    const empty = mkdtempSync(join(tmpdir(), "sc-tool-gap-"));
    const result = await skillCheckRunTool.execute(
      "gap-1",
      { skill: empty },
      new AbortController().signal,
      undefined,
      { cwd: empty } as any,
    );
    expect("evaluationGap" in result.details && result.details.evaluationGap).toBe(true);
    expect(result.content[0].text).toMatch(/Evaluation gap/);
    expect(result.content[0].text).toMatch(/skill_author|\/skill-harness create/);
  });

  it("emits per-scenario eval-result events so passing scenario B does not clear failing scenario A", async () => {
    const skillDir = mkdtempSync(join(tmpdir(), "sc-tool-per-scenario-"));
    mkdirSync(join(skillDir, "tests"), { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "---\nname: demo-skill\ndescription: Demo.\n---\nBody.\n");
    writeFileSync(
      join(skillDir, "tests", "specification.yaml"),
      `skill: demo-skill\njudge_persona: a judge.\nship_bar: { total: 2, min_pass: 2 }\nscenarios:\n  - id: A1\n    title: trigger A\n    turns: ["Trigger A"]\n    checklist: ["must emit A token"]\n  - id: B1\n    title: trigger B\n    turns: ["Trigger B"]\n    checklist: ["must emit B token"]\n`,
      "utf8",
    );
    const emitted: Array<{ event: string; payload: any }> = [];
    let registered: any;
    const pi = {
      registerTool(def: any) { registered = def; },
      registerCommand() {},
      on() {},
      events: {
        on() { return () => {}; },
        emit(event: string, payload: unknown) { emitted.push({ event, payload }); },
      },
    };
    const { registerTool } = await import("../src/tool.js");
    registerTool(pi as any);

    let aPasses = false;
    const adapter = {
      name: "pi",
      available: async () => true,
      run: async ({ turns }: { turns: string[] }) => {
        const prompt = turns.join(" ");
        if (prompt.includes("Trigger A")) {
          return aPasses ? "USER: Trigger A\nASSISTANT: A ok" : "USER: Trigger A\nASSISTANT: A bad";
        }
        return "USER: Trigger B\nASSISTANT: B ok";
      },
      judge: async ({ prompt }: { prompt: string }) =>
        prompt.includes("A bad")
          ? '{"votes":[{"criterion":1,"vote":"FAIL","reason":"A token missing"}],"verdict":"FAIL","reason":"A token missing"}'
          : '{"votes":[{"criterion":1,"vote":"PASS","reason":"matched"}],"verdict":"PASS","reason":"matched"}',
    } as any;

    await registered.execute("r1", { skill: skillDir, scenarios: ["A1"], coverageScope: "focused", reps: 1 }, new AbortController().signal, undefined, {
      cwd: skillDir, model: { provider: "google", id: "gemini-flash-latest" }, __adapter: adapter,
    });
    await registered.execute("r2", { skill: skillDir, scenarios: ["B1"], coverageScope: "focused", reps: 1 }, new AbortController().signal, undefined, {
      cwd: skillDir, model: { provider: "google", id: "gemini-flash-latest" }, __adapter: adapter,
    });
    aPasses = true;
    await registered.execute("r3", { skill: skillDir, scenarios: ["A1"], coverageScope: "focused", reps: 1 }, new AbortController().signal, undefined, {
      cwd: skillDir, model: { provider: "google", id: "gemini-flash-latest" }, __adapter: adapter,
    });

    const evalEvents = emitted.filter((e) => e.event === "skill-harness:eval-result:v1").map((e) => e.payload);
    expect(evalEvents).toHaveLength(3);
    expect(evalEvents[0]).toMatchObject({ skill: "demo-skill", keepTaskOpen: true });
    expect(evalEvents[0].scenarios.map((s: any) => [s.id, s.verdict])).toEqual([["A1", "FAIL"]]);
    expect(evalEvents[1]).toMatchObject({ skill: "demo-skill", keepTaskOpen: false });
    expect(evalEvents[1].scenarios.map((s: any) => [s.id, s.verdict])).toEqual([["B1", "PASS"]]);
    expect(evalEvents[2]).toMatchObject({ skill: "demo-skill", keepTaskOpen: false });
    expect(evalEvents[2].scenarios.map((s: any) => [s.id, s.verdict])).toEqual([["A1", "PASS"]]);
  });
});
