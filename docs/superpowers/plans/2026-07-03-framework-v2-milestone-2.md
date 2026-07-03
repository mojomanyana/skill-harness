# skill-check v2 — Milestone 2: Results v2 + journal + override-aware scoring

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** results.yaml schema 2 with an always-override-aware `effective_grade` (stale grades structurally impossible), a `journal.jsonl` event stream per run, note-required + transcript-preserving overrides, a structured `suspect` misfire flag, and a run `label` — with schema-1 files still readable.

**Architecture:** All logic lands in `@skill-check/core` (`results.ts` grows finalize/migrate/preserve; new `journal.ts`); `run.ts` emits journal events and delegates grade computation to `writeResults`; the CLI and review server become thin callers. The single structural fix: `writeResults` takes a *draft without a grade* plus a score context and computes `effective_grade` itself — no caller can ever persist a stale grade.

**Tech Stack:** TypeScript ESM (imports need `.js` suffixes), `js-yaml`, node `fs` sync APIs, vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-03-skill-check-framework-design.md` — "Data contracts" section. In scope: journal.jsonl, results schema 2, override rules, `label`, `suspect`, schema-1 read migration. Out of scope (later milestones): `env:`/sandboxing (M3), `reps:`/flakiness + full misfire *detector* (M4 — M2 only records the existing tripwire as a structured flag), UI journal console (M5). The spec's `turn` journal event is deferred with the misfire detector: the harness adapter returns one whole transcript, there is no per-turn stream yet.

**Repo / branch:** `~/prepos/skill-check`. Create branch `framework-v2-m2` off `main` at execution start. Working tree is clean.

## Global Constraints

- The CLI keeps working at every step: `npm run build && npm test` green at every commit.
- Schema-1 `results.yaml` files remain readable forever (read-only in-memory migration; never rewrite old files on read).
- No new npm dependencies.
- ESM: every relative import ends in `.js`. Sync `node:fs` APIs (matches the codebase).
- Run tests from repo root: `npx vitest run` (vitest workspace) or a single file via `npx vitest run packages/core/test/results.test.ts`.
- Build: `npm run build` (tsc -b project references) from repo root.
- One commit per task, message style `feat(core): …` / `feat: …` matching git log.

## File Structure

| File | Responsibility after M2 |
|---|---|
| `packages/core/src/results.ts` | schema-2 types, `finalizeResults` (the only grade computer), `migrateResults` (v1→v2 in memory), `applyOverride` (note-enforcing), `preserveTranscript`, managed results/.gitignore |
| `packages/core/src/journal.ts` (new) | `JournalEvent` union, `appendJournal`, `readJournal`, `journalPath` |
| `packages/core/src/grade.ts` | judge prompt/parse; `GradeResult.suspect` structured flag (reason stays clean) |
| `packages/core/src/run.ts` | orchestration + journal event emission; no grade math of its own |
| `packages/core/src/report.ts` | reads `effective_grade`; cells carry `suspect` |
| `packages/cli/src/cli.ts` | `--label` flag; `grade` command uses draft+context write |
| `packages/cli/src/serve.ts` | /save → applyOverride + writeResults + preserveTranscript + journal `override` event; 400 on missing note; returns `{port, close}` for tests |
| `assets/report.template.html` | save-error surfacing; suspect warning in panel |

**Carried M1 deferrals folded in:** vitest src-aliasing (Task 0), tripwire + /save recompute tests (Tasks 1 and 3), golden `min_pass<total` gating variant (Task 2). PR #1 finding "(4) /save mode-blind" is fixed by Tasks 2–3 (`/save` scores only green runs); "(5) tripwire false-positive" stays a recorded flag until the M4 detector.

---

### Task 0: vitest resolves workspace packages to src (M1 deferral)

Cross-package tests (`packages/cli/test/*`) import `@skill-check/core`, which resolves to `packages/core/dist` — so vitest silently tests **stale build output** unless a build ran first. Alias the workspace packages to their `src` entry points in the vitest workspace config. This must land first: Task 3 adds a cli test that imports core code changed in Task 2.

**Files:**
- Modify: `vitest.workspace.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `npx vitest run` exercises `packages/*/src` directly; no build needed before testing. All later tasks rely on this.

- [ ] **Step 1: Reproduce the staleness hazard**

```bash
rm -rf packages/core/dist packages/adapters/dist packages/cli/dist
npx vitest run
```

Expected: cli (and adapters) tests FAIL to resolve `@skill-check/core` / `@skill-check/adapters` — proof that tests currently depend on built dist.

- [ ] **Step 2: Alias packages to src in the workspace config**

Replace `vitest.workspace.ts` with:

```ts
import { defineWorkspace } from "vitest/config";
import { fileURLToPath } from "node:url";

// Tests must exercise src, not stale dist (M1 deferral): alias the workspace
// packages to their TypeScript entry points.
const alias = {
  "@skill-check/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
  "@skill-check/adapters": fileURLToPath(new URL("./packages/adapters/src/index.ts", import.meta.url)),
};

export default defineWorkspace(
  ["core", "adapters", "cli"].map((pkg) => ({
    test: { name: pkg, root: `packages/${pkg}` },
    resolve: { alias },
  }))
);
```

- [ ] **Step 3: Verify tests pass with no dist at all**

Run: `npx vitest run` (dist still deleted from Step 1)
Expected: all 47 tests PASS — resolution now hits src.

- [ ] **Step 4: Verify the build still works**

Run: `npm run build && npx vitest run`
Expected: build green, tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add vitest.workspace.ts
git commit -m "test: vitest aliases workspace packages to src so tests never hit stale dist"
```

---

### Task 1: Structured `suspect` flag (replace the reason-prefix tripwire)

The misfire tripwire currently smuggles itself into `judge_reason` as a `[suspect misfire: …]` prefix (`packages/core/src/grade.ts:80-84`). The spec wants `suspect` **recorded** as a flag. Make it a field on `GradeResult` and `ScenarioResult`; keep the reason clean.

**Files:**
- Modify: `packages/core/src/grade.ts:61-86`
- Modify: `packages/core/src/results.ts:7-13` (ScenarioResult)
- Modify: `packages/core/src/run.ts:52-83,122-138`
- Modify: `packages/core/src/report.ts:14,55-63`
- Modify: `assets/report.template.html` (panel only)
- Test: `packages/core/test/grade.test.ts` (extend)

**Interfaces:**
- Consumes: existing `gradeTranscript(adapter, judge, prompt, cwd)`, `ParsedVerdict`.
- Produces: `GradeResult extends ParsedVerdict { raw: string; suspect: boolean }`; `ScenarioResult` gains required `suspect: boolean`. Tasks 2 and 4 rely on `ScenarioResult.suspect` existing.

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/test/grade.test.ts` (add `gradeTranscript` to the existing import from `../src/grade.js`, and add the adapter-type import):

```ts
import { gradeTranscript } from "../src/grade.js";
import type { HarnessAdapter } from "../src/adapters/types.js";

function fakeJudge(raw: string): HarnessAdapter {
  return { name: "pi", available: async () => true, run: async () => "", judge: async () => raw };
}
const judgeRef = { provider: "claude-code", model: "opus" };

