import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, cpSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseSpec, runSkillModel, readResults, readJournal, lintSkill, regradeRun,
  hasEmptyAssistantTurn,
  type HarnessAdapter, type RunReq, type JudgeReq,
} from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, "fixtures", "golden-skill");

function freshSkill(): { skillDir: string; specPath: string } {
  const skillDir = mkdtempSync(join(tmpdir(), "sc-p1-"));
  cpSync(FIXTURE, skillDir, { recursive: true });
  return { skillDir, specPath: join(skillDir, "tests", "specification.yaml") };
}

function passJudge(): HarnessAdapter["judge"] {
  return async (_req: JudgeReq) => "1. PASS ok\nVERDICT: PASS\nREASON: fine";
}

function okRun(): HarnessAdapter["run"] {
  return async (req: RunReq) =>
    req.turns.map((t) => `>>> USER:\n${t}\n\n<<< ASSISTANT:\nHello!\n`).join("\n");
}

async function runWith(adapter: HarnessAdapter, opts: Partial<Parameters<typeof runSkillModel>[0]> = {}) {
  const { skillDir, specPath } = freshSkill();
  const spec = parseSpec(readFileSync(specPath, "utf8"), specPath);
  return {
    skillDir,
    specPath,
    spec,
    summary: await runSkillModel({
      spec, skillDir, specPath, adapter,
      model: { provider: "fireworks", model: "fake" }, modelToken: "fireworks:fake",
      judge: { provider: "claude-code", model: "opus" },
      mode: "green", timestamp: "2026-08-03T00-00-00-000Z", now: () => "2026-08-03T00:00:00.000Z",
      label: "p1", ...opts,
    }),
  };
}

// ─── --only ───────────────────────────────────────────────────────────────────

describe("--only scenario filter", () => {
  const adapter: HarnessAdapter = { name: "pi", available: async () => true, run: okRun(), judge: passJudge() };

  it("runs only the named scenarios and marks the run partial, never ship-graded", async () => {
    const { summary } = await runWith(adapter, { only: ["B1"] });
    expect(summary.results.scenarios.map((s) => s.id)).toEqual(["B1"]);
    expect(summary.results.partial).toBe(true);
    expect(summary.results.effective_grade.ship).toBe(false);
    expect(summary.results.effective_grade.note).toContain("partial");
    // persisted identically
    expect(readResults(summary.runDir)!.partial).toBe(true);
  });

  it("a typo'd id fails loudly BEFORE any scenario runs", async () => {
    let ran = 0;
    const counting: HarnessAdapter = {
      name: "pi", available: async () => true,
      run: async (req) => { ran++; return okRun()(req); }, judge: passJudge(),
    };
    await expect(runWith(counting, { only: ["A1", "ZZ"] })).rejects.toThrow(/unknown scenario id/);
    expect(ran).toBe(0);
  });

  it("a partial run does not false-flag lint's consistency recompute", async () => {
    const { skillDir } = await (async () => {
      const r = await runWith(adapter, { only: ["A1"] });
      return { skillDir: r.skillDir };
    })();
    const findings = lintSkill(skillDir).filter((f) => f.code === "consistency");
    expect(findings).toEqual([]);
  });
});

// ─── empty response → retry → ERROR ──────────────────────────────────────────

describe("hasEmptyAssistantTurn", () => {
  it("detects a blank assistant section", () => {
    expect(hasEmptyAssistantTurn(">>> USER:\nhi\n\n<<< ASSISTANT:\n\n")).toBe(true);
  });
  it("passes a normal transcript", () => {
    expect(hasEmptyAssistantTurn(">>> USER:\nhi\n\n<<< ASSISTANT:\nHello!\n")).toBe(false);
  });
  it("catches one empty turn among several", () => {
    const t = ">>> USER:\na\n\n<<< ASSISTANT:\nok\n\n>>> USER (turn 2/2):\nb\n\n<<< ASSISTANT:\n\n";
    expect(hasEmptyAssistantTurn(t)).toBe(true);
  });
  it("an assistant turn followed only by seeded gates is empty", () => {
    const t = ">>> USER:\nfix\n\n<<< ASSISTANT:\n\n\n=== SEEDED GATES ===\n  vitest run: FAIL";
    expect(hasEmptyAssistantTurn(t)).toBe(true);
  });
  it("no assistant sections at all is not 'empty' (nothing to judge either way)", () => {
    expect(hasEmptyAssistantTurn("[workspace setup failed] boom")).toBe(false);
  });
});

