# skill-check v2 — Milestone 5b: trends + M5 cleanup

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Trends section to the review console — per model, a grade-% sparkline + a per-scenario verdict-history grid across a skill's run history — reading committed historical `results.yaml`; and land the three M5a-deferred cleanups first.

**Architecture:** New pure core `collectTrends` (historical aggregation, sibling of `collectReport`), a lazy `GET /trends` endpoint, and a collapsible Trends section in the template (hand-drawn inline SVG, no deps). Cleanup extracts `effectiveThreshold` + `judgeOneRep` and widens `preserveTranscript` to cover judge-raw. Single-skill, on-demand; matrix/`/save`/`/rejudge`/`/judge` unchanged.

**Tech Stack:** TypeScript ESM (relative imports end in `.js`), node sync `fs`/`http`, `js-yaml`, vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-05-skill-check-m5b-trends-design.md`. Master: `docs/superpowers/specs/2026-07-03-skill-check-framework-design.md` (Monitoring/UI, trends).

**Repo / branch:** `~/prepos/skill-check`, branch `framework-v2-m5b` (design committed as `aa1db3c`). `main` has M1–M5a. Baseline: 176 tests.

## Global Constraints

- `npm run build && npx vitest run` green at every commit (repo root). No new npm dependencies.
- ESM: every relative import ends in `.js`. Sync `node:fs`.
- TDD: failing test first, watched fail, then implement.
- Cleanup is behavior-preserving: `effectiveThreshold` returns the same values the inline expressions did; `judgeOneRep` produces the same judge-raw + journal events + outcome (including that a **gate-failed** seeded scenario still emits its `judge-verdict` journal event); preserving judge-raw only *adds* gitignore negation lines.
- Trends is read-only; `collectReport`, the matrix, and the M5a endpoints are untouched. N=1 results.yaml unaffected (no schema change).
- The console is self-contained: no bundler, no CDN, no chart library — inline SVG + vanilla JS only.
- One commit per task, message style `refactor(core)/feat(core)/feat(cli)/feat(ui)`.

## File Structure

| File | Responsibility after M5b |
|---|---|
| `packages/core/src/results.ts` | `effectiveThreshold(prev, scenario)`; `preserveTranscript` also preserves judge-raw artifacts |
| `packages/core/src/regrade.ts` | `judgeOneRep(...)` (extracted judge-a-transcript step); `regradeScenario` uses it |
| `packages/core/src/run.ts` | `runRep`'s judge branch uses `judgeOneRep` (gate branch keeps its own journal emit) |
| `packages/core/src/trends.ts` (new) | `collectTrends(skillDir, limit)` + `TrendData`/`TrendModel`/`TrendRun`/`TrendCell` |
| `packages/core/src/index.ts` | export `./trends.js` |
| `packages/cli/src/cli.ts` | `cmdGrade` uses `effectiveThreshold` |
| `packages/cli/src/serve.ts` | `GET /trends`; `/rejudge` uses `effectiveThreshold` |
| `assets/report.template.html` | collapsible Trends section (sparkline + grid), lazy `/trends` fetch |

---

### Task 1: Cleanup — `effectiveThreshold` + preserve judge-raw on override

**Files:**
- Modify: `packages/core/src/results.ts`, `packages/cli/src/cli.ts`, `packages/cli/src/serve.ts`
- Test: `packages/core/test/results.test.ts` (extend)

**Interfaces:**
- Consumes: `ScenarioResult`, `Scenario`, `findJudgeRawFiles` (all existing).
- Produces: `export function effectiveThreshold(prevScenario: ScenarioResult | undefined, scenario: Scenario): number` — returns `prevScenario?.pass_threshold ?? scenario.passThreshold ?? 0.5`. `preserveTranscript` additionally un-gitignores the scenario's judge-raw files. Task 3/4 unaffected.

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/results.test.ts` add:

```ts
import { effectiveThreshold } from "../src/results.js";

describe("effectiveThreshold", () => {
  const scn = (pt?: number) => ({ id: "A1", title: "t", critical: false, mode: "inline", turns: [], checklist: [], workspace: "none", passThreshold: pt } as any);
  const prev = (pt?: number) => (pt === undefined ? undefined : ({ id: "A1", judge_verdict: "PASS", judge_reason: "", suspect: false, override: null, note: "", pass_threshold: pt } as any));
  test("prev.pass_threshold wins", () => expect(effectiveThreshold(prev(0.8), scn(0.6))).toBe(0.8));
  test("falls back to scenario.passThreshold", () => expect(effectiveThreshold(prev(undefined), scn(0.7))).toBe(0.7));
  test("falls back to 0.5", () => expect(effectiveThreshold(undefined, scn(undefined))).toBe(0.5));
});
```

For preserve-judge-raw, extend the existing `preserveTranscript` test (find the describe that writes transcript files + asserts gitignore negation lines). Add judge-raw files and assert they're preserved too:

```ts
test("preserveTranscript also un-gitignores the scenario's judge-raw artifacts", () => {
  const root = tmp();
  const runDir = join(root, "pi-fake", "2026-07-05T00-00-00Z");
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, "A1.green.txt"), "t", "utf8");
  writeFileSync(join(runDir, "A1.green.judge.txt"), "j", "utf8");
  preserveTranscript(root, runDir, "A1");
  const gi = readFileSync(join(root, ".gitignore"), "utf8");
  expect(gi).toContain("!pi-fake/2026-07-05T00-00-00Z/A1.green.txt");
  expect(gi).toContain("!pi-fake/2026-07-05T00-00-00Z/A1.green.judge.txt");
});
```