describe("gradeTranscript misfire tripwire → structured suspect flag", () => {
  test("FAIL verdict with zero failed items is suspect, reason stays clean", async () => {
    const r = await gradeTranscript(
      fakeJudge("1. PASS — greets\n2. PASS — polite\nVERDICT: FAIL\nREASON: overall weak"),
      judgeRef, "prompt", "/tmp"
    );
    expect(r.verdict).toBe("FAIL");
    expect(r.suspect).toBe(true);
    expect(r.reason).toBe("overall weak"); // no [suspect misfire…] prefix anymore
  });

  test("FAIL with a genuinely failed item is not suspect", async () => {
    const r = await gradeTranscript(
      fakeJudge("1. FAIL — rude\nVERDICT: FAIL\nREASON: no greeting"),
      judgeRef, "prompt", "/tmp"
    );
    expect(r.suspect).toBe(false);
  });

  test("PASS is never suspect", async () => {
    const r = await gradeTranscript(
      fakeJudge("1. PASS — ok\nVERDICT: PASS\nREASON: fine"),
      judgeRef, "prompt", "/tmp"
    );
    expect(r.suspect).toBe(false);
  });
});
```

Note: `describe`/`test`/`expect` are already imported at the top of the file.

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run packages/core/test/grade.test.ts`
Expected: 3 new tests FAIL (`suspect` is `undefined`; first test's reason has the prefix). Existing tests PASS.

- [ ] **Step 3: Implement in grade.ts**

In `packages/core/src/grade.ts`, replace the `GradeResult` interface and the misfire block inside `gradeTranscript`:

```ts
export interface GradeResult extends ParsedVerdict {
  raw: string;
  /** True when the verdict is FAIL but no per-item FAIL appears in the judge's
   * output — the observed ~2% misfire class. Recorded, never auto-passed. */
  suspect: boolean;
}
```

and replace lines 81–84 (the `parsed.reason = \`[suspect misfire…\`` block) with:

```ts
  const suspect = parsed.verdict === "FAIL" && !/fail/i.test(raw.replace(VERDICT_RE, ""));
  return { ...parsed, raw, suspect };
```

(Delete the old `return { ...parsed, raw };` line.)

- [ ] **Step 4: Record it in ScenarioResult and run.ts**

`packages/core/src/results.ts` — add the field to `ScenarioResult`:

```ts
export interface ScenarioResult {
  id: string;
  judge_verdict: Verdict;
  judge_reason: string;
  suspect: boolean; // judge-misfire tripwire fired (FAIL verdict, no failed item)
  override: Verdict | null; // author's call: null | PASS | FAIL (ERROR never used as override)
  note: string; // author's free-text note
}
```

`packages/core/src/run.ts` — inside the scenario loop, track suspect. Replace lines 60–80:

```ts
    let judge_verdict: ScenarioResult["judge_verdict"];
    let judge_reason: string;
    let suspect = false;

    if (gatePrefix) {
      // objective seeded gate failed → automatic FAIL, skip the judge
      judge_verdict = "FAIL";
      judge_reason = gatePrefix;
    } else {
      const prompt = buildJudgePrompt({
        skill: spec.skill,
        persona: spec.judge_persona,
        scenario,
        transcript,
      });
      const g = await gradeTranscript(adapter, judge, prompt, cwd);
      judge_verdict = g.verdict;
      judge_reason = g.reason;
      suspect = g.suspect;
    }

    log(`    → ${judge_verdict}${judge_reason ? `: ${judge_reason}` : ""}${suspect ? "  ⚠ suspect misfire" : ""}`);
    scenarioResults.push({ id: scenario.id, judge_verdict, judge_reason, suspect, override: null, note: "" });
```

In `formatScorecard` (`run.ts:128-133`), add the marker — replace the per-scenario line push with:

```ts
    const susp = s.suspect ? " ⚠suspect" : "";
    lines.push(`  ${mark} ${s.id}${ov}${susp}  ${s.judge_reason}`);
```

`packages/core/src/report.ts` — extend the cell type (line 14) and cell construction (lines 56–63):

```ts
  cells: Record<string, { judge_verdict: string; judge_reason: string; suspect: boolean; override: string | null; note: string }>;
```

```ts
        cells[s.id] = {
          judge_verdict: s.judge_verdict,
          judge_reason: s.judge_reason,
          suspect: s.suspect ?? false, // schema-1 files lack the field until Task 2's migration
          override: s.override,
          note: s.note,
        };
```

`assets/report.template.html` — in `openPanel`, directly after the `<div class="reason"><b>judge:</b> …</div>` line inside the `panel.innerHTML` template literal, add:

```js
    ${cell.suspect ? `<div class="reason" style="color:#b45309"><b>⚠ suspect:</b> judge listed no failed item — re-judge before trusting this FAIL</div>` : ""}
```

- [ ] **Step 5: Build + full test suite**

Run: `npm run build && npx vitest run`
Expected: build green; all tests PASS (golden test constructs verdicts via `runSkillModel`, which now sets `suspect`).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/grade.ts packages/core/src/results.ts packages/core/src/run.ts packages/core/src/report.ts assets/report.template.html packages/core/test/grade.test.ts
git commit -m "feat(core): structured suspect flag for judge misfires (replaces reason-prefix tripwire)"
```

---

### Task 2: results.yaml schema 2 — `effective_grade` computed at write time; schema-1 migration

The structural fix for the stale-grade bug class: callers hand `writeResults` a **draft with no grade**; `writeResults` computes `effective_grade` from `override ?? judge_verdict` via the one `finalizeResults` function. `readResults` migrates schema-1 files in memory.

**Files:**
- Modify: `packages/core/src/results.ts` (types, finalize, migrate, read/write)
- Modify: `packages/core/src/run.ts` (build draft; `label` option; drop local score math)
- Modify: `packages/core/src/report.ts:12,70` (`effective_grade`)
- Modify: `packages/cli/src/cli.ts:154-200` (cmdGrade)
- Modify: `packages/cli/src/serve.ts:74-103` (/save)
- Test: `packages/core/test/results.test.ts` (extend/adjust), `packages/core/test/golden-run.test.ts` (adjust)

**Interfaces:**
- Consumes: `score(verdicts, {shipBar, critical})` and `ScenarioVerdict` from `score.js`; `ShipBar` from `spec.js`; Task 1's `ScenarioResult.suspect`.
- Produces (later tasks and consumers rely on these exact names):

```ts
export interface ResultsFile {
  schema: 2;
  skill: string;
  harness: string;
  model: string;                       // provider:model token under test
  judge: { provider: string; model: string };
  timestamp: string;
  label: string | null;                // run label, e.g. "round-3"
  mode: string;                        // red | green | force
  effective_grade: GradeSummary;       // ALWAYS override-aware; only finalizeResults writes it
  scenarios: ScenarioResult[];
}
export type ResultsDraft = Omit<ResultsFile, "schema" | "effective_grade">;
export interface ScoreContext { shipBar: ShipBar; critical: string[] }
export function effectiveVerdicts(scenarios: ScenarioResult[]): ScenarioVerdict[];
export function finalizeResults(draft: ResultsDraft, ctx: ScoreContext | null): ResultsFile;
export function writeResults(runDir: string, draft: ResultsDraft, ctx: ScoreContext | null): ResultsFile; // returns the finalized file it wrote
export function migrateResults(raw: unknown): ResultsFile;
export function readResults(runDir: string): ResultsFile;   // migrates schema 1 in memory
```

- `runSkillModel` options gain `label?: string | null` (recorded in results; defaults to `null`).
- `GradeSummary` is unchanged. A `ResultsFile` value is assignable where a `ResultsDraft` is expected (extra properties are fine on non-literals), so `applyOverride`'s return feeds straight into `writeResults`.

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/results.test.ts`: update the `sample` fixture to schema 2 and add finalize/migrate coverage. Replace the `sample` const with:

```ts
import { finalizeResults, migrateResults, effectiveVerdicts, type ResultsDraft } from "../src/results.js";
import yaml from "js-yaml";

const draft: ResultsDraft = {
  skill: "ponytail",
  harness: "pi",
  model: "fireworks:accounts/fireworks/models/deepseek-v4-pro",
  judge: { provider: "anthropic", model: "claude-opus-4-8" },
  timestamp: "2026-06-25T14:03:00Z",
  label: "round-1",
  mode: "green",
  scenarios: [
    { id: "A1", judge_verdict: "PASS", judge_reason: "points to max", suspect: false, override: null, note: "" },
    { id: "C1", judge_verdict: "FAIL", judge_reason: "stripped guard", suspect: false, override: null, note: "" },
  ],
};
const ctx = { shipBar: { total: 2, min_pass: 2, no_critical_fail: true }, critical: ["C1"] };
const sample = finalizeResults(draft, ctx);
```

(Existing `applyOverride` tests keep working against `sample` — same `scenarios` shape.)

Add these describes:

```ts
describe("finalizeResults", () => {
  test("computes effective_grade from judge verdicts when no overrides", () => {
    const r = finalizeResults(draft, ctx);
    expect(r.schema).toBe(2);
    expect(r.effective_grade.passed).toBe(1);
    expect(r.effective_grade.ship).toBe(false); // C1 critical FAIL gates
    expect(r.effective_grade.note).toMatch(/critical/);
  });

  test("an override flips the effective grade — stale grades impossible", () => {
    const overridden = applyOverride(sample, "C1", "PASS", "false alarm, guard kept");
    const r = finalizeResults(overridden, ctx);
    expect(r.effective_grade.passed).toBe(2);
    expect(r.effective_grade.ship).toBe(true);
  });

  test("null context (red/force runs) → not-scored placeholder", () => {
    const r = finalizeResults({ ...draft, mode: "red" }, null);
    expect(r.effective_grade.letter).toBe("-");
    expect(r.effective_grade.note).toBe("mode=red (not scored)");
  });
});

describe("effectiveVerdicts", () => {
  test("override wins over judge verdict", () => {
    const vs = effectiveVerdicts(applyOverride(sample, "C1", "PASS", "why").scenarios);
    expect(vs).toEqual([
      { id: "A1", verdict: "PASS" },
      { id: "C1", verdict: "PASS" },
    ]);
  });
});

describe("schema-1 migration", () => {
  const v1yaml = `
skill: ponytail
harness: pi
model: fireworks:accounts/fireworks/models/deepseek-v4-pro
judge: { provider: anthropic, model: claude-opus-4-8 }
timestamp: 2026-06-25T14:03:00Z
grade: { passed: 1, total: 2, pct: 50, letter: F, ship: false, note: "gated: 1 critical fail" }
scenarios:
  - { id: A1, judge_verdict: PASS, judge_reason: points to max, override: null, note: "" }
  - { id: C1, judge_verdict: FAIL, judge_reason: "[suspect misfire: no failed item in judge output] stripped guard", override: null, note: "" }
`;

  test("migrates a v1 doc: grade→effective_grade, suspect lifted from reason prefix", () => {
    const r = migrateResults(yaml.load(v1yaml));
    expect(r.schema).toBe(2);
    expect(r.label).toBeNull();
    expect(r.mode).toBe("green");
    expect(r.effective_grade.pct).toBe(50);
    const c1 = r.scenarios.find((s) => s.id === "C1")!;
    expect(c1.suspect).toBe(true);
    expect(c1.judge_reason).toBe("stripped guard");
    expect(r.scenarios.find((s) => s.id === "A1")!.suspect).toBe(false);
  });

  test("infers mode from a v1 not-scored note", () => {
    const doc = yaml.load(v1yaml) as Record<string, unknown>;
    (doc.grade as Record<string, unknown>).note = "mode=red (not scored)";
    expect(migrateResults(doc).mode).toBe("red");
  });

  test("passes schema-2 docs through untouched", () => {
    expect(migrateResults(sample)).toEqual(sample);
  });
});
```

Update the round-trip describe to the new write signature and migration-on-read:

```ts
describe("writeResults / readResults round-trip", () => {
  test("writes results.yaml (computing effective_grade) and reads it back equal", () => {
    const dir = tmp();
    const written = writeResults(dir, draft, ctx);
    expect(existsSync(join(dir, "results.yaml"))).toBe(true);
    expect(readResults(dir)).toEqual(written);
    expect(written.effective_grade.passed).toBe(1);
  });

  test("readResults migrates a schema-1 file in memory", () => {
    const dir = tmp();
    const v1 = { skill: "x", harness: "pi", model: "m", judge: { provider: "p", model: "j" },
      timestamp: "t", grade: { passed: 0, total: 0, pct: 0, letter: "F", ship: false, note: "" }, scenarios: [] };
    writeFileSync(join(dir, "results.yaml"), yaml.dump(v1), "utf8");
    const r = readResults(dir);
    expect(r.schema).toBe(2);
    expect(r.effective_grade.letter).toBe("F");
  });
});
```

Add `writeFileSync` to the `node:fs` import at the top of the test file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/test/results.test.ts`
Expected: FAIL — `finalizeResults`/`migrateResults`/`effectiveVerdicts` not exported; type errors on `ResultsDraft`.

- [ ] **Step 3: Implement in results.ts**

Replace the `ResultsFile` interface and `writeResults`/`readResults` in `packages/core/src/results.ts` (keep `ScenarioResult`, `GradeSummary`, path helpers, `applyOverride`, gitignore code). New/changed code:

```ts
import { score, type ScenarioVerdict, type Verdict } from "./score.js";
import type { ShipBar } from "./spec.js";

export interface ResultsFile {
  schema: 2;
  skill: string;
  harness: string;
  model: string; // provider:model token under test
  judge: { provider: string; model: string };
  timestamp: string;
  label: string | null; // run label, e.g. "round-3" — ends timestamp-dir archaeology
  mode: string; // red | green | force
  effective_grade: GradeSummary; // always override-aware; only finalizeResults writes it
  scenarios: ScenarioResult[];
}

/** Everything a caller may set. The grade is computed, never supplied. */
export type ResultsDraft = Omit<ResultsFile, "schema" | "effective_grade">;

export interface ScoreContext {
  shipBar: ShipBar;
  critical: string[];
}

/** The verdict that counts: author override when present, else the judge's. */
export function effectiveVerdicts(scenarios: ScenarioResult[]): ScenarioVerdict[] {
  return scenarios.map((s) => ({ id: s.id, verdict: s.override ?? s.judge_verdict }));
}

/**
 * The ONLY place effective_grade is computed. Every writer goes through here,
 * so a persisted grade can never disagree with verdicts + overrides.
 * ctx is null for unscored (red/force) runs.
 */
export function finalizeResults(draft: ResultsDraft, ctx: ScoreContext | null): ResultsFile {
  let effective_grade: GradeSummary;
  if (ctx) {
    const s = score(effectiveVerdicts(draft.scenarios), { shipBar: ctx.shipBar, critical: ctx.critical });
    effective_grade = { passed: s.passed, total: s.total, pct: s.pct, letter: s.letter, ship: s.ship, note: s.note };
  } else {
    effective_grade = { passed: 0, total: 0, pct: 0, letter: "-", ship: false, note: `mode=${draft.mode} (not scored)` };
  }
  return {
    schema: 2,
    skill: draft.skill,
    harness: draft.harness,
    model: draft.model,
    judge: draft.judge,
    timestamp: draft.timestamp,
    label: draft.label,
    mode: draft.mode,
    effective_grade,
    scenarios: draft.scenarios,
  };
}

/** Finalize + persist results.yaml (creating the run dir). Returns what was written. */
export function writeResults(runDir: string, draft: ResultsDraft, ctx: ScoreContext | null): ResultsFile {
  const results = finalizeResults(draft, ctx);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(resultsPath(runDir), yaml.dump(results, { lineWidth: 100 }), "utf8");
  return results;
}

const SUSPECT_PREFIX_RE = /^\[suspect misfire[^\]]*\]\s*/;

