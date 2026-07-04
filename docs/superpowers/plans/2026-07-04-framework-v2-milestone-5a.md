# skill-check v2 — Milestone 5a: journal console (inspector + misfire queue + re-judge)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow the review server into a console — inspect a scenario's transcript and the judge's raw output, see all unresolved `suspect` scenarios in a misfire queue, and re-judge one in a click (rep-aware) or resolve it with an audited override — with the same rep-aware re-judge fixing `skill-check grade` on reps runs.

**Architecture:** All new logic in `@skill-check/core`; the CLI/server/template stay thin. The one new core unit is `regradeScenario` (re-judges saved transcripts, no harness re-run), shared by the server's `/rejudge` and the CLI's `grade`. Judge-raw is persisted as a git-ignored per-rep artifact. The client scorer and the single-skill server shape are unchanged.

**Tech Stack:** TypeScript ESM (relative imports end in `.js`), node sync `fs`/`http`, `js-yaml`, vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-04-skill-check-m5a-console-rejudge-design.md`. Master: `docs/superpowers/specs/2026-07-03-skill-check-framework-design.md` (Monitoring/UI).

**Repo / branch:** `~/prepos/skill-check`, branch `framework-v2-m5a` (design committed as `be32bec`). `main` has M1–M4. Baseline: 156 tests.

## Global Constraints

- `npm run build && npx vitest run` green at every commit (repo root). No new npm dependencies.
- ESM: every relative import ends in `.js`. Sync `node:fs`.
- TDD: failing test first, watched fail, then implement.
- N=1 `results.yaml` stays byte-identical to M4 (judge-raw is a separate artifact; `pass_threshold`/reps fields only for `reps > 1`).
- The existing single-skill review flow, `/save` override, matrix, and client scorer (`assets/report.grade.js`) keep working.
- Re-judge re-runs only the **judge**, never the subject harness; it uses the run's **recorded** judge.
- One commit per task, message style `feat(core)/feat(cli)/feat(ui)/fix(core)`.

## File Structure

| File | Responsibility after M5a |
|---|---|
| `packages/core/src/reps.ts` | all-clean-ERROR → aggregate `ERROR`; `outcomesToResult` (shared N=1-bypass + aggregate → `ScenarioResult`) |
| `packages/core/src/journal.ts` | `readJournal` validates event shape |
| `packages/core/src/results.ts` | `judgeRawPath`, `findJudgeRawFiles`; `findTranscriptFiles` excludes judge-raw; `ScenarioResult.pass_threshold?` |
| `packages/core/src/run.ts` | `runRep` writes judge-raw; `runSkillModel` uses `outcomesToResult` |
| `packages/core/src/regrade.ts` (new) | `regradeScenario` — rep-aware re-judge of saved transcripts |
| `packages/cli/src/cli.ts` | `cmdGrade` uses `regradeScenario` (rep-aware; drops the reps-run error) |
| `packages/cli/src/serve.ts` | `GET /judge`, `POST /rejudge` |
| `assets/report.template.html` | inspector judge-raw section; misfire queue; re-judge button |

---

### Task 1: Core carryovers — all-ERROR aggregate + journal shape validation

**Files:**
- Modify: `packages/core/src/reps.ts`, `packages/core/src/journal.ts`
- Test: `packages/core/test/reps.test.ts`, `packages/core/test/journal.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `aggregateReps` returns `verdict: "ERROR"` when every clean rep errored; `readJournal` skips non-object / missing-`event` lines. No signature changes.

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/reps.test.ts`, add to the `aggregateReps` describe (the `pass`/`fail`/`susp` helpers exist; add an `err` helper):

```ts
const err = (): RepOutcome => ({ verdict: "ERROR", reason: "judge unparseable", suspect: false });

test("all clean reps ERROR → aggregate verdict ERROR, not FAIL", () => {
  const a = aggregateReps([err(), err(), err()], 0.5);
  expect(a.verdict).toBe("ERROR");
  expect(a.suspect).toBe(false);
  expect(a.reason).toMatch(/errored/);
});

test("a mix of ERROR and PASS is not all-ERROR (ERROR counts as non-pass)", () => {
  const a = aggregateReps([err(), pass(), pass()], 0.5); // 1/3 pass among clean
  expect(a.verdict).toBe("FAIL"); // passRate 1/3 < 0.5
  expect(a.passes).toBe(2);
});
```

In `packages/core/test/journal.test.ts`, add (the file has an `appendJournal`/`readJournal` round-trip harness with a tmp dir + `journalPath`; reuse it — check the existing imports):

```ts
test("readJournal skips a syntactically-valid line that isn't a journal event", () => {
  const dir = tmp();
  appendJournal(dir, { event: "scenario-started", ts: "t", id: "A1", title: "x" });
  appendFileSync(journalPath(dir), JSON.stringify({ not: "an event" }) + "\n", "utf8");
  appendFileSync(journalPath(dir), "42\n", "utf8"); // valid JSON, not an object
  appendJournal(dir, { event: "misfire-flag", ts: "t", id: "A1", reason: "r" });
  const events = readJournal(dir);
  expect(events).toHaveLength(2); // only the two real events
  expect(events.map((e) => e.event)).toEqual(["scenario-started", "misfire-flag"]);
});
```

(Add `appendFileSync` / `journalPath` to the test's imports if not present.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/core/test/reps.test.ts packages/core/test/journal.test.ts`
Expected: FAIL — all-ERROR currently returns FAIL; `readJournal` currently pushes the bogus `{not:"an event"}` and `42`.

- [ ] **Step 3: Implement in `reps.ts`**