(Match the tmp-dir / import helpers the file already uses; `mkdirSync`/`writeFileSync`/`readFileSync` are likely already imported.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/core/test/results.test.ts`
Expected: FAIL — `effectiveThreshold` not exported; `preserveTranscript` doesn't include the `.judge.txt` line.

- [ ] **Step 3: Implement in `results.ts`**

Add `effectiveThreshold` (add `type Scenario` to the `./spec.js` import if not present):

```ts
/** The pass-threshold a re-grade uses: the run's persisted value, else the spec's per-scenario value, else 0.5. */
export function effectiveThreshold(prevScenario: ScenarioResult | undefined, scenario: Scenario): number {
  return prevScenario?.pass_threshold ?? scenario.passThreshold ?? 0.5;
}
```

Widen `preserveTranscript` to also collect judge-raw files. Change its `const files = findTranscriptFiles(runDir, scenarioId);` to include judge-raw:

```ts
  const files = [...findTranscriptFiles(runDir, scenarioId), ...findJudgeRawFiles(runDir, scenarioId)];
```

(The rest of `preserveTranscript` — the per-file negation-line loop with dedup — is unchanged; `findJudgeRawFiles` is already defined above it in the same file.)

- [ ] **Step 4: Use `effectiveThreshold` at the two re-grade sites**

`packages/cli/src/cli.ts` `cmdGrade` — replace `const threshold = prevScenario?.pass_threshold ?? scenario.passThreshold ?? 0.5;` with:

```ts
    const threshold = effectiveThreshold(prevScenario, scenario);
```

`packages/cli/src/serve.ts` `/rejudge` — replace `const threshold = prev?.pass_threshold ?? scenario.passThreshold ?? 0.5;` with:

```ts
        const threshold = effectiveThreshold(prev, scenario);
```

Add `effectiveThreshold` to the `@skill-check/core` import in both files.

- [ ] **Step 5: Run tests + build + full suite + commit**

Run: `npx vitest run packages/core/test/results.test.ts` → PASS.
Run: `npm run build && npx vitest run` → green (cmdGrade/`/rejudge` produce the same threshold as before — behavior-preserving; the existing grade-cmd + serve tests still pass).

```bash
git add packages/core/src/results.ts packages/cli/src/cli.ts packages/cli/src/serve.ts packages/core/test/results.test.ts
git commit -m "refactor(core): shared effectiveThreshold; preserveTranscript also preserves judge-raw"
```

---

### Task 2: Extract `judgeOneRep` (shared by `regradeScenario` and `runRep`)

**Files:**
- Modify: `packages/core/src/regrade.ts`, `packages/core/src/run.ts`
- Test: `packages/core/test/regrade.test.ts` (extend), `packages/core/test/golden-run.test.ts` (must stay green)

**Interfaces:**
- Consumes: `buildJudgePrompt`/`judgeInWorkspace` (`grade.ts`), `judgeRawPath` (`results.ts`), `appendJournal`, `RepOutcome`.
- Produces:
  ```ts
  export async function judgeOneRep(opts: {
    runDir: string; spec: Spec; scenario: Scenario; transcript: string;
    adapter: HarnessAdapter; judge: ModelRef; specDir: string;
    mode: string; rep: number | undefined; now: () => string;
  }): Promise<RepOutcome>;
  ```
  It builds the prompt, judges the transcript, writes the judge-raw artifact (`judgeRawPath(runDir, id, mode, rep)`), emits a per-rep `judge-verdict` (+ `misfire-flag` when suspect) journal event, and returns `{ verdict, reason, suspect }`. `regradeScenario` and `runRep`'s judge branch both call it.

- [ ] **Step 1: Write a direct test for `judgeOneRep`**

In `packages/core/test/regrade.test.ts` add (reuse the file's `tmp()`, `scenarioOf`, `judgeAdapter` helpers):

```ts
import { judgeOneRep } from "../src/regrade.js";
import { readJournal } from "../src/index.js";

it("judgeOneRep judges a transcript, writes judge-raw, journals, returns the outcome", async () => {
  const runDir = tmp();
  const spec = scenarioOf(SPEC);
  const o = await judgeOneRep({
    runDir, spec, scenario: spec.scenarios[0], transcript: "USER: hi\nASSISTANT: hello",
    adapter: judgeAdapter("1. PASS — ok\nVERDICT: PASS\nREASON: fine"),
    judge: { provider: "claude-code", model: "opus" }, specDir: runDir, mode: "green", rep: undefined, now: () => "t",
  });
  expect(o).toEqual({ verdict: "PASS", reason: "fine", suspect: false });
  expect(readFileSync(join(runDir, "A1.green.judge.txt"), "utf8")).toMatch(/VERDICT: PASS/);
  const jv = readJournal(runDir).filter((e) => e.event === "judge-verdict");
  expect(jv).toHaveLength(1);
  expect(jv[0]).toMatchObject({ id: "A1", verdict: "PASS" });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/core/test/regrade.test.ts` → FAIL (`judgeOneRep` not exported).

- [ ] **Step 3: Implement `judgeOneRep` in `regrade.ts` and use it in `regradeScenario`**

Add the export (it's the loop body of the current `regradeScenario`, lifted out):

```ts
/** Judge one saved transcript: write the judge-raw artifact, emit the per-rep journal events, return the outcome. */
export async function judgeOneRep(opts: {
  runDir: string; spec: Spec; scenario: Scenario; transcript: string;
  adapter: HarnessAdapter; judge: ModelRef; specDir: string;
  mode: string; rep: number | undefined; now: () => string;
}): Promise<RepOutcome> {
  const { runDir, spec, scenario, transcript, adapter, judge, specDir, mode, rep, now } = opts;
  const prompt = buildJudgePrompt({ skill: spec.skill, persona: spec.judge_persona, scenario, transcript });
  const g = await judgeInWorkspace(adapter, judge, prompt, specDir);
  writeFileSync(judgeRawPath(runDir, scenario.id, mode, rep), g.raw, "utf8");
  const repField = rep === undefined ? {} : { rep };
  appendJournal(runDir, { event: "judge-verdict", ts: now(), id: scenario.id, verdict: g.verdict, reason: g.reason, suspect: g.suspect, ...repField });
  if (g.suspect) appendJournal(runDir, { event: "misfire-flag", ts: now(), id: scenario.id, reason: g.reason, ...repField });
  return { verdict: g.verdict, reason: g.reason, suspect: g.suspect };
}
```

Rewrite `regradeScenario`'s loop to call it (replacing the inline prompt/judge/write/journal):

```ts
  const now = opts.now ?? (() => new Date().toISOString());
  const files = findTranscriptFiles(opts.runDir, opts.scenario.id, "green");
  if (files.length === 0) throw new Error(`no green transcripts for ${opts.scenario.id} in ${opts.runDir}`);
  const repCount = files.length;
  const outcomes: RepOutcome[] = [];
  for (const file of files) {
    const rep = repIndexOf(file) ?? undefined;
    const transcript = readFileSync(join(opts.runDir, file), "utf8");
    outcomes.push(await judgeOneRep({
      runDir: opts.runDir, spec: opts.spec, scenario: opts.scenario, transcript,
      adapter: opts.adapter, judge: opts.judge, specDir: opts.specDir, mode: "green", rep, now,
    }));
  }
  return outcomesToResult(opts.scenario.id, outcomes, repCount, opts.threshold);
```

(`regrade.ts` no longer references `buildJudgePrompt`/`judgeInWorkspace`/`judgeRawPath`/`appendJournal` directly outside `judgeOneRep` — keep the imports since `judgeOneRep` uses them. `repIndexOf` still used.)

- [ ] **Step 4: Use `judgeOneRep` in `run.ts`'s `runRep` — preserving the gate-failed journal event**

Read `runRep` in `packages/core/src/run.ts`. It currently is roughly:
- gate branch: `verdict="FAIL"; reason=gatePrefix;`
- judge branch: builds prompt, `judgeInWorkspace`, writes judge-raw, sets verdict/reason/suspect
- then, AFTER the if/else, unconditionally: `appendJournal(judge-verdict …)` and `if (suspect) appendJournal(misfire-flag …)`.

**Critical behavior to preserve:** the `judge-verdict` event is emitted for the gate-failed case too. So restructure into per-branch emission:

```ts
    let verdict: ScenarioResult["judge_verdict"];
    let reason: string;
    let suspect = false;
    if (gatePrefix) {
      verdict = "FAIL";
      reason = gatePrefix;
      // gate failures don't invoke the judge, but still record a judge-verdict event (as before)
      appendJournal(runDir, { event: "judge-verdict", ts: now(), id: scenario.id, verdict, reason, suspect, ...repField });
    } else {
      const o = await judgeOneRep({
        runDir, spec, scenario, transcript, adapter: ctx.adapter, judge,
        specDir: dirname(ctx.specPath), mode, rep: repCount > 1 ? rep : undefined, now,
      });
      verdict = o.verdict; reason = o.reason; suspect = o.suspect; // judgeOneRep already journaled (verdict + misfire)
    }
    log(`  → ${scenario.id}${repCount > 1 ? `#${rep}` : ""} ${verdict}${reason ? `: ${reason}` : ""}${suspect ? "  ⚠ suspect" : ""}`);
    return { verdict, reason, suspect };
```

Remove runRep's OLD post-if `appendJournal(judge-verdict …)` + `if (suspect) appendJournal(misfire-flag …)` and its inline prompt/`judgeInWorkspace`/judge-raw write (now inside `judgeOneRep`). Import `judgeOneRep` from `./regrade.js` (run.ts → regrade.ts is acyclic: regrade.ts does not import run.ts). Drop now-unused imports from run.ts (`buildJudgePrompt`, `judgeInWorkspace`, `judgeRawPath` — verify each is truly unused before removing; `writeFileSync` is still used to write the transcript, keep it).

- [ ] **Step 5: Run tests + build + full suite**

Run: `npx vitest run packages/core/test/regrade.test.ts packages/core/test/golden-run.test.ts`
Expected: PASS — the golden run's journal event sequence (including a seeded gate-failed scenario's `judge-verdict`, if the fixture has one) is unchanged; regrade tests unchanged.

Run: `npm run build && npx vitest run` (twice — journal/workspace parallelism) → green, no flake.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/regrade.ts packages/core/src/run.ts packages/core/test/regrade.test.ts
git commit -m "refactor(core): extract judgeOneRep shared by runRep and regradeScenario"
```

---

### Task 3: `collectTrends` (historical aggregation)

**Files:**
- Create: `packages/core/src/trends.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/trends.test.ts` (new)

**Interfaces:**
- Consumes: `loadSpec`, `readResults`, `type ResultsFile`, `type Verdict`.
- Produces:
  ```ts
  export interface TrendCell { verdict: Verdict; suspect: boolean; flakiness?: number; }
  export interface TrendRun { timestamp: string; label: string | null; grade: ResultsFile["effective_grade"]; cells: Record<string, TrendCell>; }
  export interface TrendModel { model: string; tag: string; runs: TrendRun[]; truncated: boolean; }
  export interface TrendData { skill: string; scenarios: { id: string; title: string; critical: boolean }[]; models: TrendModel[]; }
  export function collectTrends(skillDir: string, limit?: number): TrendData; // default limit 20
  ```
  Task 4 (`/trends`) and Task 5 (UI) rely on this shape. No absolute paths in the output.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/trends.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import yaml from "js-yaml";
import { collectTrends, writeResults } from "../src/index.js";

const tmps: string[] = [];
function skill() {
  const d = mkdtempSync(join(tmpdir(), "sc-trends-"));
  tmps.push(d);
  mkdirSync(join(d, "tests"), { recursive: true });
  writeFileSync(join(d, "tests", "specification.yaml"),
    `skill: demo\njudge_persona: a judge.\nship_bar: { total: 1, min_pass: 1 }\ncritical: [A1]\nscenarios:\n  - id: A1\n    title: t\n    turns: ["hi"]\n    checklist: ["ok"]\n`, "utf8");
  return d;
}
function run(skillDir: string, ts: string, verdict: "PASS" | "FAIL", override: "PASS" | "FAIL" | null = null) {
  const runDir = join(skillDir, "tests", "results", "pi-fake", ts.replace(/[:.]/g, "-"));
  mkdirSync(runDir, { recursive: true });
  writeResults(runDir, {
    skill: "demo", harness: "pi", model: "fireworks:fake",
    judge: { provider: "claude-code", model: "opus" }, timestamp: ts, label: `run-${ts}`, mode: "green",
    scenarios: [{ id: "A1", judge_verdict: verdict, judge_reason: "", suspect: false, override, note: "" }],
  }, { shipBar: { total: 1, min_pass: 1, no_critical_fail: true }, critical: ["A1"] });
}
afterEach(() => { while (tmps.length) rmSync(tmps.pop()!, { recursive: true, force: true }); });

describe("collectTrends", () => {
  it("returns runs per model chronologically (newest last), override-aware cells", () => {
    const d = skill();
    run(d, "2026-07-01T00:00:00Z", "FAIL", "PASS"); // override flips to PASS
    run(d, "2026-07-02T00:00:00Z", "PASS");
    const t = collectTrends(d);
    expect(t.models).toHaveLength(1);
    const m = t.models[0];
    expect(m.runs.map((r) => r.timestamp)).toEqual(["2026-07-01T00:00:00Z", "2026-07-02T00:00:00Z"]);
    expect(m.runs[0].cells.A1.verdict).toBe("PASS"); // override-aware
    expect(m.truncated).toBe(false);
  });

  it("keeps only the most recent `limit` runs and flags truncated", () => {
    const d = skill();
    for (let i = 1; i <= 5; i++) run(d, `2026-07-0${i}T00:00:00Z`, "PASS");
    const t = collectTrends(d, 3);
    expect(t.models[0].runs).toHaveLength(3);
    expect(t.models[0].runs[0].timestamp).toBe("2026-07-03T00:00:00Z"); // oldest kept
    expect(t.models[0].truncated).toBe(true);
  });

  it("empty results root → no models", () => {
    expect(collectTrends(skill()).models).toEqual([]);
  });

  it("migrates a schema-1 run", () => {
    const d = skill();
    const runDir = join(d, "tests", "results", "pi-fake", "2026-07-01T00-00-00Z");
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, "results.yaml"), yaml.dump({
      skill: "demo", harness: "pi", model: "m", judge: { provider: "p", model: "j" },
      timestamp: "2026-07-01T00:00:00Z",
      grade: { passed: 1, total: 1, pct: 100, letter: "A", ship: true, note: "" },
      scenarios: [{ id: "A1", judge_verdict: "PASS", judge_reason: "", override: null, note: "" }],
    }), "utf8");
    const t = collectTrends(d);
    expect(t.models[0].runs[0].cells.A1.verdict).toBe("PASS");
    expect(t.models[0].runs[0].label).toBeNull(); // schema-1 → label null after migration
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/core/test/trends.test.ts` → FAIL (`collectTrends` not exported).

- [ ] **Step 3: Implement `trends.ts`**

```ts
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadSpec } from "./spec.js";
import { readResults, type ResultsFile } from "./results.js";
import type { Verdict } from "./score.js";

export interface TrendCell { verdict: Verdict; suspect: boolean; flakiness?: number; }
export interface TrendRun {
  timestamp: string;
  label: string | null;
  grade: ResultsFile["effective_grade"];
  cells: Record<string, TrendCell>;
}
export interface TrendModel { model: string; tag: string; runs: TrendRun[]; truncated: boolean; }
export interface TrendData {
  skill: string;
  scenarios: { id: string; title: string; critical: boolean }[];
  models: TrendModel[];
}

/**
 * Per model-tag, read the full run history (not just the latest) from
 * <skillDir>/tests/results/, chronologically (timestamp-slug dir names sort
 * correctly), keeping the most recent `limit` runs. Each run's cell carries the
 * override-aware verdict + suspect + reps flakiness. Read-only; no absolute
 * paths in the result.
 */
export function collectTrends(skillDir: string, limit = 20): TrendData {
  const specPath = join(skillDir, "tests", "specification.yaml");
  const spec = loadSpec(specPath);
  const scenarios = spec.scenarios.map((s) => ({ id: s.id, title: s.title, critical: s.critical }));

  const resultsRoot = join(skillDir, "tests", "results");
  const models: TrendModel[] = [];
  if (existsSync(resultsRoot)) {
    const tags = readdirSync(resultsRoot)
      .map((n) => join(resultsRoot, n))
      .filter((p) => statSync(p).isDirectory())
      .sort();
    for (const tagDir of tags) {
      const runDirs = readdirSync(tagDir)
        .map((n) => join(tagDir, n))
        .filter((p) => statSync(p).isDirectory() && existsSync(join(p, "results.yaml")))
        .sort(); // timestamp-slug dir names ⇒ chronological ascending
      if (runDirs.length === 0) continue;
      const truncated = runDirs.length > limit;
      const kept = runDirs.slice(-limit); // most recent `limit`, newest last
      const runs: TrendRun[] = kept.map((rd) => {
        const r = readResults(rd);
        const cells: Record<string, TrendCell> = {};
        for (const s of r.scenarios) {
          cells[s.id] = { verdict: s.override ?? s.judge_verdict, suspect: s.suspect ?? false, flakiness: s.flakiness };
        }
        return { timestamp: r.timestamp, label: r.label, grade: r.effective_grade, cells };
      });
      models.push({ model: runs[runs.length - 1] ? readResults(kept[kept.length - 1]).model : "", tag: tagDir.split("/").pop()!, runs, truncated });
    }
  }
  return { skill: spec.skill, scenarios, models };
}
```

Simplify the `model` line — `kept` is non-empty here, so use the last run's model token directly:

```ts
      const model = readResults(kept[kept.length - 1]).model;
      models.push({ model, tag: tagDir.split("/").pop()!, runs, truncated });
```

(Prefer this two-line form over the ternary.) Add `export * from "./trends.js";` to `packages/core/src/index.ts` (after `./report.js`).

- [ ] **Step 4: Run tests + build + full suite + commit**

Run: `npx vitest run packages/core/test/trends.test.ts` → PASS (4).
Run: `npm run build && npx vitest run` → green.

```bash
git add packages/core/src/trends.ts packages/core/src/index.ts packages/core/test/trends.test.ts
git commit -m "feat(core): collectTrends — per-model run history (grade + per-scenario cells)"
```

---

### Task 4: `GET /trends` endpoint

**Files:**
- Modify: `packages/cli/src/serve.ts`
- Test: `packages/cli/test/serve.test.ts` (extend)

**Interfaces:**
- Consumes: `collectTrends` (Task 3).
- Produces: `GET /trends` → `collectTrends(skillDir)` JSON.

- [ ] **Step 1: Write the failing test**

In `packages/cli/test/serve.test.ts`, add (the file has a live-server harness with `base`; the `beforeAll` writes a run dir — reuse it, or write a second run so the trend has ≥1 model):

```ts
test("GET /trends returns the run history JSON with no absolute paths", async () => {
  const r = await fetch(`${base}/trends`);
  expect(r.status).toBe(200);
  const body = await r.json();
  expect(Array.isArray(body.models)).toBe(true);
  expect(body.models.length).toBeGreaterThanOrEqual(1);
  expect(body.models[0].runs.length).toBeGreaterThanOrEqual(1);
  expect(JSON.stringify(body)).not.toMatch(/\/tmp\//); // no absolute paths leaked
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/cli/test/serve.test.ts`
Expected: FAIL — `/trends` unhandled → 404, body isn't the trend JSON.

- [ ] **Step 3: Implement in `serve.ts`**

Add `collectTrends` to the `@skill-check/core` import. Add the route handler (place after the `/judge` GET handler):

```ts
      if (req.method === "GET" && url.pathname === "/trends") {
        const data = collectTrends(opts.skillDir);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(data));
        return;
      }
```

- [ ] **Step 4: Run tests + build + full suite + commit**

Run: `npx vitest run packages/cli/test/serve.test.ts` → PASS.
Run: `npm run build && npx vitest run` → green.

```bash
git add packages/cli/src/serve.ts packages/cli/test/serve.test.ts
git commit -m "feat(cli): GET /trends serves the per-model run history"
```

---

### Task 5: Trends UI — collapsible section (sparkline + verdict-history grid)

**Files:**
- Modify: `assets/report.template.html`

**Interfaces:**
- Consumes: `GET /trends` (Task 4) → `TrendData`.

- [ ] **Step 1: Add the Trends container + toggle**

In the template body, after the matrix (`.matrix-wrap`/`#matrix` region), add:

```html
<div id="trends-section">
  <button id="trends-toggle">▸ Trends</button>
  <div id="trends" hidden></div>
</div>
```

- [ ] **Step 2: Add the toggle + lazy fetch + render (inline script)**

In the template's inline `<script>`, add a lazy loader + renderer:

```js
let trendsLoaded = false;
document.getElementById("trends-toggle").onclick = async () => {
  const box = document.getElementById("trends");
  const btn = document.getElementById("trends-toggle");
  const nowHidden = box.hasAttribute("hidden");
  if (nowHidden) box.removeAttribute("hidden"); else box.setAttribute("hidden", "");
  btn.textContent = (nowHidden ? "▾ Trends" : "▸ Trends");
  if (nowHidden && !trendsLoaded) {
    trendsLoaded = true;
    box.textContent = "loading…";
    try {
      const r = await fetch("/trends");
      renderTrends(await r.json());
    } catch (e) { box.textContent = "(trends unavailable)"; }
  }
};

function sparkline(runs) {
  if (!runs.length) return "";
  const w = 8 * runs.length + 4, h = 24;
  const pts = runs.map((r, i) => `${4 + i * 8},${h - 2 - (r.grade.pct / 100) * (h - 4)}`).join(" ");
  return `<svg width="${w}" height="${h}" class="spark"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
}

function renderTrends(data) {
  const box = document.getElementById("trends");
  if (!data.models.length) { box.innerHTML = `<div class="empty-state">No runs yet.</div>`; return; }
  const glyph = { PASS: "✓", FAIL: "✗" };
  let html = "";
  for (const m of data.models) {
    const last = m.runs[m.runs.length - 1].grade;
    const badge = last.ship ? "<span class='badge ship'>SHIP</span>" : "<span class='badge no'>NOT READY</span>";
    const trunc = m.truncated ? ` <span class='dim'>(last ${m.runs.length})</span>` : "";
    html += `<div class="tmodel"><div class="tmodel-h">${escapeHtml(m.model)} — ${sparkline(m.runs)} ${last.letter} (${last.pct}%) ${badge}${trunc}</div>`;
    html += "<table class='tgrid'><thead><tr><th></th>";
    for (const run of m.runs) html += `<th title="${escapeHtml(run.label || run.timestamp)}">${escapeHtml((run.label || run.timestamp).slice(0, 8))}</th>`;
    html += "</tr></thead><tbody>";
    for (const scn of data.scenarios) {
      html += `<tr><td class='scn'>${escapeHtml(scn.id)}</td>`;
      for (const run of m.runs) {
        const cell = run.cells[scn.id];
        if (!cell) { html += `<td class='tc absent'>·</td>`; continue; }
        const g = cell.suspect ? "?" : (glyph[cell.verdict] || "?");
        const cls = cell.suspect ? "suspect" : cell.verdict;
        const title = `${run.label || run.timestamp}${cell.flakiness != null ? ` · flaky ${cell.flakiness.toFixed(2)}` : ""}`;
        html += `<td class='tc ${cls}' title="${escapeHtml(title)}">${g}</td>`;
      }
      html += "</tr>";
    }
    html += "</tbody></table></div>";
  }
  box.innerHTML = html;
}
```

- [ ] **Step 3: Add CSS**

In the `<style>` block, add:

```css
  #trends-section { margin-top: 20px; }
  #trends-toggle { cursor: pointer; font-weight: 600; background: none; border: none; font-size: 14px; }
  .tmodel { margin: 12px 0; }
  .tmodel-h { font-size: 13px; margin-bottom: 4px; }
  .spark { vertical-align: middle; color: var(--dim, #888); }
  table.tgrid { border-collapse: collapse; font-size: 12px; }
  .tgrid th, .tgrid td { padding: 2px 6px; text-align: center; }
  .tgrid td.tc.PASS { color: #16a34a; }
  .tgrid td.tc.FAIL { color: #dc2626; }
  .tgrid td.tc.suspect { color: #b45309; }
  .tgrid td.tc.absent { color: var(--dim, #bbb); }
  .dim { color: var(--dim, #888); font-weight: 400; }
```

(Use existing CSS vars where the template defines them; the fallbacks are fine.)

- [ ] **Step 4: Smoke-render + build + full suite**

Smoke: `node --input-type=module` — build first, then `renderReport(template, data, gradeScript)` on a hand-built `ReportData` (the Trends section is static markup, so it appears regardless of data); assert the output contains `id="trends-section"`, `id="trends-toggle"`, `renderTrends`, `sparkline`, and no leftover `/*__DATA__*/null` or `/*__GRADE__*/` placeholder.

Run: `npm run build && npx vitest run` → green (no automated DOM test for the inline JS, consistent with the template; the trend rendering is exercised manually via the smoke + the `/trends` endpoint test covers the data path).

- [ ] **Step 5: Commit**

```bash
git add assets/report.template.html
git commit -m "feat(ui): collapsible Trends section — grade sparkline + verdict-history grid"
```

---

## Self-review (done at plan time)

- **Spec coverage:** effectiveThreshold ✓ (Task 1), preserve judge-raw on override ✓ (Task 1), judgeOneRep dedup ✓ (Task 2), collectTrends (all runs, chronological, limit/truncated, override-aware cells, schema-1 migrate, empty→[]) ✓ (Task 3), /trends lazy endpoint ✓ (Task 4), Trends UI (sparkline + grid, lazy fetch, inline SVG/no deps) ✓ (Task 5). Non-goals (cross-skill, watch, chart lib, edit-from-trends, configurable retention, /rejudge↔cmdGrade persist dedup) untouched.
- **Type consistency:** `effectiveThreshold(prevScenario?, scenario) → number` (Task 1) used by cli+serve; `judgeOneRep(opts) → RepOutcome` (Task 2) used by regradeScenario + runRep; `collectTrends(skillDir, limit?) → TrendData` with `TrendData/TrendModel/TrendRun/TrendCell` (Task 3) consumed by `/trends` (Task 4) and `renderTrends` (Task 5). No absolute paths in `TrendData` → `/trends` serializes it directly.
- **Behavior-preservation flag (Task 2):** the plan explicitly requires runRep's gate-failed branch to keep emitting its `judge-verdict` journal event (only the judge branch moves into `judgeOneRep`), so the golden-run journal sequence is unchanged — called out in the task and the Global Constraints.
- **Placeholder scan:** none.