/** Read-only schema-1 → schema-2 migration. Never rewrites the file on disk. */
export function migrateResults(raw: unknown): ResultsFile {
  const o = raw as Record<string, unknown>;
  if (o.schema === 2) return raw as ResultsFile;
  const v1 = raw as {
    skill: string; harness: string; model: string;
    judge: { provider: string; model: string };
    timestamp: string;
    grade: GradeSummary;
    scenarios: Array<Omit<ScenarioResult, "suspect">>;
  };
  const modeMatch = /^mode=(\w+)/.exec(v1.grade?.note ?? "");
  return {
    schema: 2,
    skill: v1.skill,
    harness: v1.harness,
    model: v1.model,
    judge: v1.judge,
    timestamp: v1.timestamp,
    label: null,
    mode: modeMatch ? modeMatch[1] : "green",
    // v1 grades may predate override-aware recompute; carried verbatim (read-only).
    // Every v2 WRITE recomputes, so staleness cannot propagate.
    effective_grade: v1.grade,
    scenarios: (v1.scenarios ?? []).map((s) => ({
      ...s,
      suspect: SUSPECT_PREFIX_RE.test(s.judge_reason),
      judge_reason: s.judge_reason.replace(SUSPECT_PREFIX_RE, ""),
    })),
  };
}