In `aggregateReps`, add the all-ERROR branch immediately after the suspect branch (before `passRate` is computed):

```ts
  const errored = clean.filter((o) => o.verdict === "ERROR").length;
  if (clean.length > 0 && errored === clean.length) {
    return { verdict: "ERROR", reason: `${errored}/${reps} reps errored`, passes: 0, reps, clean: clean.length, flakiness: 0, suspect: false };
  }
```

- [ ] **Step 4: Implement in `journal.ts`**

In `readJournal`, replace the `events.push(JSON.parse(line) as JournalEvent)` with a shape check:

```ts
    try {
      const ev = JSON.parse(line) as unknown;
      if (ev && typeof ev === "object" && typeof (ev as { event?: unknown }).event === "string") {
        events.push(ev as JournalEvent);
      }
      // else: valid JSON but not a journal event — skip
    } catch {
      /* tolerate a torn/corrupt line */
    }
```

- [ ] **Step 5: Run tests + build + full suite + commit**

Run: `npx vitest run packages/core/test/reps.test.ts packages/core/test/journal.test.ts` → PASS.
Run: `npm run build && npx vitest run` → green.

```bash
git add packages/core/src/reps.ts packages/core/src/journal.ts packages/core/test/reps.test.ts packages/core/test/journal.test.ts
git commit -m "fix(core): all-ERROR reps aggregate to ERROR; readJournal validates event shape"
```

---

### Task 2: Judge-raw persistence + transcript-glob collision guard

**Files:**
- Modify: `packages/core/src/results.ts`, `packages/core/src/run.ts`
- Test: `packages/core/test/results.test.ts`, `packages/core/test/golden-run.test.ts`

**Interfaces:**
- Consumes: `findTranscriptFiles` (existing).
- Produces:
  - `export function judgeRawPath(runDir: string, id: string, mode: string, rep?: number): string` → `<runDir>/<id>.<mode>.judge.txt` or `<id>.<mode>.rep<k>.judge.txt`.
  - `export function findJudgeRawFiles(runDir: string, id: string, mode?: string): string[]` — judge-raw files for a scenario, sorted (plain first, then numeric rep). Default no-mode = all `<id>.*.judge.txt`.
  - `findTranscriptFiles(runDir, id)` (no-mode) now **excludes** `*.judge.txt`. Task 4 (`regradeScenario`) and Task 6 (`/judge`) rely on these.

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/results.test.ts`, add (reuse the tmp-dir + writeFileSync harness the file already uses):

```ts
import { judgeRawPath, findJudgeRawFiles, findTranscriptFiles } from "../src/results.js";

describe("judge-raw artifacts", () => {
  test("judgeRawPath names plain vs rep-suffixed files", () => {
    expect(judgeRawPath("/r", "A1", "green")).toBe(join("/r", "A1.green.judge.txt"));
    expect(judgeRawPath("/r", "A1", "green", 2)).toBe(join("/r", "A1.green.rep2.judge.txt"));
  });

  test("findJudgeRawFiles returns green judge files sorted; findTranscriptFiles excludes them", () => {
    const dir = tmp();
    writeFileSync(join(dir, "A1.green.rep0.txt"), "t0", "utf8");
    writeFileSync(join(dir, "A1.green.rep1.txt"), "t1", "utf8");
    writeFileSync(join(dir, "A1.green.rep0.judge.txt"), "j0", "utf8");
    writeFileSync(join(dir, "A1.green.rep1.judge.txt"), "j1", "utf8");
    expect(findJudgeRawFiles(dir, "A1", "green")).toEqual(["A1.green.rep0.judge.txt", "A1.green.rep1.judge.txt"]);
    // the transcript glob must NOT pick up the .judge.txt files
    expect(findTranscriptFiles(dir, "A1")).toEqual(["A1.green.rep0.txt", "A1.green.rep1.txt"]);
    expect(findTranscriptFiles(dir, "A1", "green")).toEqual(["A1.green.rep0.txt", "A1.green.rep1.txt"]);
  });
});
```

In `packages/core/test/golden-run.test.ts`, extend an existing green run test (the fake adapter's `judge` returns a fixed string) to assert the judge-raw artifact is written — add after the run:

```ts
    // judge-raw persisted next to the transcript
    expect(readFileSync(join(runDir, "A1.green.judge.txt"), "utf8")).toContain("VERDICT");
```

(The golden fake adapter's `judge` returns `"1. PASS — greets\nVERDICT: PASS\nREASON: greeted politely"`, so the raw contains `VERDICT`.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/core/test/results.test.ts packages/core/test/golden-run.test.ts`
Expected: FAIL — `judgeRawPath`/`findJudgeRawFiles` not exported; `findTranscriptFiles` no-mode includes `.judge.txt`; no judge-raw file written.

- [ ] **Step 3: Implement in `results.ts`**

Add the two helpers (place near `transcriptPath`/`findTranscriptFiles`):

```ts
/** Path of a scenario's raw judge-output artifact within a run dir (rep-suffixed for reps). */
export function judgeRawPath(runDir: string, scenarioId: string, mode: string, rep?: number): string {
  const base = rep === undefined ? `${scenarioId}.${mode}` : `${scenarioId}.${mode}.rep${rep}`;
  return join(runDir, `${base}.judge.txt`);
}

/** A scenario's raw judge-output files, sorted (plain first, then numeric rep). Mode-scoped when given. */
export function findJudgeRawFiles(runDir: string, scenarioId: string, mode?: string): string[] {
  if (!existsSync(runDir)) return [];
  const esc = scenarioId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = mode === undefined
    ? new RegExp(`^${esc}\\..*\\.judge\\.txt$`)
    : new RegExp(`^${esc}\\.${mode}(\\.rep\\d+)?\\.judge\\.txt$`);
  return sortByRep(readdirSync(runDir).filter((f) => re.test(f)));
}
```