describe("empty-response retry", () => {
  it("retries once and succeeds — judge sees the good transcript", async () => {
    let calls = 0;
    const flaky: HarnessAdapter = {
      name: "pi", available: async () => true,
      run: async (req) => (++calls === 1 ? ">>> USER:\nx\n\n<<< ASSISTANT:\n\n" : okRun()(req)),
      judge: passJudge(),
    };
    const { summary } = await runWith(flaky, { only: ["A1"] });
    expect(summary.results.scenarios[0].judge_verdict).toBe("PASS");
    expect(calls).toBe(2);
    const events = readJournal(summary.runDir).map((e) => e.event);
    expect(events).toContain("empty-response-retry");
  });

  it("still empty after the retry → ERROR, and the judge is never invoked", async () => {
    let judged = 0;
    const dead: HarnessAdapter = {
      name: "pi", available: async () => true,
      run: async () => ">>> USER:\nx\n\n<<< ASSISTANT:\n\n",
      judge: async () => { judged++; return "VERDICT: FAIL\nREASON: nope"; },
    };
    const { summary } = await runWith(dead, { only: ["A1"] });
    const s = summary.results.scenarios[0];
    expect(s.judge_verdict).toBe("ERROR");
    expect(s.judge_reason).toMatch(/no response/);
    expect(judged).toBe(0);
  });
});

// ─── source hashes + staleness lint ──────────────────────────────────────────

describe("source_hashes + lint staleness", () => {
  const adapter: HarnessAdapter = { name: "pi", available: async () => true, run: okRun(), judge: passJudge() };

  it("a full run records the SKILL.md hash and lint is clean while the text is unchanged", async () => {
    const { skillDir, summary } = await runWith(adapter);
    expect(summary.results.source_hashes?.["SKILL.md"]).toMatch(/^[0-9a-f]{64}$/);
    expect(lintSkill(skillDir).filter((f) => f.code === "stale")).toEqual([]);
  });

  it("editing SKILL.md after the newest run makes lint report stale", async () => {
    const { skillDir } = await runWith(adapter);
    appendFileSync(join(skillDir, "SKILL.md"), "\nedited after the run\n");
    const stale = lintSkill(skillDir).filter((f) => f.code === "stale");
    expect(stale.length).toBe(1);
    expect(stale[0].message).toContain("SKILL.md");
    expect(stale[0].message).toContain("re-run");
  });

  it("a NEWER partial run does not count as coverage — staleness still reported", async () => {
    const { skillDir, specPath, spec } = await runWith(adapter);
    appendFileSync(join(skillDir, "SKILL.md"), "\nedited\n");
    // a later --only run against the edited text (its hashes match the new text)
    await runSkillModel({
      spec, skillDir, specPath, adapter,
      model: { provider: "fireworks", model: "fake" }, modelToken: "fireworks:fake",
      judge: { provider: "claude-code", model: "opus" },
      mode: "green", timestamp: "2026-08-03T01-00-00-000Z", now: () => "2026-08-03T01:00:00.000Z",
      label: "p1-partial", only: ["A1"],
    });
    // The newest run dir is the partial — it must not silence the stale full run.
    const stale = lintSkill(skillDir).filter((f) => f.code === "stale");
    expect(stale.length).toBe(1);
  });

  it("runs predating source_hashes stay silent (no retroactive noise)", async () => {
    const { skillDir, summary } = await runWith(adapter);
    // strip the whole block, as an old results.yaml would be
    const p = join(summary.runDir, "results.yaml");
    const kept = readFileSync(p, "utf8").split("\n").filter((l) => !/^source_hashes:|^ {2}\S+:\s*[0-9a-f]{64}$/.test(l));
    writeFileSync(p, kept.join("\n"));
    appendFileSync(join(skillDir, "SKILL.md"), "\nedited\n");
    expect(lintSkill(skillDir).filter((f) => f.code === "stale")).toEqual([]);
  });
});

// ─── source_hashes covers the spec and its fixtures ──────────────────────────