/** Read results.yaml from a run dir, migrating schema-1 files in memory. */
export function readResults(runDir: string): ResultsFile {
  const text = readFileSync(resultsPath(runDir), "utf8");
  return migrateResults(yaml.load(text));
}
```

Notes: the old `import type { Verdict } from "./score.js"` line is subsumed by the new import; `ScenarioResult`/`applyOverride` keep using `Verdict` unchanged.

- [ ] **Step 4: Update run.ts (draft + label, no local score math)**

In `packages/core/src/run.ts`:
- Add to `RunOptions`: `label?: string | null; // recorded in results.yaml (schema 2)`
- Delete the `verdicts` array, the `score` import/call, and the manual `results` construction (old lines 53, 82, 85–99). Replace the end of `runSkillModel` (everything after the scenario loop) with:

```ts
  const ctx = mode === "green" ? { shipBar: spec.ship_bar, critical: spec.critical } : null;
  const results = writeResults(runDir, {
    skill: spec.skill,
    harness: adapter.name,
    model: opts.modelToken,
    judge: { provider: judge.provider, model: judge.model },
    timestamp,
    label: opts.label ?? null,
    mode,
    scenarios: scenarioResults,
  }, ctx);
  return { runDir, results };
```

Also delete the now-unused `if (mode === "green") verdicts.push(…)` line inside the loop, and update the imports (drop `score, type ScenarioVerdict` and `type ResultsFile`; keep `type ScenarioResult`).

In `formatScorecard`, change `const g = results.grade;` → `const g = results.effective_grade;`.

- [ ] **Step 5: Update report.ts, cli.ts, serve.ts call sites**

`packages/core/src/report.ts`:
- Line 12: `grade: ResultsFile["grade"]` → `grade: ResultsFile["effective_grade"]`
- Line 70 (column construction): `grade: r.grade` → `grade: r.effective_grade`

`packages/cli/src/cli.ts` — rewrite the tail of `cmdGrade` (after the scenario loop, old lines 188–199); the local `score` computation goes away:

```ts
  const results = writeResults(runDir, {
    skill: spec.skill,
    harness: prev?.harness ?? "pi",
    model: prev?.model ?? "unknown",
    judge: { provider: judge.provider, model: judge.model },
    timestamp: nowIso(),
    label: prev?.label ?? null,
    mode: "green", // grade re-judges *.green.txt transcripts
    scenarios: scenarioResults,
  }, { shipBar: spec.ship_bar, critical: spec.critical });
  const g = results.effective_grade;
  console.log(`\n  re-graded with ${judge.provider}:${judge.model} → ${g.letter} (${g.pct}%) ${g.ship ? "SHIP" : "NOT READY"}`);
```

In the same function: the scenario loop's `scenarioResults.push({...})` gains `suspect: g.suspect,` (from Task 1's `gradeTranscript`), and the `verdicts` array + `score`/`ScenarioVerdict` imports are removed. Give `scenarioResults` an explicit type so the literal is checked: `const scenarioResults: ScenarioResult[] = [];` and add `type ScenarioResult` to the `@skill-check/core` import (drop `type ResultsFile` if now unused).

`packages/cli/src/serve.ts` — in the `/save` handler, replace the manual grade recompute (old lines 87–99) with:

```ts
        const results = readResults(column.runDir);
        const patched = applyOverride(results, body.scenarioId, body.override ?? null, body.note ?? "");
        // writeResults recomputes effective_grade override-aware against the CURRENT
        // spec's ship bar — a saved override can never leave a stale grade. Only
        // green runs are scored (PR #1 finding: /save must not grade red/force runs).
        const spec = loadSpec(join(opts.skillDir, "tests", "specification.yaml"));
        const ctx = patched.mode === "green" ? { shipBar: spec.ship_bar, critical: spec.critical } : null;
        writeResults(column.runDir, patched, ctx);
```

Drop the now-unused `score` and `type Verdict`… wait — `Verdict` is still used in the body type; keep `type Verdict`, drop `score` from the `@skill-check/core` import.

- [ ] **Step 6: Update the golden test**