`findTranscriptFiles` currently sorts inline (a local `repOf` using the module's `REP_SUFFIX_RE` + a plain-before-rep, numeric-rep comparator). **Extract that sort** into a module-private helper and reuse it in both:

```ts
/** Sort transcript-like filenames: plain (no rep) first, then by numeric rep index. */
function sortByRep(files: string[]): string[] {
  const repOf = (f: string): number | null => {
    const m = REP_SUFFIX_RE.exec(f);
    return m ? Number(m[1]) : null;
  };
  return files.sort((a, b) => {
    const ra = repOf(a);
    const rb = repOf(b);
    if (ra === null && rb === null) return a.localeCompare(b);
    if (ra === null) return -1;
    if (rb === null) return 1;
    return ra - rb;
  });
}
```

Then `findTranscriptFiles` returns `sortByRep(files)` (replacing its inline `.sort(...)`), and its **no-mode** filter excludes judge-raw — add `&& !f.includes(".judge.")` to the no-mode predicate:

```ts
  const files = readdirSync(runDir).filter((f) =>
    matcher ? matcher.test(f) : f.startsWith(`${scenarioId}.`) && f.endsWith(".txt") && !f.includes(".judge.")
  );
  return sortByRep(files);
```

(The mode-scoped branch's anchored regex `^<id>\.<mode>(\.rep\d+)?\.txt$` already excludes `.judge.txt` — no change there. `REP_SUFFIX_RE` is the module-level constant `repOf` already uses.)

- [ ] **Step 4: Implement in `run.ts` (`runRep` writes judge-raw)**

Import `judgeRawPath` in `run.ts` (add to the `./results.js` import). In `runRep`, in the `else` branch that calls `judgeInWorkspace`, capture and persist the raw:

```ts
      const g = await judgeInWorkspace(ctx.adapter, judge, prompt, dirname(ctx.specPath));
      writeFileSync(judgeRawPath(runDir, scenario.id, mode, repCount > 1 ? rep : undefined), g.raw, "utf8");
      verdict = g.verdict;
      reason = g.reason;
      suspect = g.suspect;
```

(Gate-failed scenarios never reach the judge branch, so they write no judge-raw — correct.)

- [ ] **Step 5: Run tests + build + full suite + commit**

Run: `npx vitest run packages/core/test/results.test.ts packages/core/test/golden-run.test.ts` → PASS.
Run: `npm run build && npx vitest run` → green.

```bash
git add packages/core/src/results.ts packages/core/src/run.ts packages/core/test/results.test.ts packages/core/test/golden-run.test.ts
git commit -m "feat(core): persist raw judge output per rep; exclude judge-raw from the transcript glob"
```

---

### Task 3: Shared rep-aggregation (`outcomesToResult`) + persist `pass_threshold`

Extract the "rep outcomes → `ScenarioResult` fields" logic (currently inline in `runSkillModel`) into a shared function so `regradeScenario` (Task 4) reuses it, and persist the effective threshold on reps runs.

**Files:**
- Modify: `packages/core/src/reps.ts`, `packages/core/src/results.ts`, `packages/core/src/run.ts`
- Test: `packages/core/test/reps.test.ts`, `packages/core/test/golden-run.test.ts`

**Interfaces:**
- Consumes: `aggregateReps`, `RepOutcome`, `ScenarioResult`.
- Produces: `export function outcomesToResult(id: string, outcomes: RepOutcome[], repCount: number, threshold: number): ScenarioResult`. For `repCount === 1` → `{id, judge_verdict, judge_reason, suspect, override: null, note: ""}` (no reps fields — byte-identical to M4). For `repCount > 1` → adds `reps`, `passes`, `clean`, `flakiness`, and `pass_threshold: threshold`. `ScenarioResult` gains `pass_threshold?: number`. Task 4 relies on `outcomesToResult`.

- [ ] **Step 1: Write the failing test**

In `packages/core/test/reps.test.ts`:

```ts
import { outcomesToResult } from "../src/reps.js";

describe("outcomesToResult", () => {
  test("single rep → no reps fields (byte-identical to a plain run)", () => {
    const r = outcomesToResult("A1", [pass()], 1, 0.5);
    expect(r).toEqual({ id: "A1", judge_verdict: "PASS", judge_reason: "ok", suspect: false, override: null, note: "" });
  });

  test("multi rep → reps/passes/clean/flakiness + persisted pass_threshold", () => {
    const r = outcomesToResult("A1", [pass(), pass(), fail()], 3, 0.6);
    expect(r.reps).toBe(3);
    expect(r.passes).toBe(2);
    expect(r.clean).toBe(3);
    expect(r.pass_threshold).toBe(0.6);
    expect(r.judge_verdict).toBe("PASS"); // 2/3 = 0.67 >= 0.6
    expect(r.override).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/core/test/reps.test.ts` → FAIL (`outcomesToResult` not exported).

- [ ] **Step 3: Implement `outcomesToResult` in `reps.ts`**

```ts
import type { ScenarioResult } from "./results.js";

/**
 * Collapse a scenario's rep outcomes into a ScenarioResult. N=1 preserves the
 * single judge's verdict/reason with no reps fields (byte-identical to a plain
 * run); N>1 aggregates and persists the effective threshold (so a later
 * re-judge reproduces the same pass-rate). override/note are left empty for the
 * caller to merge.
 */
export function outcomesToResult(id: string, outcomes: RepOutcome[], repCount: number, threshold: number): ScenarioResult {
  if (repCount === 1) {
    const o = outcomes[0];
    return { id, judge_verdict: o.verdict, judge_reason: o.reason, suspect: o.suspect, override: null, note: "" };
  }
  const agg = aggregateReps(outcomes, threshold);
  return {
    id, judge_verdict: agg.verdict, judge_reason: agg.reason, suspect: agg.suspect,
    reps: agg.reps, passes: agg.passes, clean: agg.clean, flakiness: agg.flakiness,
    pass_threshold: threshold, override: null, note: "",
  };
}
```

(`reps.ts` importing the `ScenarioResult` type from `results.ts` is safe — `results.ts` does not import `reps.ts`, so no cycle. Type-only import.)

- [ ] **Step 4: Add `pass_threshold?` to `ScenarioResult` (`results.ts`)**

In the `ScenarioResult` interface, after `flakiness?`:

```ts
  pass_threshold?: number; // effective threshold used (reps runs only) — lets re-judge reproduce the aggregate
```

- [ ] **Step 5: Use `outcomesToResult` in `run.ts`**

In `runSkillModel`, replace the inline scenario-result map (the `if (repCounts[si] === 1) {…} else {…aggregateReps…}` block) with:

```ts
  const scenarioResults: ScenarioResult[] = spec.scenarios.map((scenario, si) => {
    const threshold = scenario.passThreshold ?? opts.passThreshold ?? 0.5;
    return outcomesToResult(scenario.id, grouped[si], repCounts[si], threshold);
  });
```

Import `outcomesToResult` from `./reps.js` (add to the existing `aggregateReps` import). Remove the now-unused inline logic. (For N=1 this is identical output to before; for N>1 it now also writes `pass_threshold` — a new optional field on reps results only.)

- [ ] **Step 6: Update the golden reps test for the new field**

In `packages/core/test/golden-run.test.ts`, the `--reps N` test asserts reps fields; add:

```ts
    expect(s.pass_threshold).toBe(0.5); // default threshold persisted on reps runs
```

(and confirm the N=1 tests still assert `s.reps`/`s.clean`/`s.pass_threshold` are all `undefined` — byte-identity).

- [ ] **Step 7: Build + full suite + commit**

Run: `npm run build && npx vitest run` → green (golden N=1 byte-identical; reps run now carries `pass_threshold`).

```bash
git add packages/core/src/reps.ts packages/core/src/results.ts packages/core/src/run.ts packages/core/test/reps.test.ts packages/core/test/golden-run.test.ts
git commit -m "feat(core): shared outcomesToResult (rep aggregation) + persist pass_threshold on reps runs"
```

---

### Task 4: `regradeScenario` — rep-aware re-judge of saved transcripts

**Files:**
- Create: `packages/core/src/regrade.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/regrade.test.ts` (new)

**Interfaces:**
- Consumes: `findTranscriptFiles` (green), `judgeRawPath` (Task 2), `buildJudgePrompt`/`judgeInWorkspace` (`grade.ts`), `outcomesToResult` (Task 3), `appendJournal`, `RepOutcome`.
- Produces:
  ```ts
  export async function regradeScenario(opts: {
    runDir: string; spec: Spec; scenario: Scenario;
    adapter: HarnessAdapter; judge: ModelRef; specDir: string;
    threshold: number; now?: () => string;
  }): Promise<ScenarioResult>;
  ```
  Re-judges the scenario's green transcript(s), rewrites judge-raw artifacts, emits per-rep `judge-verdict`/`misfire-flag` journal events, and returns a `ScenarioResult` (override/note empty — caller merges). Throws if there are no green transcripts. Tasks 5 (cmdGrade) and 6 (serve) call it.

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/regrade.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { regradeScenario, parseSpec, type HarnessAdapter, type JudgeReq } from "../src/index.js";

const tmps: string[] = [];
function tmp() { const d = mkdtempSync(join(tmpdir(), "sc-regrade-")); tmps.push(d); return d; }
afterEach(() => { while (tmps.length) rmSync(tmps.pop()!, { recursive: true, force: true }); });

const SPEC = `
skill: demo
judge_persona: a judge.
ship_bar: { total: 1, min_pass: 1 }
scenarios:
  - id: A1
    title: t
    turns: ["hi"]
    checklist: ["ok"]
`;
const scenarioOf = (text: string) => parseSpec(text, "s.yaml");

function judgeAdapter(raw: string): HarnessAdapter {
  return { name: "pi", available: async () => true, run: async () => "", judge: async (_: JudgeReq) => raw };
}

describe("regradeScenario", () => {
  it("re-judges a single green transcript, rewrites judge-raw, returns the verdict", async () => {
    const runDir = tmp();
    writeFileSync(join(runDir, "A1.green.txt"), "USER: hi\nASSISTANT: hello", "utf8");
    const spec = scenarioOf(SPEC);
    const r = await regradeScenario({
      runDir, spec, scenario: spec.scenarios[0],
      adapter: judgeAdapter("1. PASS — ok\nVERDICT: PASS\nREASON: fine"),
      judge: { provider: "claude-code", model: "opus" }, specDir: runDir, threshold: 0.5,
      now: () => "t",
    });
    expect(r.judge_verdict).toBe("PASS");
    expect(r.reps).toBeUndefined(); // single transcript → no reps fields
    expect(readFileSync(join(runDir, "A1.green.judge.txt"), "utf8")).toMatch(/VERDICT: PASS/);
  });

  it("re-judges all rep transcripts and re-aggregates", async () => {
    const runDir = tmp();
    writeFileSync(join(runDir, "A1.green.rep0.txt"), "t0", "utf8");
    writeFileSync(join(runDir, "A1.green.rep1.txt"), "t1", "utf8");
    writeFileSync(join(runDir, "A1.green.rep2.txt"), "t2", "utf8");
    const spec = scenarioOf(SPEC);
    const r = await regradeScenario({
      runDir, spec, scenario: spec.scenarios[0],
      adapter: judgeAdapter("1. PASS — ok\nVERDICT: PASS\nREASON: fine"),
      judge: { provider: "claude-code", model: "opus" }, specDir: runDir, threshold: 0.5,
      now: () => "t",
    });
    expect(r.reps).toBe(3);
    expect(r.judge_verdict).toBe("PASS");
    expect(existsSync(join(runDir, "A1.green.rep2.judge.txt"))).toBe(true);
  });

  it("throws when there are no green transcripts", async () => {
    const runDir = tmp();
    const spec = scenarioOf(SPEC);
    await expect(regradeScenario({
      runDir, spec, scenario: spec.scenarios[0],
      adapter: judgeAdapter("VERDICT: PASS\nREASON: x"),
      judge: { provider: "claude-code", model: "opus" }, specDir: runDir, threshold: 0.5,
    })).rejects.toThrow(/no green transcripts/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/core/test/regrade.test.ts` → FAIL (`regrade.js` missing).

- [ ] **Step 3: Implement `regrade.ts`**

```ts
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Spec, Scenario } from "./spec.js";
import type { HarnessAdapter, ModelRef } from "./adapters/types.js";
import { buildJudgePrompt, judgeInWorkspace } from "./grade.js";
import { findTranscriptFiles, judgeRawPath, type ScenarioResult } from "./results.js";
import { outcomesToResult, type RepOutcome } from "./reps.js";
import { appendJournal } from "./journal.js";

export interface RegradeOptions {
  runDir: string;
  spec: Spec;
  scenario: Scenario;
  adapter: HarnessAdapter;
  judge: ModelRef;
  specDir: string; // fixtures/neutral cwd base for the judge workspace
  threshold: number;
  now?: () => string;
}

/**
 * Re-judge a scenario's saved GREEN transcript(s) with `judge` — no harness
 * re-run. Rewrites the judge-raw artifact per rep, emits per-rep judge-verdict
 * (+ misfire-flag) journal events, and returns the aggregated ScenarioResult
 * (override/note empty; the caller merges any prior override + persists).
 */
export async function regradeScenario(opts: RegradeOptions): Promise<ScenarioResult> {
  const now = opts.now ?? (() => new Date().toISOString());
  const files = findTranscriptFiles(opts.runDir, opts.scenario.id, "green");
  if (files.length === 0) {
    throw new Error(`no green transcripts for ${opts.scenario.id} in ${opts.runDir}`);
  }
  const repCount = files.length;
  const outcomes: RepOutcome[] = [];
  for (let i = 0; i < files.length; i++) {
    const rep = repCount > 1 ? i : undefined; // findTranscriptFiles(green) is sorted rep0..repN for reps runs
    const transcript = readFileSync(join(opts.runDir, files[i]), "utf8");
    const prompt = buildJudgePrompt({ skill: opts.spec.skill, persona: opts.spec.judge_persona, scenario: opts.scenario, transcript });
    const g = await judgeInWorkspace(opts.adapter, opts.judge, prompt, opts.specDir);
    writeFileSync(judgeRawPath(opts.runDir, opts.scenario.id, "green", rep), g.raw, "utf8");
    const repField = rep === undefined ? {} : { rep };
    appendJournal(opts.runDir, { event: "judge-verdict", ts: now(), id: opts.scenario.id, verdict: g.verdict, reason: g.reason, suspect: g.suspect, ...repField });
    if (g.suspect) appendJournal(opts.runDir, { event: "misfire-flag", ts: now(), id: opts.scenario.id, reason: g.reason, ...repField });
    outcomes.push({ verdict: g.verdict, reason: g.reason, suspect: g.suspect });
  }
  return outcomesToResult(opts.scenario.id, outcomes, repCount, opts.threshold);
}
```

Add `export * from "./regrade.js";` to `packages/core/src/index.ts` (after the `./reps.js` line).

- [ ] **Step 4: Run tests + build + full suite + commit**

Run: `npx vitest run packages/core/test/regrade.test.ts` → PASS.
Run: `npm run build && npx vitest run` → green.

```bash
git add packages/core/src/regrade.ts packages/core/src/index.ts packages/core/test/regrade.test.ts
git commit -m "feat(core): regradeScenario — rep-aware re-judge of saved transcripts"
```

---

### Task 5: `cmdGrade` rep-aware (via `regradeScenario`); drops the reps-run error

**Files:**
- Modify: `packages/cli/src/cli.ts`
- Test: `packages/cli/test/grade-cmd.test.ts`

**Interfaces:**
- Consumes: `regradeScenario` (Task 4), `findTranscriptFiles` (green), existing `readResults`/`writeResults`/`loadSpec`/`getAdapter`.
- Produces: `cmdGrade` re-grades reps runs (no more "reps run isn't supported" error); single-rep behavior unchanged.

- [ ] **Step 1: Write the failing test**

In `packages/cli/test/grade-cmd.test.ts`, replace the test that asserts a reps run throws `/reps run/` with one that asserts it now re-grades. Add a fake-adapter path: `cmdGrade` uses `getAdapter("pi")` internally, which shells out to `pi`/`claude` — so this test needs a way to avoid a live judge. The cleanest: this test only needs the reps run to be *accepted* (not throw the old error) and produce a results.yaml. Since a live judge isn't available deterministically, assert that `cmdGrade` no longer throws the reps-run error and instead reaches the judge path — verify by checking it throws a DIFFERENT error (judge/harness), OR make `getAdapter("pi").available()` false in the test env. Prefer: assert the OLD error is gone. Concretely, a reps run dir with `A1.green.rep0.txt` + a schema-2 reps results.yaml:

```ts
test("a --reps run is now re-gradable (no longer rejected)", async () => {
  const { runDir } = repsRunFixture(); // A1 reps=2, A1.green.rep0/1.txt on disk, results.yaml reps
  await expect(cmdGrade(args(runDir))).rejects.not.toThrow(/reps run/);
});
```

If `pi` is on PATH in CI the judge will actually run; to keep the test hermetic and fast, gate it: the assertion `rejects.not.toThrow(/reps run/)` passes whether it errors on the judge or succeeds — it only proves the reps-run rejection is gone. (A full rep-aware re-grade with a fake adapter is covered by `regrade.test.ts` in Task 4; this test guards the CLI wiring, not the judge.) Build `repsRunFixture()` mirroring the existing `threeScenarioRun()` helper but with `reps: 2` and two rep transcripts written for A1.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/cli/test/grade-cmd.test.ts`
Expected: FAIL — current code throws `/reps run/`, so `rejects.not.toThrow(/reps run/)` fails.

- [ ] **Step 3: Rewrite `cmdGrade`'s loop**

In `packages/cli/src/cli.ts` `cmdGrade`:
- Import `regradeScenario` from `@skill-check/core` (add to the import).
- Delete the `isRepsOnly` block (the reps-run rejection) entirely.
- Change the existence guard to accept rep-suffixed transcripts: replace `!existsSync(transcriptPath(runDir, id, "green"))` in the `missing` filter with `findTranscriptFiles(runDir, id, "green").length === 0`.
- Replace the per-scenario judge loop with `regradeScenario`, preserving carried override/note and using the persisted/spec threshold:

```ts
  const scenarioResults: ScenarioResult[] = [];
  for (const id of targets) {
    const scenario = specById.get(id)!;
    const prevScenario = prev?.scenarios.find((s) => s.id === id);
    const threshold = prevScenario?.pass_threshold ?? scenario.passThreshold ?? 0.5;
    const rr = await regradeScenario({
      runDir, spec, scenario, adapter, judge, specDir: testsDir, threshold, now: nowIso,
    });
    console.log(`  ${id} → ${rr.judge_verdict}: ${rr.judge_reason}`);
    const carry = overrides.get(id);
    scenarioResults.push({ ...rr, override: carry?.override ?? null, note: carry?.note ?? "" });
  }
```

- Preserve the run's original timestamp on re-grade (a re-grade doesn't mint a new run): in the `writeResults` draft, use `timestamp: prev?.timestamp ?? nowIso()` instead of `nowIso()`.

- [ ] **Step 4: Run tests + build + full suite + commit**

Run: `npx vitest run packages/cli/test/grade-cmd.test.ts` → PASS (reps run accepted; the existing no-transcripts / missing-scenario guards still hold — confirm those tests pass).
Run: `npm run build && npx vitest run` → green.

```bash
git add packages/cli/src/cli.ts packages/cli/test/grade-cmd.test.ts
git commit -m "feat(cli): cmdGrade re-grades reps runs via regradeScenario (drops the reps-run error)"
```

---

### Task 6: Server endpoints — `GET /judge` + `POST /rejudge`

**Files:**
- Modify: `packages/cli/src/serve.ts`
- Test: `packages/cli/test/serve.test.ts`

**Interfaces:**
- Consumes: `regradeScenario` (Task 4), `findJudgeRawFiles` (Task 2), existing `collectReport`/`readResults`/`writeResults`/`loadSpec`/`getAdapter`/`ensureResultsGitignore`/`appendJournal`.
- Produces: `GET /judge?col=&id=` → raw judge output (all reps concatenated) or 404; `POST /rejudge {col, scenarioId}` → re-judges one scenario, persists, returns `{ ok, grade }`.

- [ ] **Step 1: Write the failing serve test**

In `packages/cli/test/serve.test.ts`, add (the file has a live-server harness with `base`/`save()`; add a fake-adapter run dir with a judge-raw file + a suspect scenario). Because `/rejudge` calls `getAdapter(harness)` which shells out to `pi`, the hermetic assertion is on `/judge` (pure file read) plus a `/rejudge` that the test can drive only if the harness is stubbable. Given serve uses `getAdapter` internally, test `/judge` fully and `/rejudge`'s error path (unknown column / non-green) here; the happy-path re-judge is covered by `regrade.test.ts`:

```ts
test("GET /judge returns the raw judge output for a scenario", async () => {
  // the fixture run dir written in beforeAll also gets a judge-raw artifact:
  writeFileSync(join(runDir, "A1.green.judge.txt"), "1. PASS\nVERDICT: PASS\nREASON: ok", "utf8");
  const r = await fetch(`${base}/judge?col=0&id=A1`);
  expect(r.status).toBe(200);
  expect(await r.text()).toMatch(/VERDICT: PASS/);
});

test("GET /judge 404s when no judge-raw artifact exists", async () => {
  const r = await fetch(`${base}/judge?col=0&id=ZZ`);
  expect(r.status).toBe(404);
});

test("POST /rejudge 404s for an unknown column", async () => {
  const r = await fetch(`${base}/rejudge`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ col: 99, scenarioId: "A1" }),
  });
  expect(r.status).toBe(404);
});
```

(Add `writeFileSync` to the serve test's imports if needed.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/cli/test/serve.test.ts`
Expected: FAIL — `/judge` and `/rejudge` return 404 (unhandled → the catch-all), so the 200/`VERDICT` assertion fails.

- [ ] **Step 3: Implement in `serve.ts`**

Add a judge-raw reader near `findTranscript`:

```ts
/** All of a scenario's judge-raw artifacts, concatenated with a header per rep. */
function findJudgeRaw(runDir: string, id: string): string | null {
  const files = findJudgeRawFiles(runDir, id, "green");
  if (files.length === 0) return null;
  if (files.length === 1) return readFileSync(join(runDir, files[0]), "utf8");
  return files.map((f) => `===== ${f} =====\n${readFileSync(join(runDir, f), "utf8")}`).join("\n\n");
}
```

Add to the `@skill-check/core` import: `regradeScenario`, `findJudgeRawFiles`, `parseModelRef` is not needed (judge is already a `{provider, model}`). Add the two route handlers (place after the `/transcript` handler, before `/save`):

```ts
      if (req.method === "GET" && url.pathname === "/judge") {
        const col = Number(url.searchParams.get("col"));
        const id = url.searchParams.get("id") ?? "";
        const data = collectReport(opts.skillDir);
        const column = data.columns.find((c) => c.index === col);
        const text = column ? findJudgeRaw(column.runDir, id) : null;
        res.writeHead(text ? 200 : 404, { "content-type": "text/plain; charset=utf-8" });
        res.end(text ?? "judge output not captured");
        return;
      }

      if (req.method === "POST" && url.pathname === "/rejudge") {
        const body = JSON.parse((await readBody(req)) || "{}") as { col: number; scenarioId: string };
        const data = collectReport(opts.skillDir);
        const column = data.columns.find((c) => c.index === body.col);
        if (!column) { res.writeHead(404).end("unknown column"); return; }
        const results = readResults(column.runDir);
        if (results.mode !== "green") {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "only green runs can be re-judged" }));
          return;
        }
        const specPath = join(opts.skillDir, "tests", "specification.yaml");
        const spec = loadSpec(specPath);
        const scenario = spec.scenarios.find((s) => s.id === body.scenarioId);
        if (!scenario) { res.writeHead(404).end("unknown scenario"); return; }
        const adapter = getAdapter(results.harness);
        if (!(await adapter.available())) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: `harness \`${results.harness}\` is not on PATH` }));
          return;
        }
        const prev = results.scenarios.find((s) => s.id === body.scenarioId);
        const threshold = prev?.pass_threshold ?? scenario.passThreshold ?? 0.5;
        const rr = await regradeScenario({
          runDir: column.runDir, spec, scenario, adapter, judge: results.judge,
          specDir: dirname(specPath), threshold,
        });
        const merged = results.scenarios.map((s) =>
          s.id === body.scenarioId ? { ...rr, override: s.override, note: s.note } : s
        );
        const written = writeResults(column.runDir, {
          skill: results.skill, harness: results.harness, model: results.model, judge: results.judge,
          timestamp: results.timestamp, label: results.label, mode: results.mode, scenarios: merged,
        }, { shipBar: spec.ship_bar, critical: spec.critical });
        ensureResultsGitignore(join(opts.skillDir, "tests", "results"));
        const g = written.effective_grade;
        appendJournal(column.runDir, { event: "score", ts: new Date().toISOString(), passed: g.passed, total: g.total, pct: g.pct, letter: g.letter, ship: g.ship, note: g.note });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, grade: g }));
        return;
      }