describe("source_hashes covers scenario definitions and fixture trees", () => {
  const adapter: HarnessAdapter = { name: "pi", available: async () => true, run: okRun(), judge: passJudge() };

  /** Rewrite the golden spec, replacing `from` with `to`. */
  function editSpec(skillDir: string, from: string, to: string): void {
    const p = join(skillDir, "tests", "specification.yaml");
    const text = readFileSync(p, "utf8");
    if (!text.includes(from)) throw new Error(`test setup: ${JSON.stringify(from)} not in spec`);
    writeFileSync(p, text.replace(from, to), "utf8");
  }

  it("records a digest per scenario", async () => {
    const { summary } = await runWith(adapter);
    const h = summary.results.source_hashes!;
    expect(h["scenario:A1"]).toMatch(/^[0-9a-f]{64}$/);
    expect(h["scenario:B1"]).toMatch(/^[0-9a-f]{64}$/);
    expect(h["scenario:A1"]).not.toBe(h["scenario:B1"]);
  });

  it("editing a checklist marks THAT scenario stale — the case lint used to miss", async () => {
    const { skillDir } = await runWith(adapter);
    editSpec(skillDir, "greets the user", "greets the user warmly, by name");
    const stale = lintSkill(skillDir).filter((f) => f.code === "stale");
    expect(stale).toHaveLength(1);
    expect(stale[0].scenario).toBe("A1"); // per-scenario, not skill-wide
    expect(stale[0].message).toMatch(/scenario `A1`/);
    expect(stale[0].message).toMatch(/re-run/);
  });

  it("editing one scenario leaves the others alone", async () => {
    const { skillDir } = await runWith(adapter);
    editSpec(skillDir, "greets in both turns", "greets in both turns, politely");
    const stale = lintSkill(skillDir).filter((f) => f.code === "stale");
    expect(stale.map((f) => f.scenario)).toEqual(["B1"]);
  });

  it("adding a NEW scenario marks nothing stale — a reshape is not staleness", async () => {
    // Hashing specification.yaml as one file would flag every historical run here.
    // Nothing already measured changed, so nothing is stale.
    const { skillDir } = await runWith(adapter);
    const p = join(skillDir, "tests", "specification.yaml");
    appendFileSync(p, `  - id: C1\n    title: new\n    turns:\n      - "hi"\n    checklist:\n      - "responds"\n`);
    expect(lintSkill(skillDir).filter((f) => f.code === "stale")).toEqual([]);
  });

  it("removing a measured scenario is a reshape too — silent, not stale", async () => {
    const { skillDir } = await runWith(adapter);
    editSpec(skillDir, `  - id: B1\n    title: holds over two turns\n    turns:\n      - "Say hello."\n      - "Say it again."\n    checklist:\n      - greets in both turns\n`, "");
    expect(lintSkill(skillDir).filter((f) => f.code === "stale")).toEqual([]);
  });

  it("reformatting the spec without changing meaning marks nothing stale", async () => {
    // The digest is built from the PARSED scenario, so YAML formatting is not
    // measured — otherwise reindenting a file would demand a re-run.
    const { skillDir } = await runWith(adapter);
    editSpec(skillDir, "    checklist:\n      - greets the user", "    checklist:\n      - 'greets the user'");
    expect(lintSkill(skillDir).filter((f) => f.code === "stale")).toEqual([]);
  });

  it("swapping a fixture file marks its scenario stale", async () => {
    // The demonstrated miss: a fixture file was replaced in the skills repo and
    // `lint all` still reported 0 findings, because fixtures were never hashed.
    const seeded = `skill: golden-skill\njudge_persona: a judge.\nship_bar: { total: 1, min_pass: 1 }\nscenarios:\n  - id: A1\n    title: seeded\n    mode: seeded\n    fixture: fixtures/A1\n    turns: ["edit it"]\n    checklist: ["edited"]\n`;
    const { skillDir, specPath } = freshSkill();
    writeFileSync(specPath, seeded, "utf8");
    mkdirSync(join(skillDir, "tests", "fixtures", "A1"), { recursive: true });
    const fx = join(skillDir, "tests", "fixtures", "A1", "ranges.ts");
    writeFileSync(fx, "export const a = 1;\n", "utf8");

    const spec = parseSpec(readFileSync(specPath, "utf8"), specPath);
    const summary = await runSkillModel({
      spec, skillDir, specPath, adapter,
      model: { provider: "fireworks", model: "fake" }, modelToken: "fireworks:fake",
      judge: { provider: "claude-code", model: "opus" },
      mode: "green", timestamp: "2026-08-03T00-00-00-000Z", now: () => "2026-08-03T00:00:00.000Z",
      label: "fx",
    });
    expect(summary.results.source_hashes!["fixture:fixtures/A1"]).toMatch(/^[0-9a-f]{64}$/);
    expect(lintSkill(skillDir).filter((f) => f.code === "stale")).toEqual([]);

    writeFileSync(fx, "export const a = 2;\n", "utf8"); // what the scenario measures changed
    const stale = lintSkill(skillDir).filter((f) => f.code === "stale");
    expect(stale).toHaveLength(1);
    expect(stale[0].scenario).toBe("A1");
    expect(stale[0].message).toMatch(/fixture `fixtures\/A1`/);
  });

  it("adding a file to a fixture dir marks it stale", async () => {
    const seeded = `skill: golden-skill\njudge_persona: a judge.\nship_bar: { total: 1, min_pass: 1 }\nscenarios:\n  - id: A9\n    title: seeded\n    mode: seeded\n    fixture: fixtures/A9\n    turns: ["edit it"]\n    checklist: ["edited"]\n`;
    const { skillDir, specPath } = freshSkill();
    writeFileSync(specPath, seeded, "utf8");
    mkdirSync(join(skillDir, "tests", "fixtures", "A9"), { recursive: true });
    writeFileSync(join(skillDir, "tests", "fixtures", "A9", "a.ts"), "1\n", "utf8");

    const spec = parseSpec(readFileSync(specPath, "utf8"), specPath);
    await runSkillModel({
      spec, skillDir, specPath, adapter,
      model: { provider: "fireworks", model: "fake" }, modelToken: "fireworks:fake",
      judge: { provider: "claude-code", model: "opus" },
      mode: "green", timestamp: "2026-08-03T00-00-00-000Z", now: () => "2026-08-03T00:00:00.000Z",
      label: "fx",
    });
    expect(lintSkill(skillDir).filter((f) => f.code === "stale")).toEqual([]);

    // A whole new sub-tree, the second half of the demonstrated miss.
    mkdirSync(join(skillDir, "tests", "fixtures", "A9", "nested"), { recursive: true });
    writeFileSync(join(skillDir, "tests", "fixtures", "A9", "nested", "b.ts"), "2\n", "utf8");
    const stale = lintSkill(skillDir).filter((f) => f.code === "stale");
    expect(stale).toHaveLength(1);
    expect(stale[0].message).toMatch(/fixture `fixtures\/A9`/);
  });
});