`packages/core/test/golden-run.test.ts`: replace `results.grade` → `results.effective_grade` (3 places) and `persisted!.grade.pct` → `persisted!.effective_grade.pct`; add to the first test:

```ts
    expect(results.schema).toBe(2);
    expect(results.label).toBeNull();
    expect(results.mode).toBe("green");
```

Also add the M1-deferred gating variant that isolates the critical clause from `min_pass` (the existing gated test fails *all* scenarios, so `min_pass` alone explains NOT-READY). Add as a third test in the describe — a judge that fails only the critical scenario. Check the fixture first (`cat packages/core/test/fixtures/golden-skill/tests/specification.yaml`) for the critical scenario's id and checklist wording, and adapt the judge's routing condition to reliably fail exactly that one scenario (e.g. keying off text present only in that scenario's judge prompt):

```ts
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
```

Precondition to verify while writing it: the two fixture scenarios' `checklist[0]` strings differ (they do — otherwise pick any distinguishing prompt text). If the critical scenario's id starts with "B", the B-series clause would also gate — use the non-B critical scenario or assert the note mentions "critical" (as above) to pin which clause fired.

- [ ] **Step 7: Build + full suite**

Run: `npm run build && npx vitest run`
Expected: green. If report/serve template tests don't exist (they don't), a manual smoke is Task 5's job.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/results.ts packages/core/src/run.ts packages/core/src/report.ts packages/cli/src/cli.ts packages/cli/src/serve.ts packages/core/test/results.test.ts packages/core/test/golden-run.test.ts
git commit -m "feat(core): results.yaml schema 2 — effective_grade computed override-aware at write time; schema-1 read migration"
```

---

### Task 3: Override rules — note required, transcript auto-preserved

Spec: "overrides require a `note` and auto-preserve that scenario's transcript (un-gitignored) for auditability." Enforce in `applyOverride` (core, so every consumer gets it), preserve via a negation line in the managed `results/.gitignore`, surface the 400 in the review UI.

**Files:**
- Modify: `packages/core/src/results.ts` (applyOverride, ensureResultsGitignore, new preserveTranscript)
- Modify: `packages/cli/src/serve.ts` (/save: 400 + preserve; return `{port, close}`)
- Modify: `assets/report.template.html` (save error surfacing)
- Test: `packages/core/test/results.test.ts` (extend), Create: `packages/cli/test/serve.test.ts`

**Interfaces:**
- Consumes: Task 2's `writeResults(runDir, draft, ctx)`, `readResults`.
- Produces:
  - `applyOverride` throws `Error(/requires a note/)` when `override !== null` and `note.trim() === ""` (clearing an override never requires a note).
  - `preserveTranscript(resultsRoot: string, runDir: string, scenarioId: string): void` — appends `!<runDir-relative-to-resultsRoot>/<scenarioId>.<mode>.txt` to `resultsRoot/.gitignore`, idempotently.
  - `ensureResultsGitignore(resultsRoot)` now *manages* the file: if the existing content doesn't start with the managed body, it rewrites the body while keeping preservation lines (lines starting `!`, except `!results.yaml`).
  - `serveReview(opts): Promise<{ port: number; close: () => void }>`.

- [ ] **Step 1: Write the failing core tests**

Append to `packages/core/test/results.test.ts` (add `preserveTranscript` to the results.js import; `writeFileSync` already imported from Step 1 of Task 2; add `mkdirSync`):

Also update the **existing** `applyOverride` test `"throws for an unknown scenario id"`: it currently passes an empty note (`applyOverride(sample, "ZZ", "PASS", "")`), which after this task would trip the note check first and pass for the wrong reason. Change it to:

```ts
    expect(() => applyOverride(sample, "ZZ", "PASS", "some note")).toThrow(/ZZ/);
```

New describes:

```ts
describe("applyOverride requires a note", () => {
  test("throws when setting an override with an empty note", () => {
    expect(() => applyOverride(sample, "C1", "PASS", "")).toThrow(/requires a note/);
    expect(() => applyOverride(sample, "C1", "PASS", "   ")).toThrow(/requires a note/);
  });

  test("clearing an override needs no note", () => {
    const set = applyOverride(sample, "C1", "PASS", "why");
    expect(() => applyOverride(set, "C1", null, "")).not.toThrow();
  });
});

describe("preserveTranscript", () => {
  test("appends a gitignore negation for the scenario transcript, idempotently", () => {
    const root = tmp();
    const runDir = join(root, "pi-fake", "2026-07-03T00-00-00Z");
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, "C1.green.txt"), "transcript", "utf8");
    preserveTranscript(root, runDir, "C1");
    preserveTranscript(root, runDir, "C1"); // twice — must not duplicate
    const gi = readFileSync(join(root, ".gitignore"), "utf8");
    const line = "!pi-fake/2026-07-03T00-00-00Z/C1.green.txt";
    expect(gi.split("\n").filter((l) => l === line)).toHaveLength(1);
  });

  test("no transcript file → no-op", () => {
    const root = tmp();
    const runDir = join(root, "pi-fake", "ts");
    mkdirSync(runDir, { recursive: true });
    expect(() => preserveTranscript(root, runDir, "ZZ")).not.toThrow();
  });
});