```

Add `dirname` to the `node:path` import if not present (it is). `getAdapter` import from `@skill-check/adapters` — add it (serve.ts currently imports from `@skill-check/core` only; add `import { getAdapter } from "@skill-check/adapters";`).

- [ ] **Step 4: Run tests + build + full suite + commit**

Run: `npx vitest run packages/cli/test/serve.test.ts` → PASS.
Run: `npm run build && npx vitest run` → green.

```bash
git add packages/cli/src/serve.ts packages/cli/test/serve.test.ts
git commit -m "feat(cli): /judge (raw judge output) + /rejudge (rep-aware re-judge) endpoints"
```

---

### Task 7: Console UI — judge-raw inspector, misfire queue, re-judge button

**Files:**
- Modify: `assets/report.template.html`

**Interfaces:**
- Consumes: `GET /judge`, `POST /rejudge` (Task 6); the existing `DATA` payload (cells carry `suspect`/`override`/`reps`).

- [ ] **Step 1: Add the judge-raw section to the inspector panel**

In `openPanel`, after the `transcript` `<pre>`, add a judge-raw section to the `panel.innerHTML` template:

```js
    <label class="fld">judge raw</label>
    <pre class="transcript" id="judgeraw">loading…</pre>
```

and after the transcript fetch, fetch the judge raw:

```js
  try {
    const jr = await fetch(`/judge?col=${colIndex}&id=${encodeURIComponent(scenarioId)}`);
    document.getElementById("judgeraw").textContent = jr.ok ? await jr.text() : "(judge output not captured)";
  } catch { document.getElementById("judgeraw").textContent = "(judge output not captured)"; }