// ─── grade --suspect-only ────────────────────────────────────────────────────

describe("regradeRun onlySuspect", () => {
  it("re-judges only untrustworthy verdicts and carries clean ones verbatim", async () => {
    // First produce a run where A1 is a misfire (suspect) and A2 is clean.
    let judgeCalls = 0;
    const mixedJudge: HarnessAdapter = {
      name: "pi", available: async () => true, run: okRun(),
      judge: async (req) => {
        judgeCalls++;
        // A1's checklist mentions "greets a person by name" in the golden fixture; key off the transcript turn
        return req.prompt.includes("greets the user") // A1's checklist line, absent from B1's
          ? "1. PASS ok\nVERDICT: FAIL\nREASON: fine" // verdict disagrees with items -> suspect
          : "1. PASS ok\nVERDICT: PASS\nREASON: fine";
      },
    };
    const { skillDir, specPath, spec, summary } = await runWith(mixedJudge);
    const before = readResults(summary.runDir)!;
    const suspectIds = before.scenarios.filter((s) => s.suspect).map((s) => s.id);
    expect(suspectIds).toEqual(["A1"]);
    const cleanReason = before.scenarios.find((s) => s.id === "B1")!.judge_reason;

    judgeCalls = 0;
    const fixedJudge: HarnessAdapter = {
      name: "pi", available: async () => true, run: okRun(),
      judge: async () => { judgeCalls++; return "1. PASS ok\nVERDICT: PASS\nREASON: rejudged clean"; },
    };
    const after = await regradeRun({
      runDir: summary.runDir, spec, adapter: fixedJudge,
      judge: { provider: "claude-code", model: "opus" },
      specDir: dirname(specPath), now: () => "2026-08-03T02:00:00.000Z",
      onlySuspect: true,
    });
    expect(judgeCalls).toBe(1); // only A1
    expect(after.scenarios.find((s) => s.id === "A1")!.judge_verdict).toBe("PASS");
    expect(after.scenarios.find((s) => s.id === "A1")!.suspect).toBe(false);
    expect(after.scenarios.find((s) => s.id === "B1")!.judge_reason).toBe(cleanReason);
    expect(skillDir).toBeTruthy();
  });

  it("with nothing suspect it is a no-op that spends zero judge calls", async () => {
    const adapter: HarnessAdapter = { name: "pi", available: async () => true, run: okRun(), judge: passJudge() };
    const { specPath, spec, summary } = await runWith(adapter);
    let judgeCalls = 0;
    const counting: HarnessAdapter = {
      name: "pi", available: async () => true, run: okRun(),
      judge: async () => { judgeCalls++; return "VERDICT: PASS\nREASON: x"; },
    };
    const after = await regradeRun({
      runDir: summary.runDir, spec, adapter: counting,
      judge: { provider: "claude-code", model: "opus" },
      specDir: dirname(specPath), onlySuspect: true,
    });
    expect(judgeCalls).toBe(0);
    expect(after.scenarios.map((s) => s.judge_verdict)).toEqual(["PASS", "PASS"]);
  });
});
