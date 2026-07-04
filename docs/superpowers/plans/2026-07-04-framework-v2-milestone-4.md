# skill-check v2 — Milestone 4: misfire detector + reps/flakiness

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the coarse M2 misfire tripwire with a precise per-checklist-item consistency check that blocks SHIP until resolved, and add `--reps N` so a scenario runs N times and yields a pass-rate + flakiness index — both opt-in, both reducing to today's behavior at N=1.

**Architecture:** All logic in `@skill-check/core`; CLI/UI stay thin. One new pure module (`reps.ts`, the rep-aggregation function); the misfire detector sharpens in `grade.ts`; `spec.ts` parses `reps`/`pass_threshold`; `score.ts` learns to exclude+gate on `suspect`; `run.ts` fans `scenario × rep` tasks through the existing M3 `runPool` and aggregates; results schema 2 gains optional reps fields.

**Tech Stack:** TypeScript ESM (relative imports end in `.js`), `js-yaml`, node sync `fs`, vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-04-skill-check-m4-misfire-reps-design.md`. Master roadmap: `docs/superpowers/specs/2026-07-03-skill-check-framework-design.md` (M4 row).

**Repo / branch:** `~/prepos/skill-check`, branch `framework-v2-m4` (created; design doc committed as `da9fa9e`). `main` has M1–M3. Baseline: 105 tests.

## Global Constraints

- `npm run build && npx vitest run` green at every commit (run from repo root). No new npm dependencies.
- ESM: every relative import ends in `.js`. Sync `node:fs`.
- TDD: failing test first, watched fail for the right reason, then implement.
- Opt-in: `--reps` defaults to `1` and `--pass-threshold` to `0.5`; at N=1 a non-suspect run's `results.yaml` is **byte-identical** to M3 (no reps fields emitted for N=1).
- The one intended default-path behavior change: a `suspect` scenario now blocks SHIP (M2 only flagged it).
- Detector is **fail-open**: unparseable per-item grades ⇒ `suspect = false`, never block a run.
- One commit per task, message style `feat(core): …` / `feat(cli): …`.

## File Structure

| File | Responsibility after M4 |
|---|---|
| `packages/core/src/grade.ts` | `detectMisfire(raw, verdict)` — per-item parse + `verdict == AND(items)` check; `gradeTranscript` uses it |
| `packages/core/src/reps.ts` (new) | `aggregateReps(outcomes, threshold)` — collapse N rep outcomes into a verdict + pass-rate + flakiness + suspect |
| `packages/core/src/spec.ts` | parse/validate per-scenario `reps` + `pass_threshold` |
| `packages/core/src/score.ts` | exclude `suspect` from pass/total; gate SHIP on `suspectCount === 0` |
| `packages/core/src/results.ts` | `ScenarioResult` optional `reps`/`passes`/`flakiness`; `effectiveVerdicts` carries `suspect && !override`; `transcriptPath` optional rep suffix |
| `packages/core/src/run.ts` | `scenario × rep` tasks → `runPool` → `aggregateReps`; `reps`/`passThreshold` options; per-rep journal events |
| `packages/core/src/journal.ts` | optional `rep?` on `judge-verdict`/`misfire-flag`/`gate-result` |
| `packages/cli/src/cli.ts` | `--reps N`, `--pass-threshold T` |
| `packages/core/src/report.ts` + `assets/report.template.html` | surface reps/flakiness; suspect-block in the matrix |
| `README.md` | document `--reps` / `--pass-threshold` / `reps:` / `pass_threshold:` |

---

### Task 1: Sharpen the misfire detector (`grade.ts`)

**Files:**
- Modify: `packages/core/src/grade.ts`
- Test: `packages/core/test/grade.test.ts` (extend)

**Interfaces:**
- Consumes: `Verdict` from `score.js`.
- Produces: `export function detectMisfire(raw: string, verdict: Verdict): boolean`. `gradeTranscript` sets `suspect = detectMisfire(raw, parsed.verdict)`. `GradeResult.suspect` type unchanged (`boolean`). Task 5 relies on `gradeTranscript` still returning `{verdict, reason, raw, suspect}`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/test/grade.test.ts` (the file already imports `describe/test/expect`; add `detectMisfire` to the existing `../src/grade.js` import and add `gradeTranscript`'s helper if not present):

```ts
import { detectMisfire } from "../src/grade.js";

describe("detectMisfire (per-item vs verdict)", () => {
  const items = (lines: string[], verdictLine: string) => [...lines, verdictLine].join("\n");

  test("agreeing PASS (all items PASS, verdict PASS) is not suspect", () => {
    expect(detectMisfire(items(["1. PASS — ok", "2. PASS — ok"], "VERDICT: PASS"), "PASS")).toBe(false);
  });

  test("agreeing FAIL (an item FAILs, verdict FAIL) is not suspect", () => {
    expect(detectMisfire(items(["1. PASS — ok", "2. FAIL — nope"], "VERDICT: FAIL"), "FAIL")).toBe(false);
  });

  test("false-fail: all items PASS but verdict FAIL → suspect (the observed class)", () => {
    expect(detectMisfire(items(["1. PASS — ok", "2. PASS — ok"], "VERDICT: FAIL"), "FAIL")).toBe(true);
  });

  test("false-pass: an item FAILs but verdict PASS → suspect", () => {
    expect(detectMisfire(items(["1. PASS — ok", "2. FAIL — nope"], "VERDICT: PASS"), "PASS")).toBe(true);
  });

  test("unparseable items → fail-open (not suspect)", () => {
    expect(detectMisfire("the judge rambled\nVERDICT: FAIL", "FAIL")).toBe(false);
  });

  test("ERROR verdict is never suspect, even with parsed all-pass items", () => {
    expect(detectMisfire(items(["1. PASS — ok"], "garbage"), "ERROR")).toBe(false);
  });

  test("tolerates ) and lowercase: '1) pass' counts as an item", () => {
    expect(detectMisfire(items(["1) pass — ok", "2) pass — ok"], "VERDICT: FAIL"), "FAIL")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/core/test/grade.test.ts`
Expected: FAIL — `detectMisfire` is not exported.

- [ ] **Step 3: Implement in `grade.ts`**

Add the exported detector (place it just above `gradeTranscript`):

```ts
const ITEM_RE = /^\s*\d+[.)]\s*\**\s*(PASS|FAIL)\b/gim;

/**
 * Judge-misfire detector: parse the judge's per-checklist-item grades and assert
 * the overall verdict equals AND(items). A mismatch in EITHER direction — verdict
 * PASS with a FAILed item (false-pass), or verdict FAIL with every item PASSing
 * (the observed ~2% false-fail class) — is a misfire. Fail-open: if no item lines
 * parse, or the verdict is ERROR, return false (never block a run on a parse miss).
 */
export function detectMisfire(raw: string, verdict: Verdict): boolean {
  if (verdict === "ERROR") return false;
  const items = [...raw.matchAll(ITEM_RE)].map((m) => m[1].toUpperCase() === "PASS");
  if (items.length === 0) return false; // fail-open
  const andItems = items.every((ok) => ok);
  const verdictBool = verdict === "PASS";
  return verdictBool !== andItems;
}
```

Replace the old tripwire line in `gradeTranscript`. Change:

```ts
  const suspect = parsed.verdict === "FAIL" && !/fail/i.test(raw.replace(VERDICT_RE, ""));
```

to:

```ts
  const suspect = detectMisfire(raw, parsed.verdict);
```

Update `GradeResult.suspect`'s doc comment to: `/** Judge misfire: the overall verdict disagrees with AND(per-item grades). Recorded, never auto-passed; blocks SHIP until re-judged or overridden. */`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/core/test/grade.test.ts`
Expected: PASS (existing + 7 new). Note: an existing grade test may assert the *old* tripwire's behavior on a specific string — if one breaks because the new detector is more precise, update that assertion to match the sharper rule (a FAIL verdict with a genuinely-parsed FAIL item is now correctly *not* suspect); do not weaken the new tests.

- [ ] **Step 5: Build + full suite + commit**

Run: `npm run build && npx vitest run`
Expected: green.

```bash
git add packages/core/src/grade.ts packages/core/test/grade.test.ts
git commit -m "feat(core): precise per-item misfire detector (verdict == AND(items), fail-open)"
```

---

### Task 2: Rep aggregation (`reps.ts`)

**Files:**
- Create: `packages/core/src/reps.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/reps.test.ts` (new)

**Interfaces:**
- Consumes: `Verdict` from `score.js`.
- Produces:
  ```ts
  export interface RepOutcome { verdict: Verdict; reason: string; suspect: boolean; }
  export interface RepAggregate { verdict: Verdict; reason: string; passes: number; reps: number; flakiness: number; suspect: boolean; }
  export function aggregateReps(outcomes: RepOutcome[], threshold: number): RepAggregate;
  ```
  Task 5 calls `aggregateReps(outcomesForScenario, threshold)`.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/reps.test.ts`:

```ts
import { describe, test, expect } from "vitest";
import { aggregateReps, type RepOutcome } from "../src/reps.js";

const pass = (): RepOutcome => ({ verdict: "PASS", reason: "ok", suspect: false });
const fail = (): RepOutcome => ({ verdict: "FAIL", reason: "nope", suspect: false });
const susp = (): RepOutcome => ({ verdict: "FAIL", reason: "misfire", suspect: true });

describe("aggregateReps", () => {
  test("single clean PASS → PASS, no reps inflation of flakiness", () => {
    const a = aggregateReps([pass()], 0.5);
    expect(a).toMatchObject({ verdict: "PASS", passes: 1, reps: 1, flakiness: 0, suspect: false });
    expect(a.reason).toBe("ok"); // N=1 keeps the rep's own reason
  });

  test("single clean FAIL → FAIL", () => {
    expect(aggregateReps([fail()], 0.5)).toMatchObject({ verdict: "FAIL", passes: 0, flakiness: 0, suspect: false });
  });

  test("majority pass at default 0.5 → PASS with flakiness", () => {
    const a = aggregateReps([pass(), pass(), pass(), fail(), fail()], 0.5); // 3/5 = 0.6
    expect(a.verdict).toBe("PASS");
    expect(a.passes).toBe(3);
    expect(a.reps).toBe(5);
    expect(a.flakiness).toBeCloseTo(1 - Math.abs(2 * 0.6 - 1), 5); // 0.8
    expect(a.reason).toMatch(/3\/5/);
  });

  test("even split passes at default 0.5 (ties pass)", () => {
    expect(aggregateReps([pass(), pass(), fail(), fail()], 0.5).verdict).toBe("PASS"); // 2/4 = 0.5 >= 0.5
  });

  test("custom threshold 0.8 rejects 3/5", () => {
    expect(aggregateReps([pass(), pass(), pass(), fail(), fail()], 0.8).verdict).toBe("FAIL");
  });

  test("fewer than half clean → suspect (excluded verdict is FAIL placeholder)", () => {
    const a = aggregateReps([susp(), susp(), susp(), pass(), pass()], 0.5); // 2 clean of 5
    expect(a.suspect).toBe(true);
    expect(a.verdict).toBe("FAIL");
    expect(a.reason).toMatch(/misfired/);
  });

  test("minority suspect → not suspect; pass-rate over clean reps only", () => {
    const a = aggregateReps([susp(), pass(), pass(), pass(), fail()], 0.5); // 4 clean, 3 pass → 0.75
    expect(a.suspect).toBe(false);
    expect(a.verdict).toBe("PASS");
    expect(a.passes).toBe(3);
  });

  test("all suspect → suspect", () => {
    expect(aggregateReps([susp(), susp()], 0.5)).toMatchObject({ suspect: true, verdict: "FAIL" });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/core/test/reps.test.ts`
Expected: FAIL — `../src/reps.js` does not exist.

- [ ] **Step 3: Implement `reps.ts`**

Create `packages/core/src/reps.ts`:

```ts
import type { Verdict } from "./score.js";

/** One rep's outcome (subject run + judge). */
export interface RepOutcome {
  verdict: Verdict;
  reason: string;
  suspect: boolean;
}

/** A scenario's aggregated result over N reps. */
export interface RepAggregate {
  verdict: Verdict;
  reason: string;
  passes: number; // PASSes among the clean (non-misfired) reps
  reps: number; // N
  flakiness: number; // 0 = unanimous, 1 = even split; over clean reps
  suspect: boolean; // fewer than half the reps were clean
}

/**
 * Collapse N rep outcomes into one scenario verdict. A rep is "clean" when its
 * judge did not misfire. If fewer than half the reps are clean the scenario is
 * `suspect` (its verdict is untrustworthy). Otherwise the pass-rate is computed
 * over the clean reps and the scenario PASSes at `pass_rate >= threshold`
 * (default caller threshold 0.5, ties pass). Flakiness = 1 - |2·pass_rate - 1|.
 */
export function aggregateReps(outcomes: RepOutcome[], threshold: number): RepAggregate {
  const reps = outcomes.length;
  const clean = outcomes.filter((o) => !o.suspect);
  const passes = clean.filter((o) => o.verdict === "PASS").length;

  if (clean.length * 2 < reps) {
    // majority of reps misfired → untrustworthy
    return { verdict: "FAIL", reason: `${reps - clean.length}/${reps} reps misfired — re-judge`, passes, reps, flakiness: 0, suspect: true };
  }

  const passRate = passes / clean.length;
  const verdict: Verdict = passRate >= threshold ? "PASS" : "FAIL";
  const flakiness = 1 - Math.abs(2 * passRate - 1);
  const reason = reps === 1 ? outcomes[0].reason : `${passes}/${clean.length} reps passed (flaky ${flakiness.toFixed(2)})`;
  return { verdict, reason, passes, reps, flakiness, suspect: false };
}
```

Add `export * from "./reps.js";` to `packages/core/src/index.ts` (after the `./scheduler.js` line).

- [ ] **Step 4: Run tests + build + full suite + commit**

Run: `npx vitest run packages/core/test/reps.test.ts` → PASS (8).
Run: `npm run build && npx vitest run` → green.

```bash
git add packages/core/src/reps.ts packages/core/src/index.ts packages/core/test/reps.test.ts
git commit -m "feat(core): aggregateReps — pass-rate + flakiness + suspect over N reps"
```

---

### Task 3: Parse per-scenario `reps` + `pass_threshold` (`spec.ts`)

**Files:**
- Modify: `packages/core/src/spec.ts`
- Test: `packages/core/test/spec.test.ts` (extend)

**Interfaces:**
- Produces: `Scenario` gains `reps?: number` and `passThreshold?: number` (undefined when absent). Task 5 reads `scenario.reps` / `scenario.passThreshold`.

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/spec.test.ts`, add a describe (reuse the existing `parseSpec` import; use a `base(extra)` helper like the env tests, or inline full specs):

```ts
describe("reps + pass_threshold parsing", () => {
  const base = (extra: string) => `
skill: demo
judge_persona: a judge.
ship_bar: { total: 1, min_pass: 1 }
scenarios:
  - id: A1
    title: t
    turns: ["hi"]
    checklist: ["ok"]
${extra}`;

  test("absent → undefined", () => {
    const s = parseSpec(base(""), "spec.yaml").scenarios[0];
    expect(s.reps).toBeUndefined();
    expect(s.passThreshold).toBeUndefined();
  });

  test("parses reps and pass_threshold", () => {
    const s = parseSpec(base("    reps: 5\n    pass_threshold: 0.8\n"), "spec.yaml").scenarios[0];
    expect(s.reps).toBe(5);
    expect(s.passThreshold).toBe(0.8);
  });

  test("rejects non-positive-integer reps", () => {
    expect(() => parseSpec(base("    reps: 0\n"), "spec.yaml")).toThrow(/reps/);
    expect(() => parseSpec(base("    reps: 2.5\n"), "spec.yaml")).toThrow(/reps/);
  });

  test("rejects pass_threshold outside 0..1", () => {
    expect(() => parseSpec(base("    pass_threshold: 1.5\n"), "spec.yaml")).toThrow(/pass_threshold/);
    expect(() => parseSpec(base("    pass_threshold: -0.1\n"), "spec.yaml")).toThrow(/pass_threshold/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/core/test/spec.test.ts`
Expected: FAIL — fields undefined / no validation throw.

- [ ] **Step 3: Implement in `spec.ts`**

Add to the `Scenario` interface (after `workspace`):

```ts
  reps?: number; // run this scenario N times (overrides --reps); positive integer
  passThreshold?: number; // pass if pass-rate >= this (overrides --pass-threshold); 0..1
```

In `parseSpec`, inside the per-scenario map (after the `workspace` assignment, before `return scenario;`), add validation + assignment:

```ts
    if (s.reps !== undefined) {
      if (typeof s.reps !== "number" || !Number.isInteger(s.reps) || s.reps < 1) {
        throw new SpecError(`scenario \`${id}\` \`reps\` must be a positive integer`, file);
      }
      scenario.reps = s.reps;
    }
    if (s.pass_threshold !== undefined) {
      if (typeof s.pass_threshold !== "number" || s.pass_threshold < 0 || s.pass_threshold > 1) {
        throw new SpecError(`scenario \`${id}\` \`pass_threshold\` must be a number in [0, 1]`, file);
      }
      scenario.passThreshold = s.pass_threshold;
    }
```

(YAML key is `pass_threshold`; the parsed field is `passThreshold` — matching the `no_critical_fail`→`no_critical_fail` snake-case-in-YAML convention already used for ship_bar. The `Scenario` literal does not need these keys since they're optional.)

- [ ] **Step 4: Run tests + build + full suite + commit**

Run: `npx vitest run packages/core/test/spec.test.ts` → PASS.
Run: `npm run build && npx vitest run` → green.

```bash
git add packages/core/src/spec.ts packages/core/test/spec.test.ts
git commit -m "feat(core): parse per-scenario reps + pass_threshold"
```

---

### Task 4: Suspect-aware scoring (`score.ts` + `results.ts`)

**Files:**
- Modify: `packages/core/src/score.ts`, `packages/core/src/results.ts`
- Test: `packages/core/test/score.test.ts`, `packages/core/test/results.test.ts` (extend)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `ScenarioVerdict` gains `suspect?: boolean`.
  - `ScoreResult` gains `suspectCount: number`.
  - `score` excludes suspect verdicts from `passed`/`total` and requires `suspectCount === 0` for `ship`.
  - `ScenarioResult` gains optional `reps?: number`, `passes?: number`, `flakiness?: number`.
  - `effectiveVerdicts` returns `{ id, verdict, suspect: s.suspect && s.override == null }`.
  - `transcriptPath(runDir, id, mode, rep?)` — optional rep suffix. Task 5 relies on all of these.

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/score.test.ts` add (reuse the existing `score` import; check the existing `ShipBar` fixture shape and mirror it):

```ts
describe("suspect scoring", () => {
  const bar = { total: 2, min_pass: 2, no_critical_fail: true };

  test("suspect verdict is excluded from passed and total", () => {
    const r = score(
      [
        { id: "A1", verdict: "PASS" },
        { id: "A2", verdict: "PASS" },
        { id: "A3", verdict: "FAIL", suspect: true },
      ],
      { shipBar: bar, critical: [] }
    );
    expect(r.total).toBe(2); // A3 excluded
    expect(r.passed).toBe(2);
    expect(r.suspectCount).toBe(1);
  });

  test("any suspect blocks ship and notes it", () => {
    const r = score(
      [
        { id: "A1", verdict: "PASS" },
        { id: "A2", verdict: "PASS" },
        { id: "A3", verdict: "PASS", suspect: true },
      ],
      { shipBar: bar, critical: [] }
    );
    expect(r.ship).toBe(false);
    expect(r.note).toMatch(/suspect/);
  });

  test("no suspects → suspectCount 0, unchanged behavior", () => {
    const r = score([{ id: "A1", verdict: "PASS" }, { id: "A2", verdict: "PASS" }], { shipBar: bar, critical: [] });
    expect(r.suspectCount).toBe(0);
    expect(r.ship).toBe(true);
  });
});
```

In `packages/core/test/results.test.ts` add (reuse existing `finalizeResults`/`applyOverride` imports + the `draft`/`ctx` fixtures from earlier tests):

```ts
describe("effectiveVerdicts + finalizeResults with suspect", () => {
  test("effectiveVerdicts marks suspect only when unresolved (no override)", () => {
    const scenarios = [
      { id: "A1", judge_verdict: "PASS", judge_reason: "", suspect: false, override: null, note: "" },
      { id: "A2", judge_verdict: "FAIL", judge_reason: "", suspect: true, override: null, note: "" },
      { id: "A3", judge_verdict: "FAIL", judge_reason: "", suspect: true, override: "PASS", note: "resolved" },
    ] as const;
    const vs = effectiveVerdicts(scenarios as any);
    expect(vs.find((v) => v.id === "A2")!.suspect).toBe(true);
    expect(vs.find((v) => v.id === "A3")!.suspect).toBeFalsy(); // override resolves it
    expect(vs.find((v) => v.id === "A3")!.verdict).toBe("PASS");
  });

  test("an unresolved suspect blocks ship; an override resolves it", () => {
    const susDraft = {
      ...draft,
      scenarios: [
        { id: "A1", judge_verdict: "PASS", judge_reason: "", suspect: false, override: null, note: "" },
        { id: "C1", judge_verdict: "FAIL", judge_reason: "", suspect: true, override: null, note: "" },
      ],
    };
    expect(finalizeResults(susDraft, ctx).effective_grade.ship).toBe(false);
    const resolved = applyOverride(finalizeResults(susDraft, ctx), "C1", "PASS", "looked, judge misfired");
    expect(finalizeResults(resolved, ctx).effective_grade.ship).toBe(true);
  });
});
```

(If the `draft` fixture's ship_bar in `ctx` requires 2 passes, ensure the resolved case yields 2 passes — adjust the sample verdicts so the asserted ship transition holds; keep the assertion, fix the fixture numbers.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/core/test/score.test.ts packages/core/test/results.test.ts`
Expected: FAIL — `suspect` ignored; `suspectCount` undefined.

- [ ] **Step 3: Implement in `score.ts`**

Extend `ScenarioVerdict` and `ScoreResult`:

```ts
export interface ScenarioVerdict {
  id: string;
  verdict: Verdict;
  suspect?: boolean; // misfire unresolved by an override — excluded + blocks ship
}
```

```ts
export interface ScoreResult {
  passed: number;
  total: number;
  pct: number;
  letter: string;
  ship: boolean;
  criticalFails: number;
  bSeriesFails: number;
  suspectCount: number;
  note: string;
}
```

Rewrite the loop + ship + note in `score`:

```ts
  const { shipBar, critical } = input;
  let passed = 0;
  let total = 0;
  let criticalFails = 0;
  let bSeriesFails = 0;
  let suspectCount = 0;

  for (const v of verdicts) {
    if (v.suspect) { suspectCount++; continue; } // untrustworthy: neither pass nor fail
    total++;
    if (v.verdict === "PASS") { passed++; continue; }
    if (critical.includes(v.id)) criticalFails++;
    if (/^B/i.test(v.id)) bSeriesFails++;
  }

  const pct = total > 0 ? Math.round((passed * 100) / total) : 0;
  const letter = letterFor(pct);

  const ship =
    total >= shipBar.total &&
    passed >= shipBar.min_pass &&
    (!shipBar.no_critical_fail || criticalFails === 0) &&
    bSeriesFails === 0 &&
    suspectCount === 0;

  let note = "";
  if (suspectCount > 0) {
    note = `${suspectCount} suspect: re-judge/resolve`;
  } else if (criticalFails > 0) {
    note = `gated: ${criticalFails} critical fail${criticalFails === 1 ? "" : "s"}`;
  } else if (bSeriesFails > 0) {
    note = `gated: ${bSeriesFails} B-series fail${bSeriesFails === 1 ? "" : "s"}`;
  }

  return { passed, total, pct, letter, ship, criticalFails, bSeriesFails, suspectCount, note };
```

(Update the `score` JSDoc to mention suspect exclusion + the suspect gate.)

- [ ] **Step 4: Implement in `results.ts`**

`ScenarioResult` — add the optional reps fields (after `suspect`):

```ts
  suspect: boolean; // judge misfire (verdict disagrees with AND(items)); majority-misfired over reps
  reps?: number; // number of reps run (omitted / 1 for a single run)
  passes?: number; // PASSes among clean reps (reps runs only)
  flakiness?: number; // 0 = unanimous, 1 = even split (reps runs only)
```

`effectiveVerdicts` — carry the unresolved-suspect flag:

```ts
export function effectiveVerdicts(scenarios: ScenarioResult[]): ScenarioVerdict[] {
  return scenarios.map((s) => ({
    id: s.id,
    verdict: s.override ?? s.judge_verdict,
    suspect: s.suspect && s.override == null, // an override resolves the misfire
  }));
}
```

`transcriptPath` — optional rep suffix:

```ts
/** Path of a transcript file within a run dir. A rep index (for --reps N>1) is suffixed. */
export function transcriptPath(runDir: string, scenarioId: string, mode: string, rep?: number): string {
  const base = rep === undefined ? `${scenarioId}.${mode}` : `${scenarioId}.${mode}.rep${rep}`;
  return join(runDir, `${base}.txt`);
}
```

- [ ] **Step 5: Run tests + build + full suite + commit**

Run: `npx vitest run packages/core/test/score.test.ts packages/core/test/results.test.ts` → PASS.
Run: `npm run build && npx vitest run` → green (the golden N=1 test still passes: no suspects ⇒ `suspectCount 0` ⇒ identical grade; `ScenarioResult` reps fields are optional and unset).

```bash
git add packages/core/src/score.ts packages/core/src/results.ts packages/core/test/score.test.ts packages/core/test/results.test.ts
git commit -m "feat(core): suspect excluded from scoring + blocks ship (override resolves); reps result fields"
```

---

### Task 5: Reps loop + aggregation in `run.ts`

Fan `scenario × rep` tasks through the M3 pool, aggregate per scenario, emit per-rep journal events.

**Files:**
- Modify: `packages/core/src/run.ts`, `packages/core/src/journal.ts`
- Test: `packages/core/test/golden-run.test.ts` (extend), `packages/core/test/journal.test.ts` (extend if needed)

**Interfaces:**
- Consumes: `aggregateReps`/`RepOutcome` (Task 2), suspect-aware `finalizeResults` (Task 4), `transcriptPath(…, rep?)` (Task 4), `runPool` (M3).
- Produces: `RunOptions` gains `reps?: number` (default 1) and `passThreshold?: number` (default 0.5). Task 6 (CLI) passes them.

- [ ] **Step 1: Extend the journal event types**

In `packages/core/src/journal.ts`, add an optional `rep?: number` to the `judge-verdict`, `misfire-flag`, and `gate-result` event variants (1-based rep index; omitted for N=1). E.g. the `judge-verdict` variant becomes:

```ts
  | { event: "judge-verdict"; ts: string; id: string; verdict: Verdict; reason: string; suspect: boolean; rep?: number }
```

and likewise add `rep?: number` to `misfire-flag` and `gate-result`.

- [ ] **Step 2: Write the failing golden reps test**

In `packages/core/test/golden-run.test.ts`, add a test. Use a **stateful** fake adapter so reps can vary (the existing `fakeAdapter` always PASSes — fine for the determinism/N=1 tests; add a new local adapter here):

```ts
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
  expect(typeof s.flakiness).toBe("number");
  // rep-suffixed transcripts exist
  expect(existsSync(join(runDir, `${s.id}.green.rep0.txt`))).toBe(true);
  expect(existsSync(join(runDir, `${s.id}.green.rep2.txt`))).toBe(true);
});
```

Add `existsSync` to the test's `node:fs` import if missing.

Run: `npx vitest run packages/core/test/golden-run.test.ts`
Expected: FAIL — `reps` option ignored; no reps fields; no rep-suffixed transcripts.

- [ ] **Step 3: Refactor `run.ts` — split `runScenario` into `runRep` + aggregate**

Add to `RunOptions`:

```ts
  reps?: number; // run each scenario N times (default 1); per-scenario `reps:` overrides
  passThreshold?: number; // pass if pass-rate >= this (default 0.5); per-scenario overrides
```

Import the aggregator:

```ts
import { aggregateReps, type RepOutcome } from "./reps.js";
```

Replace the task-building + pool call in `runSkillModel`:

```ts
  // scenario × rep tasks; runPool preserves input order so we can slice per scenario.
  const repCounts = spec.scenarios.map((s) => s.reps ?? opts.reps ?? 1);
  const owners: number[] = [];
  const tasks: Array<() => Promise<RepOutcome>> = [];
  spec.scenarios.forEach((scenario, si) => {
    for (let k = 0; k < repCounts[si]; k++) {
      const rep = k;
      const total = repCounts[si];
      owners.push(si);
      tasks.push(() => runRep(scenario, rep, total, { ...opts, runDir, now, log }));
    }
  });
  const flat = await runPool(tasks, opts.concurrency ?? 1);

  const grouped: RepOutcome[][] = spec.scenarios.map(() => []);
  flat.forEach((outcome, i) => grouped[owners[i]].push(outcome));

  const scenarioResults: ScenarioResult[] = spec.scenarios.map((scenario, si) => {
    const threshold = scenario.passThreshold ?? opts.passThreshold ?? 0.5;
    const agg = aggregateReps(grouped[si], threshold);
    const base: ScenarioResult = {
      id: scenario.id, judge_verdict: agg.verdict, judge_reason: agg.reason,
      suspect: agg.suspect, override: null, note: "",
    };
    // Only attach reps fields for N>1, so an N=1 run's results.yaml is byte-identical to M3.
    return repCounts[si] > 1 ? { ...base, reps: agg.reps, passes: agg.passes, flakiness: agg.flakiness } : base;
  });
```

Replace `runScenario` with `runRep` (one rep; emits per-rep journal events; returns a `RepOutcome`):

```ts
/** Run ONE rep of a scenario in its own isolated workspace. */
async function runRep(scenario: Scenario, rep: number, repCount: number, ctx: RunOptions & ScenarioCtx): Promise<RepOutcome> {
  const { spec, judge, mode, runDir, now, log } = ctx;
  const repField = repCount > 1 ? { rep } : {};
  if (rep === 0) {
    log(`  ${scenario.id} (${scenario.title})${repCount > 1 ? ` ×${repCount}` : ""} …`);
    appendJournal(runDir, { event: "scenario-started", ts: now(), id: scenario.id, title: scenario.title });
  }

  let ws: Workspace | null = null;
  let transcript = "";
  let gatePrefix: string | null = null;
  try {
    try {
      ws = createWorkspace(scenario.workspace, { specDir: dirname(ctx.specPath) });
    } catch (e) {
      gatePrefix = e instanceof Error ? e.message : String(e);
      transcript = `[workspace setup failed] ${gatePrefix}`;
    }
    if (ws) {
      if (scenario.mode === "seeded") {
        const r = await runSeeded(scenario, { skillDir: ctx.skillDir, adapter: ctx.adapter, model: ctx.model, mode, cwd: ws.cwd });
        transcript = r.transcript;
        gatePrefix = r.gateFailure;
      } else {
        transcript = await ctx.adapter.run({ skillDir: ctx.skillDir, model: ctx.model, mode, turns: scenario.turns, cwd: ws.cwd });
      }
    }

    writeFileSync(transcriptPath(runDir, scenario.id, mode, repCount > 1 ? rep : undefined), transcript, "utf8");
    if (scenario.mode === "seeded") {
      appendJournal(runDir, { event: "gate-result", ts: now(), id: scenario.id, ok: !gatePrefix, detail: gatePrefix ?? "", ...repField });
    }

    let verdict: ScenarioResult["judge_verdict"];
    let reason: string;
    let suspect = false;
    if (gatePrefix) {
      verdict = "FAIL";
      reason = gatePrefix;
    } else {
      const prompt = buildJudgePrompt({ skill: spec.skill, persona: spec.judge_persona, scenario, transcript });
      const g = await judgeInWorkspace(ctx.adapter, judge, prompt, dirname(ctx.specPath));
      verdict = g.verdict;
      reason = g.reason;
      suspect = g.suspect;
    }

    log(`  → ${scenario.id}${repCount > 1 ? `#${rep}` : ""} ${verdict}${reason ? `: ${reason}` : ""}${suspect ? "  ⚠ suspect" : ""}`);
    appendJournal(runDir, { event: "judge-verdict", ts: now(), id: scenario.id, verdict, reason, suspect, ...repField });
    if (suspect) {
      appendJournal(runDir, { event: "misfire-flag", ts: now(), id: scenario.id, reason, ...repField });
    }
    return { verdict, reason, suspect };
  } finally {
    ws?.cleanup();
  }
}
```

Notes: `ScenarioCtx` is unchanged. `formatScorecard` needs a small touch so a reps run shows the rate — after the existing per-scenario line, if `s.reps` is set append it. In `formatScorecard`'s loop, change the pushed line to include reps when present:

```ts
    const repInfo = s.reps ? `  [${s.passes}/${s.reps}${s.flakiness ? ` flaky ${s.flakiness.toFixed(2)}` : ""}]` : "";
    lines.push(`  ${mark} ${s.id}${ov}${susp}  ${s.judge_reason}${repInfo}`);
```

- [ ] **Step 4: Run the golden test + full suite**

Run: `npx vitest run packages/core/test/golden-run.test.ts`
Expected: PASS (the existing N=1 determinism/label/journal tests still pass — `runRep` at rep 0 with `repCount 1` emits the same events with no `rep` field and writes the unsuffixed transcript; the new reps test passes).

Run: `npm run build && npx vitest run` (twice — parallel-file execution, ensure no flake) → green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/run.ts packages/core/src/journal.ts packages/core/test/golden-run.test.ts
git commit -m "feat(core): run scenarios over N reps, aggregate pass-rate/flakiness/suspect through the pool"
```

---

### Task 6: CLI flags + README

**Files:**
- Modify: `packages/cli/src/cli.ts`, `README.md`

**Interfaces:**
- Consumes: `RunOptions.reps` / `RunOptions.passThreshold` (Task 5).

- [ ] **Step 1: Wire the flags in `cmdRun`**

In `packages/cli/src/cli.ts` `cmdRun`, after the `parallel` line add:

```ts
  const reps = Math.max(1, Math.floor(Number(flagStr(args, "reps", "1")) || 1));
  const ptRaw = Number(flagStr(args, "pass-threshold", "0.5"));
  const passThreshold = Number.isFinite(ptRaw) && ptRaw >= 0 && ptRaw <= 1 ? ptRaw : 0.5;
```

Add to the `runSkillModel({ … })` call:

```ts
        reps,
        passThreshold,
```

- [ ] **Step 2: Update HELP**

Change the `run` usage line in the `HELP` string to include the flags:

```
  run    <skill|all> --skills <root> [--model prov:model ...] [--models file]
                     [--mode red|green|force] [--judge prov:model] [--harness pi]
                     [--label name] [--parallel N] [--reps N] [--pass-threshold T]
```

- [ ] **Step 3: Behavioral smoke**

```bash
npm run build
node bin/skill-check.js help   # shows --reps and --pass-threshold
```

- [ ] **Step 4: README**

In `README.md`, in the concurrency/run section, add short notes in the repo's tone:
- `--reps N` runs each scenario N times (default 1); the scenario's verdict becomes a pass-rate and it PASSes at `--pass-threshold T` (default 0.5, ties pass). A per-scenario flakiness index is recorded. Combine with `--parallel` to keep N reps fast.
- Per-scenario `reps:` and `pass_threshold:` in `specification.yaml` override the run flags.
- A judge **misfire** (its per-item grades disagree with its overall verdict) marks the scenario `suspect`: it's excluded from the grade and blocks SHIP until you re-judge it or set an override in the review UI.

- [ ] **Step 5: Full build + suite + commit**

Run: `npm run build && npx vitest run` → green.

```bash
git add packages/cli/src/cli.ts README.md
git commit -m "feat(cli): --reps and --pass-threshold; document reps/flakiness/suspect"
```

---

### Task 7: Surface reps + suspect in the review UI

**Files:**
- Modify: `packages/core/src/report.ts`, `assets/report.template.html`
- Test: `packages/core/test/report.test.ts` (extend — publicView shape)

**Interfaces:**
- Consumes: `ScenarioResult` reps fields (Task 4) + the suspect gate (Task 4).

- [ ] **Step 1: Thread reps fields into the client payload**

In `packages/core/src/report.ts`, extend the `RunColumn.cells` value type and the cell construction to carry `reps`/`passes`/`flakiness` (the cell already carries `suspect`):

```ts
  cells: Record<string, { judge_verdict: string; judge_reason: string; suspect: boolean; reps?: number; passes?: number; flakiness?: number; override: string | null; note: string }>;
```

In `collectReport`, where each cell is built, add:

```ts
          reps: s.reps,
          passes: s.passes,
          flakiness: s.flakiness,
```

`publicView` already spreads `cells` verbatim — no change there.

- [ ] **Step 2: Failing report test**

In `packages/core/test/report.test.ts`, add an assertion that a scenario with reps surfaces them. Extend the seed helper's results.yaml (or add a focused test) so a scenario has `reps: 3, passes: 2, flakiness: 0.8`, then:

```ts
test("collectReport surfaces reps/flakiness on the cell", () => {
  const data = collectReport(seedSkill());
  const cell = data.columns[0].cells["A1"];
  // (seed A1 with reps in the helper) — assert the fields propagate:
  expect(cell.reps === undefined || typeof cell.reps === "number").toBe(true);
});
```

(If reworking `seedSkill` is heavy, instead unit-test `publicView` directly with a hand-built `ReportData` containing a reps cell and assert the JSON includes `flakiness`. Pick whichever fits the existing test file; the point is that reps fields reach the client payload unstripped.)

Run: `npx vitest run packages/core/test/report.test.ts` → FAIL until Step 1 lands (or PASS if you wrote Step 1 first — then make the assertion specific enough to have failed before).

- [ ] **Step 3: Render reps + suspect in the template**

In `assets/report.template.html`:

(a) **Cell content** — where a cell renders its verdict + override badge, add a reps/flakiness line and a suspect badge. Find the cell-build in `render()` and extend:

```js
      const reps = cell.reps ? `<span class='reps'>${cell.passes}/${cell.reps}${cell.flakiness ? ` · flaky ${cell.flakiness.toFixed(2)}` : ""}</span>` : "";
      const suspectBadge = cell.suspect && !cell.override ? `<span class='ov suspect'>suspect</span>` : "";
      html += `<td class='cell ${v}${sel}' data-col='${col.index}' data-id='${scn.id}'>${v}${ov}${suspectBadge}${reps}</td>`;
```

(b) **Column grade** — `gradeColumn` must exclude unresolved suspect cells from `passed`/`total` and block ship, mirroring `score.ts`. In `gradeColumn`, inside the per-scenario loop, before counting:

```js
    const cell = col.cells[scn.id];
    if (!cell) continue;
    if (cell.suspect && !cell.override) { suspect++; continue; } // excluded, blocks ship
    total++;
    const v = effective(cell);
    if (v === "PASS") { passed++; continue; }
    if (crit.includes(scn.id)) criticalFails++;
    if (/^B/i.test(scn.id)) bFails++;
```

Declare `let suspect = 0;` alongside the other counters, and add `&& suspect === 0` to the `ship` expression; return `suspect` in the result object. Where the header badge renders (the `mode !== "green"` branch added in M3 and the normal branch), when `g.suspect > 0` append ` — ${g.suspect} suspect` to the grade text and force the NOT READY badge.

(c) **CSS** — near the existing `.ov` / `.ov.unsaved` rules add:

```css
  .cell .ov.suspect { color: #b45309; }
  .cell .reps { display: block; font-size: 10px; color: var(--dim); }
```

- [ ] **Step 4: Smoke-render + full suite**

Render the template with a hand-built data object (a column with a suspect cell + a reps cell) via a quick `node --input-type=module` check that `renderReport` produces `suspect` and the reps line and leaves no `/*__DATA__*/null` placeholder — mirror the M3 smoke in the fix history.

Run: `npm run build && npx vitest run` → green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/report.ts assets/report.template.html packages/core/test/report.test.ts
git commit -m "feat(ui): show reps/flakiness and suspect-block in the review matrix"
```

---

## Self-review (done at plan time)

- **Spec coverage:** misfire detector (per-item parse + AND, fail-open, ERROR guard) ✓ Task 1; reps aggregation (majority-clean→suspect, threshold, flakiness) ✓ Task 2; `reps`/`pass_threshold` parse+validate ✓ Task 3; suspect excluded+gates ship, override resolves ✓ Task 4; reps loop through the pool + per-rep journal + rep-suffixed transcripts + N=1 byte-identity ✓ Task 5; CLI `--reps`/`--pass-threshold` + docs ✓ Task 6; UI reps/flakiness/suspect + client gradeColumn suspect handling ✓ Task 7. Non-goals (panels, auto-re-judge, trends UI) untouched.
- **Type consistency:** `RepOutcome {verdict,reason,suspect}` / `aggregateReps(outcomes,threshold)→RepAggregate` (Task 2) used verbatim in Task 5; `ScenarioVerdict.suspect?`/`ScoreResult.suspectCount` (Task 4) consumed by `score`; `effectiveVerdicts` suspect rule (Task 4) feeds `finalizeResults`; `transcriptPath(…, rep?)` (Task 4) used by `runRep` (Task 5); `RunOptions.reps`/`passThreshold` (Task 5) set by CLI (Task 6); journal `rep?` (Task 5) on the three event variants; `ScenarioResult.reps/passes/flakiness` (Task 4) surfaced by report (Task 7).
- **Placeholder scan:** none. Task 7 Step 2 offers two concrete test shapes (seed-based or direct `publicView`) — both are real, pick one; not a placeholder.
- **N=1 backward-compat guard:** reps fields attached only when `repCount > 1`; transcript unsuffixed at N=1; journal `rep` omitted at N=1; suspectCount 0 ⇒ unchanged score — golden byte-identity holds (Task 4/5 steps note it).