```

- [ ] **Step 2: Add a Re-judge button to the panel**

In the panel `innerHTML`, after the `toggle` div (override buttons), add:

```js
    <div class="rejudge"><button id="rejudgeBtn">Re-judge (${escapeHtml(col.judge.provider + ":" + col.judge.model)})</button> <span class="saved" id="rejudged"></span></div>
```

and wire it (after the toggle-button wiring):

```js
  const rj = document.getElementById("rejudgeBtn");
  if (rj) rj.onclick = async () => {
    rj.disabled = true; rj.textContent = "re-judging…";
    try {
      const r = await fetch("/rejudge", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ col: colIndex, scenarioId }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) { const s = document.getElementById("rejudged"); if (s) { s.textContent = body.error || "re-judge failed"; s.classList.add("show", "err"); } rj.disabled = false; rj.textContent = "Re-judge"; return; }
      location.reload(); // re-judge rewrote results.yaml; reload the fresh matrix + grades
    } catch (e) { rj.disabled = false; rj.textContent = "Re-judge"; }
  };
```

(`location.reload()` re-fetches `/` — the simplest correct refresh after the server rewrote `results.yaml`.)

- [ ] **Step 3: Add the misfire queue above the matrix**

In the page body (before the `#matrix` container in the template's HTML), add a queue container:

