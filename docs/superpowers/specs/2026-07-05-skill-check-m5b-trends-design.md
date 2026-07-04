# skill-check v2 — Milestone 5b design: trends + M5 cleanup

Date: 2026-07-05 · Status: approved (design) · Decided with: alavanja

Second slice of the master design's M5 (Monitoring/UI). M5a shipped the
interactive console (inspector + misfire queue + re-judge). M5b adds the
*observe over time* half — trends across a skill's historical/labeled runs —
and folds in the cleanup M5a deferred. Builds on M1–M5a, all merged to `main`.
Master: `docs/superpowers/specs/2026-07-03-skill-check-framework-design.md`.

## Goal

In the on-demand review console, show — per model, across a skill's run history
— a grade-% trend and a per-scenario verdict-history grid that makes both the
grade trajectory and across-run flakiness visible at a glance. Plus land the
three ledgered M5a cleanups on a clean base first.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Trends scope | Single-skill (the console's skill), per model × its run history. No cross-skill dashboard. |
| Trends view | Per model: a grade-% sparkline (oldest→newest) + a scenario×run grid (`✓`/`✗`/`?`suspect/`·`absent), reps `flakiness` in the cell title. |
| Run cap | Most-recent **20** runs per model (chronological; older annotated as dropped, not shown). |
| Data load | Lazy — `GET /trends` fetched when the Trends section is first expanded (not inlined into the page load). |
| Charts | Hand-drawn inline SVG + vanilla JS; no bundler, no CDN, no chart lib (console is strictly self-contained). |
| Verdict shown | The **effective** verdict (`override ?? judge_verdict`), so overrides are reflected in the history. |
| Cleanup first | Land `effectiveThreshold`, `judgeOneRep`, and preserve-judge-raw-on-override before the trends feature. |

## Architecture

Unchanged shape: `serveReview(skillDir)` — local, on-demand, single-skill. New
**core** `collectTrends` (historical aggregation, sibling of `collectReport`),
new `GET /trends` endpoint, new Trends section in the template. Cleanup extracts
three shared units.

```
packages/core/src/
  results.ts   # effectiveThreshold(prev, scenario); preserveTranscript also preserves judge-raw
  regrade.ts   # judgeOneRep() extracted; regradeScenario uses it
  run.ts       # runRep uses judgeOneRep
  trends.ts    # NEW: collectTrends() + publicTrends()
packages/cli/src/
  serve.ts     # GET /trends; /rejudge + cmdGrade use effectiveThreshold
  cli.ts       # cmdGrade uses effectiveThreshold
assets/
  report.template.html  # collapsible Trends section (sparkline + grid), lazy fetch
```

## 1. Cleanup (deferred from M5a) — do these first

### 1a. `effectiveThreshold` (`results.ts`)
The re-grade threshold precedence `prev?.pass_threshold ?? scenario.passThreshold ?? 0.5`
is duplicated in `cli.ts` (`cmdGrade`) and `serve.ts` (`/rejudge`). Extract:
```ts
export function effectiveThreshold(prevScenario: ScenarioResult | undefined, scenario: Scenario): number {
  return prevScenario?.pass_threshold ?? scenario.passThreshold ?? 0.5;
}
```
Both re-grade sites call it. `run.ts`'s run-time precedence
(`scenario.passThreshold ?? opts.passThreshold ?? 0.5`) is a **different**
context (no `prev`, has a run-level flag) and is intentionally left as-is.

### 1b. `judgeOneRep` (`regrade.ts`)
`runRep` (run.ts) and `regradeScenario` (regrade.ts) both do: build the judge
prompt → `judgeInWorkspace` → write judge-raw (`judgeRawPath`) → emit per-rep
`judge-verdict` (+ `misfire-flag` when suspect) → produce a `RepOutcome`.
Extract that shared inner step:
```ts
export async function judgeOneRep(opts: {
  runDir: string; spec: Spec; scenario: Scenario; transcript: string;
  adapter: HarnessAdapter; judge: ModelRef; specDir: string; mode: string;
  rep: number | undefined; now: () => string;
}): Promise<RepOutcome>;
```
`regradeScenario` calls it per transcript; `runRep`'s judge branch calls it
instead of its inline copy (runRep still owns producing the transcript — harness
run or seeded gates — then delegates judging). Behavior-preserving: the golden
run and regrade tests stay green.

### 1c. Preserve judge-raw on override (`results.ts`)
`preserveTranscript(resultsRoot, runDir, id)` currently un-gitignores the
scenario's transcript file(s) so an override's evidence is committed. Extend it
to also un-gitignore that scenario's judge-raw artifact(s) (`findJudgeRawFiles`)
— the misfire evidence (what the judge said) belongs in the audit trail too.
Idempotent, same negation-line mechanism.

## 2. `collectTrends` (`trends.ts`)

```ts
export interface TrendCell { verdict: Verdict; suspect: boolean; flakiness?: number; }
export interface TrendRun {
  timestamp: string; label: string | null;
  grade: ResultsFile["effective_grade"];
  cells: Record<string, TrendCell>; // scenarioId -> cell
}
export interface TrendModel { model: string; tag: string; runs: TrendRun[]; truncated: boolean; }
export interface TrendData {
  skill: string;
  scenarios: { id: string; title: string; critical: boolean }[];
  models: TrendModel[];
}
export function collectTrends(skillDir: string, limit?: number): TrendData; // default limit 20
```

- For each model-tag dir under `<skill>/tests/results/`, read **every** run
  subdir that has a `results.yaml` (via `readResults`, so schema-1 migrates),
  sorted ascending by dir name (timestamp slug ⇒ chronological), keep the last
  `limit` (default 20). `truncated` = true when older runs were dropped.
- Each run's cell: `verdict = s.override ?? s.judge_verdict`, `suspect =
  s.suspect ?? false`, `flakiness = s.flakiness`.
- `scenarios` from the current spec (titles + order).
- A model-tag with no valid runs is omitted. No results root → `models: []`.
- `TrendData` deliberately carries **no** absolute paths (no `runDir`), so it is
  safe to serialize to the browser directly — no `publicView`-style stripper is
  needed (unlike `collectReport`, whose `RunColumn.runDir` must be hidden).

## 3. `GET /trends` (`serve.ts`)

`GET /trends` → `res.end(JSON.stringify(collectTrends(opts.skillDir)))` (the
shape has no absolute paths, so it serializes directly). Fetched lazily by the
UI on first expand. Wrapped by the existing top-level try/catch (→ 500 on an
unexpected error).

## 4. Trends UI (template)

A collapsible **Trends** section below the matrix (a header button toggling a
`#trends` container), collapsed by default. On first expand: `fetch("/trends")`,
then per model render:
- **grade sparkline** — an inline `<svg>` polyline of each run's `grade.pct`
  (oldest→newest), with the latest `letter (pct%)` + a SHIP/NOT-READY badge and,
  if `truncated`, a "(last 20)" note.
- **scenario×run grid** — a `<table>`: a row per scenario, a column per run
  (newest on the right, header = `label` or a short timestamp). Cell glyph +
  colour: `✓` PASS (green), `✗` FAIL (red), `?` suspect (amber), `·` absent
  (dim). `title` attribute shows the run label + `flakiness` when present.
Vanilla JS + the existing `escapeHtml`; no dependencies. Empty state ("No runs
yet.") when `models` is empty.

## Data flow

`GET /` (matrix, latest-per-model — unchanged) · `GET /trends` (all runs,
lazy) · re-judge/override still mutate one run's `results.yaml`; re-opening
Trends re-fetches. Trends is read-only.

## Backward compatibility

- `collectReport` and the matrix/`/save`/`/rejudge`/`/judge` flows are unchanged.
- The cleanup is behavior-preserving: `effectiveThreshold` returns the same
  values the inline expressions did; `judgeOneRep` produces the same
  artifacts/journal/outcome; preserving judge-raw only *adds* negation lines.
- N=1 results.yaml unaffected (no schema change).

## Testing

- **cleanup:** `effectiveThreshold` (prev.pass_threshold wins → scenario →
  0.5); `judgeOneRep` covered by the unchanged golden-run + regrade suites
  (they exercise both callers) plus a direct unit test (writes judge-raw,
  emits journal, returns the outcome); `preserveTranscript` now also
  un-gitignores the judge-raw file(s) (extend the existing preserve test).
- **`collectTrends`:** multiple runs per model returned chronologically
  (newest last); per-scenario cell uses the override-aware verdict; `limit`
  keeps the newest N and sets `truncated`; a schema-1 run migrates; a scenario
  absent from an older run → no cell; empty results root → `models: []`.
- **`/trends`:** returns the JSON; no absolute paths in the body.
- **UI:** smoke-render asserts the `#trends` container + sparkline `<svg>` +
  grid markers appear and no `/*__DATA__*/`/`/*__GRADE__*/` placeholder remains.

## Non-goals (M5b)

- Cross-skill dashboard; watch/real-time refresh.
- Any external chart library.
- Editing / re-judging from the trends view (that stays in the matrix).
- Configurable retention beyond the default 20-run cap.
- The `/rejudge`↔`cmdGrade` persist-sequence dedup (marginal; sites differ).