describe("ensureResultsGitignore migration", () => {
  test("rewrites a stale body but keeps preservation lines", () => {
    const root = tmp();
    writeFileSync(join(root, ".gitignore"), "old body\n!results.yaml\n!pi-fake/ts/C1.green.txt\n", "utf8");
    ensureResultsGitignore(root);
    const gi = readFileSync(join(root, ".gitignore"), "utf8");
    expect(gi).toMatch(/^# skill-check:/); // managed header restored
    expect(gi).toContain("!pi-fake/ts/C1.green.txt"); // preservation kept
    expect(gi).not.toContain("old body");
  });

  test("is a no-op when the managed body is current", () => {
    const root = tmp();
    ensureResultsGitignore(root);
    const before = readFileSync(join(root, ".gitignore"), "utf8");
    ensureResultsGitignore(root);
    expect(readFileSync(join(root, ".gitignore"), "utf8")).toBe(before);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/core/test/results.test.ts`
Expected: FAIL — no note enforcement, `preserveTranscript` not exported, stale body untouched.

- [ ] **Step 3: Implement in results.ts**

Add imports: `readdirSync`, `appendFileSync` to the `node:fs` import; `relative` to the `node:path` import.

`applyOverride` — add at the top of the function:

```ts
  if (override !== null && note.trim() === "") {
    throw new Error(`override for \`${scenarioId}\` requires a note — say why the judge was wrong`);
  }
```

Replace `ensureResultsGitignore` and add `preserveTranscript`:

```ts
/**
 * Manage results/.gitignore: transcripts + reports ignored, results.yaml tracked.
 * Rewrites a stale managed body (so new ignore rules roll out) while keeping any
 * `!…` preservation lines added by preserveTranscript.
 */
export function ensureResultsGitignore(resultsRoot: string): void {
  mkdirSync(resultsRoot, { recursive: true });
  const giPath = join(resultsRoot, ".gitignore");
  const existing = existsSync(giPath) ? readFileSync(giPath, "utf8") : "";
  if (existing.startsWith(GITIGNORE_BODY)) return;
  const preserved = existing
    .split("\n")
    .filter((l) => l.startsWith("!") && l.trim() !== "!results.yaml");
  writeFileSync(giPath, GITIGNORE_BODY + preserved.map((l) => l + "\n").join(""), "utf8");
}

/**
 * Un-gitignore one scenario's transcript (audit trail for an override).
 * Appends `!<tag>/<ts>/<id>.<mode>.txt` to results/.gitignore, once.
 */
export function preserveTranscript(resultsRoot: string, runDir: string, scenarioId: string): void {
  const file = readdirSync(runDir).find((f) => f.startsWith(`${scenarioId}.`) && f.endsWith(".txt"));
  if (!file) return;
  ensureResultsGitignore(resultsRoot);
  const giPath = join(resultsRoot, ".gitignore");
  const line = `!${relative(resultsRoot, join(runDir, file))}`;
  if (!readFileSync(giPath, "utf8").split("\n").includes(line)) {
    appendFileSync(giPath, line + "\n", "utf8");
  }
}
```

(Gitignore semantics: later patterns win, so the `!…` lines override the `*.txt` ignore; parent dirs aren't ignored, so negation works.)

- [ ] **Step 4: Run core tests**

Run: `npx vitest run packages/core/test/results.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing server integration test**

Create `packages/cli/test/serve.test.ts`:

```ts
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeResults, readResults } from "@skill-check/core";
import { serveReview } from "../src/serve.js";

const SPEC = `
skill: golden
judge_persona: a friendly greeter judge.
ship_bar: { total: 1, min_pass: 1 }
critical: [A1]
scenarios:
  - id: A1
    title: says hello
    turns: ["Say hello."]
    checklist: ["greets the user"]
`;

let skillDir: string;
let runDir: string;
let base: string;
let close: () => void;

beforeAll(async () => {
  skillDir = mkdtempSync(join(tmpdir(), "sc-serve-"));
  mkdirSync(join(skillDir, "tests"), { recursive: true });
  writeFileSync(join(skillDir, "tests", "specification.yaml"), SPEC, "utf8");
  runDir = join(skillDir, "tests", "results", "pi-fake", "2026-07-03T00-00-00Z");
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, "A1.green.txt"), "USER: Say hello.\nASSISTANT: (silence)", "utf8");
  writeResults(runDir, {
    skill: "golden", harness: "pi", model: "fireworks:fake",
    judge: { provider: "claude-code", model: "opus" },
    timestamp: "2026-07-03T00:00:00Z", label: null, mode: "green",
    scenarios: [{ id: "A1", judge_verdict: "FAIL", judge_reason: "no greeting", suspect: false, override: null, note: "" }],
  }, { shipBar: { total: 1, min_pass: 1, no_critical_fail: true }, critical: ["A1"] });

  process.env.SKILL_CHECK_NO_OPEN = "1";
  const s = await serveReview({ skillDir, skillName: "golden", port: 0, open: false });
  base = `http://127.0.0.1:${s.port}`;
  close = s.close;
});

afterAll(() => {
  close?.();
  rmSync(skillDir, { recursive: true, force: true });
});

async function save(body: object) {
  return fetch(`${base}/save`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("review server /save override rules", () => {
  test("rejects an override without a note (400, error surfaced)", async () => {
    const r = await save({ col: 0, scenarioId: "A1", override: "PASS", note: "" });
    expect(r.status).toBe(400);
    const j = await r.json();
    expect(j.ok).toBe(false);
    expect(j.error).toMatch(/requires a note/);
    expect(readResults(runDir).scenarios[0].override).toBeNull(); // nothing persisted
  });

  test("accepts an override with a note; grade recomputed; transcript preserved", async () => {
    const r = await save({ col: 0, scenarioId: "A1", override: "PASS", note: "judge missed the greeting" });
    expect(r.status).toBe(200);
    const results = readResults(runDir);
    expect(results.scenarios[0].override).toBe("PASS");
    expect(results.effective_grade.ship).toBe(true); // recomputed override-aware
    const gi = readFileSync(join(skillDir, "tests", "results", ".gitignore"), "utf8");
    expect(gi).toContain("!pi-fake/2026-07-03T00-00-00Z/A1.green.txt");
  });
});
```

Run: `npx vitest run packages/cli/test/serve.test.ts`
Expected: FAIL — `serveReview` returns void (no `.port`), /save currently 500s (applyOverride throw is caught by the generic handler) instead of a clean 400, no preservation line.

- [ ] **Step 6: Implement in serve.ts**

Change the signature and tail of `serveReview`:

```ts
export interface ServeHandle {
  port: number;
  close: () => void;
}

export async function serveReview(opts: ServeOptions): Promise<ServeHandle> {
```

…and at the end (after the existing `tryOpen` line):

```ts
  return { port: port as number, close: () => server.close() };
```

In the `/save` handler, wrap the override application so a missing note is a clean 400 (add `applyOverride`… it's already imported; add `preserveTranscript` to the core import):

```ts
        const results = readResults(column.runDir);
        let patched: ResultsFile;
        try {
          patched = applyOverride(results, body.scenarioId, body.override ?? null, body.note ?? "");
        } catch (e) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
          return;
        }
        const spec = loadSpec(join(opts.skillDir, "tests", "specification.yaml"));
        const ctx = patched.mode === "green" ? { shipBar: spec.ship_bar, critical: spec.critical } : null;
        writeResults(column.runDir, patched, ctx);
        if (body.override != null) {
          preserveTranscript(join(opts.skillDir, "tests", "results"), column.runDir, body.scenarioId);
        }
```

- [ ] **Step 7: Surface the error in the template**

`assets/report.template.html` — replace the `save()` function:

```js
async function save(col, scenarioId, cell) {
  const s = document.getElementById("saved");
  try {
    const r = await fetch("/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ col: col.index, scenarioId, override: cell.override, note: cell.note }),
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      if (s) { s.textContent = body.error || "save failed"; s.classList.add("show", "err"); }
      return; // keep the local toggle so typing a note then retriggers save
    }
    if (s) { s.textContent = "saved ✓"; s.classList.remove("err"); s.classList.add("show"); setTimeout(() => s.classList.remove("show"), 1200); }
  } catch (e) { console.error("save failed", e); }
  render();
}
```

And in the `<style>` block, next to the existing `.saved` rule, add:

```css
.saved.err { color: #b91c1c; opacity: 1; }
```

(Find the `.saved` selector in the style block; add this rule immediately after it. The note-input debounce already re-calls `save`, so typing the note after a rejected toggle persists the override.)

- [ ] **Step 8: Full build + suite**

Run: `npm run build && npx vitest run`
Expected: green, including the new serve integration test.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/results.ts packages/core/test/results.test.ts packages/cli/src/serve.ts packages/cli/test/serve.test.ts assets/report.template.html
git commit -m "feat: overrides require a note and auto-preserve the scenario transcript (audit trail)"
```

---

### Task 4: journal.jsonl — machine-facing run event stream

One JSON object per line in `<runDir>/journal.jsonl`. Events for M2: `run-started`, `scenario-started`, `gate-result`, `judge-verdict`, `misfire-flag`, `score`, `override`. (`turn` deferred — the harness returns whole transcripts.) Journals are local machine artifacts: git-ignored via the managed results/.gitignore.

**Files:**
- Create: `packages/core/src/journal.ts`
- Modify: `packages/core/src/index.ts` (export), `packages/core/src/run.ts` (emit), `packages/core/src/results.ts` (GITIGNORE_BODY `*.jsonl`), `packages/cli/src/serve.ts` (override event)
- Test: Create `packages/core/test/journal.test.ts`; extend `packages/core/test/golden-run.test.ts` and `packages/cli/test/serve.test.ts`

**Interfaces:**
- Consumes: Task 2's `RunOptions`, `writeResults` return value; Task 3's serve /save flow.
- Produces (M5 trends/UI and M4 detector will read these):

```ts
export type JournalEvent =
  | { event: "run-started"; ts: string; skill: string; harness: string; model: string;
      judge: { provider: string; model: string }; mode: string; label: string | null }
  | { event: "scenario-started"; ts: string; id: string; title: string }
  | { event: "gate-result"; ts: string; id: string; ok: boolean; detail: string }
  | { event: "judge-verdict"; ts: string; id: string; verdict: Verdict; reason: string; suspect: boolean }
  | { event: "misfire-flag"; ts: string; id: string; reason: string }
  | { event: "score"; ts: string; passed: number; total: number; pct: number;
      letter: string; ship: boolean; note: string }
  | { event: "override"; ts: string; id: string; override: Verdict | null; note: string };
export function journalPath(runDir: string): string;             // <runDir>/journal.jsonl
export function appendJournal(runDir: string, e: JournalEvent): void;
export function readJournal(runDir: string): JournalEvent[];     // missing file → []; skips corrupt lines
```

- `RunOptions` gains `now?: () => string` (ISO timestamp source for journal events; defaults to `() => new Date().toISOString()` — injectable because core must run where wall-clock calls are restricted).

- [ ] **Step 1: Write the failing unit test**

Create `packages/core/test/journal.test.ts`:

```ts
import { describe, test, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendJournal, readJournal, journalPath, type JournalEvent } from "../src/journal.js";

const tmps: string[] = [];
function tmp() {
  const d = mkdtempSync(join(tmpdir(), "sc-journal-"));
  tmps.push(d);
  return d;
}
afterEach(() => {
  while (tmps.length) rmSync(tmps.pop()!, { recursive: true, force: true });
});

describe("journal append/read round-trip", () => {
  test("appends one JSON line per event and reads them back in order", () => {
    const dir = tmp();
    const e1: JournalEvent = { event: "scenario-started", ts: "t1", id: "A1", title: "hello" };
    const e2: JournalEvent = { event: "judge-verdict", ts: "t2", id: "A1", verdict: "PASS", reason: "ok", suspect: false };
    appendJournal(dir, e1);
    appendJournal(dir, e2);
    expect(readJournal(dir)).toEqual([e1, e2]);
  });

  test("missing journal → empty list", () => {
    expect(readJournal(tmp())).toEqual([]);
  });

  test("skips corrupt lines instead of throwing", () => {
    const dir = tmp();
    appendJournal(dir, { event: "scenario-started", ts: "t", id: "A1", title: "x" });
    appendFileSync(journalPath(dir), "not json\n", "utf8");
    appendJournal(dir, { event: "misfire-flag", ts: "t", id: "A1", reason: "r" });
    expect(readJournal(dir)).toHaveLength(2);
  });

  test("creates the run dir if needed", () => {
    const dir = join(tmp(), "does", "not", "exist");
    appendJournal(dir, { event: "scenario-started", ts: "t", id: "A1", title: "x" });
    expect(readJournal(dir)).toHaveLength(1);
  });
});
```

Run: `npx vitest run packages/core/test/journal.test.ts` — Expected: FAIL (module doesn't exist).

- [ ] **Step 2: Implement journal.ts**

Create `packages/core/src/journal.ts`:

```ts
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Verdict } from "./score.js";

/**
 * Machine-facing event stream for one run: one JSON object per line in
 * <runDir>/journal.jsonl. UI, trends, and debugging read ONLY this (never
 * scrape terminal output). `turn` events arrive with per-turn streaming (M4+).
 */
export type JournalEvent =
  | { event: "run-started"; ts: string; skill: string; harness: string; model: string;
      judge: { provider: string; model: string }; mode: string; label: string | null }
  | { event: "scenario-started"; ts: string; id: string; title: string }
  | { event: "gate-result"; ts: string; id: string; ok: boolean; detail: string }
  | { event: "judge-verdict"; ts: string; id: string; verdict: Verdict; reason: string; suspect: boolean }
  | { event: "misfire-flag"; ts: string; id: string; reason: string }
  | { event: "score"; ts: string; passed: number; total: number; pct: number;
      letter: string; ship: boolean; note: string }
  | { event: "override"; ts: string; id: string; override: Verdict | null; note: string };

export function journalPath(runDir: string): string {
  return join(runDir, "journal.jsonl");
}

export function appendJournal(runDir: string, e: JournalEvent): void {
  mkdirSync(runDir, { recursive: true });
  appendFileSync(journalPath(runDir), JSON.stringify(e) + "\n", "utf8");
}

/** Read all events; missing file → []. Corrupt lines are skipped, never fatal. */
export function readJournal(runDir: string): JournalEvent[] {
  const p = journalPath(runDir);
  if (!existsSync(p)) return [];
  const events: JournalEvent[] = [];
  for (const line of readFileSync(p, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as JournalEvent);
    } catch {
      /* tolerate a torn/corrupt line */
    }
  }
  return events;
}
```

Add `export * from "./journal.js";` to `packages/core/src/index.ts` (after the `results.js` line).

Run: `npx vitest run packages/core/test/journal.test.ts` — Expected: PASS.

- [ ] **Step 3: Ignore journals in git**

In `packages/core/src/results.ts`, update the managed body (Task 3's `ensureResultsGitignore` rolls this out to existing files automatically):

```ts
const GITIGNORE_BODY = `# skill-check: commit verdicts (results.yaml), ignore generated artifacts.
*.txt
*.jsonl
report.html
!results.yaml
`;
```

Add to the gitignore test in `packages/core/test/results.test.ts` (the `ensureResultsGitignore` describe):

```ts
    expect(gi).toMatch(/\*\.jsonl/);
```

- [ ] **Step 4: Emit events from run.ts (failing test first)**

Extend the first golden test in `packages/core/test/golden-run.test.ts` — add `readJournal` to the `../src/index.js` import, pass a deterministic clock, and assert the stream. Add `now: () => "2026-07-03T00:00:00.000Z",` to the `runSkillModel` options of the first test, then append at the end of the first test:

```ts
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
```

Check the fixture's actual skill name first: `grep '^skill:' packages/core/test/fixtures/golden-skill/tests/specification.yaml` — use that exact value in the `started.skill` expectation.

Run: `npx vitest run packages/core/test/golden-run.test.ts` — Expected: FAIL (no journal written).

- [ ] **Step 5: Wire the emission**

In `packages/core/src/run.ts`:
- Import: `import { appendJournal } from "./journal.js";`
- Add to `RunOptions`: `now?: () => string; // ISO clock for journal events (injectable — some hosts restrict wall-clock calls)`
- At the top of `runSkillModel` (after `const log = …`):

```ts
  const now = opts.now ?? (() => new Date().toISOString());
```

- After `ensureResultsGitignore(…)`:

```ts
  appendJournal(runDir, {
    event: "run-started", ts: now(),
    skill: spec.skill, harness: adapter.name, model: opts.modelToken,
    judge: { provider: judge.provider, model: judge.model },
    mode, label: opts.label ?? null,
  });
```

- At the top of the scenario loop (right after the `log(...)` line):

```ts
    appendJournal(runDir, { event: "scenario-started", ts: now(), id: scenario.id, title: scenario.title });
```

- After `produceTranscript` returns, for seeded scenarios only:

```ts
    if (scenario.mode === "seeded") {
      appendJournal(runDir, { event: "gate-result", ts: now(), id: scenario.id, ok: !gatePrefix, detail: gatePrefix ?? "" });
    }
```

- After the verdict is known (right after the `scenarioResults.push(...)` line):

```ts
    appendJournal(runDir, { event: "judge-verdict", ts: now(), id: scenario.id, verdict: judge_verdict, reason: judge_reason, suspect });
    if (suspect) {
      appendJournal(runDir, { event: "misfire-flag", ts: now(), id: scenario.id, reason: judge_reason });
    }
```

- After `writeResults` (green runs only):

```ts
  if (ctx) {
    const g = results.effective_grade;
    appendJournal(runDir, { event: "score", ts: now(), passed: g.passed, total: g.total, pct: g.pct, letter: g.letter, ship: g.ship, note: g.note });
  }
```

- [ ] **Step 6: Emit the override event from the review server**

`packages/cli/src/serve.ts` — add `appendJournal` to the `@skill-check/core` import; after the `preserveTranscript` call in `/save` (outside the `if`, so clearing an override is also journaled):

```ts
        appendJournal(column.runDir, {
          event: "override", ts: new Date().toISOString(),
          id: body.scenarioId, override: body.override ?? null, note: body.note ?? "",
        });
```

Extend `packages/cli/test/serve.test.ts` — add `readJournal` to the `@skill-check/core` import; in the accepting test, append:

```ts
    const overrides = readJournal(runDir).filter((e) => e.event === "override");
    expect(overrides).toHaveLength(1);
    expect(overrides[0]).toMatchObject({ id: "A1", override: "PASS", note: "judge missed the greeting" });
```

- [ ] **Step 7: Full build + suite**

Run: `npm run build && npx vitest run`
Expected: green.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/journal.ts packages/core/src/index.ts packages/core/src/run.ts packages/core/src/results.ts packages/cli/src/serve.ts packages/core/test/journal.test.ts packages/core/test/golden-run.test.ts packages/core/test/results.test.ts packages/cli/test/serve.test.ts
git commit -m "feat(core): journal.jsonl run event stream (run/scenario/gate/judge/misfire/score/override)"
```

---

### Task 5: CLI `--label`, help text, README, end-to-end verification

**Files:**
- Modify: `packages/cli/src/cli.ts` (run: `--label`; HELP)
- Modify: `README.md` (results schema 2, journal, override rules, `--label`)
- Test: `packages/core/test/golden-run.test.ts` (label pass-through)

**Interfaces:**
- Consumes: Task 2's `RunOptions.label`, `prev?.label` carry in cmdGrade (already done in Task 2).
- Produces: `skill-check run <skill> --label round-3` records the label in results.yaml + journal.

- [ ] **Step 1: Failing test for label pass-through**

In `packages/core/test/golden-run.test.ts` first test: add `label: "round-1",` to the `runSkillModel` options and change the label assertions:

```ts
    expect(results.label).toBe("round-1");
```

and in the journal assertions: `expect(started.label).toBe("round-1");`

Run: `npx vitest run packages/core/test/golden-run.test.ts` — Expected: FAIL only if Task 2 missed the plumb-through; if it passes immediately, that confirms the option works — proceed (the test still locks the behavior).

- [ ] **Step 2: Wire the CLI flag**

`packages/cli/src/cli.ts`, in `cmdRun`: after the `judge` line add:

```ts
  const label = flagStr(args, "label") || null;
```

and pass `label,` in the `runSkillModel({ … })` options object.

Update `HELP`:

```
  run    <skill|all> --skills <root> [--model prov:model ...] [--models file]
                     [--mode red|green|force] [--judge prov:model] [--harness pi] [--label name]
```

- [ ] **Step 3: README update**

In `README.md`, find the section that documents run outputs/results.yaml (grep for `results.yaml`) and update it to cover, in the repo's existing tone:
- results.yaml is now **schema 2**: `effective_grade` (always override-aware — recomputed on every write), `label`, `mode`, per-scenario `suspect`; schema-1 files remain readable.
- Overrides (review UI) **require a note** and automatically un-gitignore that scenario's transcript for the audit trail.
- Each run writes `journal.jsonl` (machine-facing event stream: run-started, scenario-started, gate-result, judge-verdict, misfire-flag, score, override) — git-ignored, read by upcoming trends/UI.
- `--label round-3` names a run so results stop being timestamp archaeology.

- [ ] **Step 4: End-to-end verification**

```bash
npm run build && npx vitest run
node bin/skill-check --help   # help shows --label
```

Additionally verify schema-1 compatibility against any committed v1 results.yaml on disk, if present:

```bash
find . -name results.yaml -not -path "*/node_modules/*" | head -3
```

For any found file (they predate M2, so they are schema 1), print the migrated grade:

```bash
node --input-type=module -e '
import { readResults } from "./packages/core/dist/index.js";
import { dirname } from "node:path";
console.log(readResults(dirname(process.argv[1])).effective_grade);
' <path-to-results.yaml>
```

Expected: prints the migrated grade object, no throw. (Skip if no v1 files exist on disk.)

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/cli.ts README.md packages/core/test/golden-run.test.ts
git commit -m "feat(cli): --label names a run; document results schema 2 + journal"
```

---

## Self-review (done at plan time)

- **Spec coverage:** journal.jsonl ✓ (Task 4; `turn` explicitly deferred), effective_grade structurally override-aware ✓ (Task 2), note-required + transcript-preserving overrides ✓ (Task 3), `label` ✓ (Tasks 2+5), judge identity ✓ (already in v1, carried), `suspect` recorded ✓ (Task 1), schema-1 read-only migration ✓ (Task 2). M3/M4/M5 items intentionally out.
- **Type consistency:** `ResultsDraft = Omit<ResultsFile, "schema" | "effective_grade">` used by run.ts/cli.ts/serve tests; `writeResults(runDir, draft, ctx) → ResultsFile` everywhere; `GradeResult.suspect` (Task 1) feeds `ScenarioResult.suspect` (Tasks 1–2) feeds `judge-verdict` journal events (Task 4).
- **Sequencing:** every task compiles and tests green on its own; Task 3's gitignore-managed rewrite lands before Task 4 relies on it to roll out `*.jsonl`.