```html
<div id="misfires"></div>
```

In the `render()` function, after computing `grades` and before/after building the matrix, populate the queue from `DATA`:

```js
  const queue = [];
  DATA.columns.forEach((col) => {
    for (const scn of DATA.scenarios) {
      const cell = col.cells[scn.id];
      if (cell && cell.suspect && !cell.override) queue.push({ col: col.index, id: scn.id, label: col.label, reason: cell.judge_reason });
    }
  });
  const mf = document.getElementById("misfires");
  if (mf) {
    mf.innerHTML = queue.length
      ? `<div class="mf-title">⚠ Misfire queue (${queue.length})</div>` + queue.map((q) =>
          `<div class="mf-row" data-col="${q.col}" data-id="${escapeHtml(q.id)}"><b>${escapeHtml(q.id)}</b> · ${escapeHtml(q.label)} — ${escapeHtml(q.reason || "(no reason)")} <button class="mf-open">inspect</button></div>`
        ).join("")
      : `<div class="mf-title empty">No unresolved misfires.</div>`;
    mf.querySelectorAll(".mf-row").forEach((row) => {
      row.querySelector(".mf-open").onclick = () => openPanel(+row.dataset.col, row.dataset.id);
    });
  }
```

- [ ] **Step 4: Add minimal CSS**

In the `<style>` block, add (near the existing `.ov`/`.reps` rules):

```css
  #misfires { margin: 0 0 16px; }
  .mf-title { font-weight: 600; margin-bottom: 6px; }
  .mf-title.empty { color: var(--dim); font-weight: 400; }
  .mf-row { padding: 4px 0; border-bottom: 1px solid var(--line, #eee); font-size: 13px; }
  .rejudge { margin: 8px 0; }
  .rejudge button { cursor: pointer; }
```

(Use existing CSS variables where present; `--line`/`#eee` fallback is fine.)

- [ ] **Step 5: Smoke-render + build + full suite**

Smoke: `node --input-type=module` — read the template + `report.grade.js`, call `renderReport` (import from `packages/core/dist/report.js` after `npm run build`) with a hand-built `ReportData` that has one suspect cell, and assert the output contains `id="misfires"`, `Re-judge`, `id="judgeraw"`, and no leftover `/*__DATA__*/null` or `/*__GRADE__*/` placeholder. (Mirror the M4 smoke pattern.)

Run: `npm run build && npx vitest run` → green (no automated DOM test for the inline JS — consistent with the existing template; the `gradeColumn` parity test still covers the scorer).

- [ ] **Step 6: Commit**

```bash
git add assets/report.template.html
git commit -m "feat(ui): judge-raw inspector, misfire queue, and one-click re-judge in the review console"
```

---

## Self-review (done at plan time)

- **Spec coverage:** judge-raw persistence + inspector ✓ (Tasks 2, 6, 7); misfire queue ✓ (Task 7); re-judge (rep-aware, recorded judge, shared core) ✓ (Tasks 4, 6); cmdGrade rep-aware ✓ (Task 5); threshold fidelity (`pass_threshold` persisted) ✓ (Task 3); glob-collision guard ✓ (Task 2); carryovers all-ERROR + readJournal ✓ (Task 1). Non-goals (trends, multi-skill, judge picker, subject re-run, watch) untouched.
- **Type consistency:** `outcomesToResult(id, outcomes, repCount, threshold): ScenarioResult` (Task 3) used by run.ts and `regradeScenario` (Task 4); `regradeScenario(opts): Promise<ScenarioResult>` (Task 4) called by cmdGrade (Task 5) and serve (Task 6); `judgeRawPath`/`findJudgeRawFiles` (Task 2) used by run.ts, regrade.ts, serve.ts; `ScenarioResult.pass_threshold?` (Task 3) written by run.ts, read by cmdGrade + serve; `findTranscriptFiles` collision-exclusion (Task 2) protects `/transcript` + `preserveTranscript`.
- **Placeholder scan:** none. Task 5's CLI test asserts the *reps-run rejection is gone* (`rejects.not.toThrow(/reps run/)`) rather than driving a live judge — the full rep-aware re-judge is covered hermetically by `regrade.test.ts` (Task 4); this is an intentional, stated coverage boundary, not a placeholder.
- **N=1 byte-identity:** `outcomesToResult` at `repCount===1` returns exactly the M4 shape (no reps/`pass_threshold` fields); judge-raw is a separate artifact; golden N=1 tests keep asserting the reps fields are `undefined`.
