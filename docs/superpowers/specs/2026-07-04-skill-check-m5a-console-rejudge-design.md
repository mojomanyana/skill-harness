# skill-check v2 — Milestone 5a design: journal console — inspector + misfire queue + re-judge

Date: 2026-07-04 · Status: approved (design) · Decided with: alavanja

First of two slices of the master design's M5 (Monitoring/UI). M5a is the
*interactive* half — inspect, re-judge, resolve. M5b (trends across labeled runs)
is a later spec/plan cycle. Builds on M1–M4, all merged to `main`.
Master: `docs/superpowers/specs/2026-07-03-skill-check-framework-design.md`.

## Goal

Grow the on-demand review server into a console that lets you inspect a
scenario's transcript **and the judge's raw output**, see every unresolved
`suspect` scenario in one **misfire queue**, and **re-judge** a suspect
in one click (rep-aware) or resolve it with an audited override. The same
rep-aware re-judge fixes `skill-check grade` on reps runs (the M4 carryover).

## Decisions (locked)

| Decision | Choice |
|---|---|
| Judge-raw storage | Per-rep git-ignored artifact `<id>.<mode>[.rep<k>].judge.txt` beside the transcript (matches `*.txt` ignore; keeps `results.yaml` lean). |
| Re-judge judge | The run's **originally-recorded** judge (`results.yaml.judge`) — reproducible; no UI model picker. |
| Re-judge granularity | Per scenario, triggered from the misfire queue / panel. Server spawns a live judge subprocess. |
| Shared core | One rep-aware `regradeScenario` used by both `/rejudge` (server) and `cmdGrade` (CLI). |
| Console scope | Single-skill (unchanged `serveReview`); the misfire queue covers the runs already shown (latest per model). Multi-skill/history → M5b. |
| Threshold fidelity | Reps runs persist the effective per-scenario `pass_threshold` so re-judge reproduces the original aggregation. |

## Architecture

Unchanged shape: `serveReview(skillDir)` — a local, on-demand HTTP server, no
daemon. New endpoints (`/rejudge`, `/judge`) and template sections layer onto the
existing matrix. The one new **core** unit is `regradeScenario` (pure-ish:
re-judges saved transcripts, no harness re-run), shared by server and CLI.

```
packages/core/src/
  regrade.ts     # NEW: regradeScenario() — rep-aware re-judge of saved transcripts
  results.ts     # judgeRawPath(); optional ScenarioResult.pass_threshold (reps runs)
  run.ts         # runRep persists judge raw; reuses the shared rep-aggregation
  reps.ts        # all-clean-ERROR → aggregate ERROR
  journal.ts     # readJournal validates event shape (skip malformed)
packages/cli/src/
  serve.ts       # /rejudge, /judge; misfire-queue data already in the payload
  cli.ts         # cmdGrade uses regradeScenario (rep-aware; replaces the reps-run error)
assets/
  report.template.html  # inspector (judge-raw), misfire queue, re-judge button
```

## 1. Judge-raw persistence (`run.ts`, `results.ts`)

`gradeTranscript`/`judgeInWorkspace` already return `raw`. `runRep` writes it to
`judgeRawPath(runDir, id, mode, rep?)` → `<runDir>/<id>.<mode>.judge.txt` (single)
or `<id>.<mode>.rep<k>.judge.txt` (reps). Matched by the existing `*.txt` gitignore
(no gitignore change). A gate-failed scenario (no judge ran) writes no judge-raw.
`results.ts` exports `judgeRawPath` and a `findJudgeRawFiles(runDir, id)` reader
(mode-scoped, matching only `<id>.<mode>[.rep<k>].judge.txt`). Old runs
lacking the artifact → the inspector shows "judge output not captured".

**Glob-collision guard:** judge-raw files end in `.txt`, so the *no-mode*
`findTranscriptFiles(runDir, id)` (used by `preserveTranscript` and the
`/transcript` view — `startsWith("<id>.") && endsWith(".txt")`) would otherwise
scoop them up as transcripts. `findTranscriptFiles` must **exclude** names
containing `.judge.` (transcripts never do). The mode-scoped
`findTranscriptFiles(runDir, id, "green")` already excludes them via its anchored
`^<id>\.green(\.rep\d+)?\.txt$` regex; only the no-mode path needs the filter.
This is covered by a regression test.

## 2. Inspector (`serve.ts`, template)

New `GET /judge?col=&id=` returns the scenario's raw judge output — all reps
concatenated with a `===== <file> =====` header (same shape as `/transcript`),
or 404 → the panel renders "judge output not captured". The scenario panel gains a
**"judge raw"** section below the transcript. Seeded gate output already appears
inside the transcript, so no separate endpoint for it.

## 3. Misfire queue (template)

A collapsible **Misfire queue** section above the matrix, built client-side from
`DATA`: every cell where `suspect && !override`, as rows of
`<model> · <scenarioId> — <reason>` with **[Re-judge]** and **[Override]** buttons.
Empty state: "No unresolved misfires." It reads the same payload the matrix uses,
so it always reflects the shown runs (latest per model). Re-judge/override update
the queue and matrix live (re-fetch or in-place patch).

## 4. Re-judge (`regrade.ts`, `serve.ts`)

Core:
```ts
export interface RegradeOutcome {
  judge_verdict: Verdict; judge_reason: string; suspect: boolean;
  reps?: number; passes?: number; clean?: number; flakiness?: number;
}
export async function regradeScenario(opts: {
  runDir: string; scenario: Scenario; adapter: HarnessAdapter; judge: ModelRef;
  specDir: string; threshold: number; now?: () => string;
}): Promise<RegradeOutcome>;
```
- Discover the scenario's green transcripts via `findTranscriptFiles(runDir, id, "green")`.
- For each: read transcript → `buildJudgePrompt` → `judgeInWorkspace(adapter, judge, prompt, specDir)`; write the returned `raw` to the matching `judgeRawPath`; collect a `RepOutcome`.
- 1 transcript → single outcome (verdict/reason/suspect, no reps fields, byte-identical to a single run). >1 → `aggregateReps(outcomes, threshold)` → reps/passes/clean/flakiness/suspect.
- Emit per-rep `judge-verdict` (+ `misfire-flag` when suspect) journal events. Does **not** write `results.yaml` or the score event — the caller persists + recomputes.

The rep-aggregation half is shared with `run.ts`'s `runRep` path (extract the
"outcomes → ScenarioResult fields" step so both call it — no second copy of the
N=1-bypass rule).

Server `POST /rejudge {col, scenarioId}`:
- Resolve the column's `runDir`; `readResults`; find the recorded `judge` + `harness`; `getAdapter(harness)`.
- `threshold` = the scenario's persisted `pass_threshold` (reps runs) ?? current spec's `scenario.pass_threshold` ?? 0.5.
- `regradeScenario(...)` → replace that scenario's `ScenarioResult` fields (preserving its existing `override`/`note`), `writeResults` (recompute grade override-aware; `ctx` only when `mode==="green"`), `ensureResultsGitignore`, append a `score` journal event.
- Respond `{ ok, cell, grade }` for a live update. Errors (judge unavailable, no transcripts) → a clean 4xx with a message the UI surfaces.

## 5. `cmdGrade` rep-aware (M4 carryover)

`cmdGrade` loops scenarios calling `regradeScenario` (threshold from spec/persisted),
builds the results, `writeResults`. This **replaces** the M4 "reps run — re-grading
isn't supported" error: reps runs now re-grade correctly. Single-rep behavior is
unchanged (one transcript → one outcome). The existing guards (no transcripts →
error; missing recorded scenario → error) are preserved.

## 6. Threshold fidelity (`results.ts`, `run.ts`)

So re-judge reproduces the original aggregation, a reps run persists the effective
threshold: `ScenarioResult` gains optional `pass_threshold?: number`, written by
`run.ts` only when `reps > 1` (alongside `reps/passes/clean/flakiness`). N=1 runs
are unaffected (no reps fields → byte-identical to M4). `regradeScenario`/`cmdGrade`
prefer this persisted value, falling back to the spec's per-scenario value, then 0.5.

## 7. Core carryovers

- **`aggregateReps` all-ERROR → ERROR** (`reps.ts`): when every clean rep's verdict
  is `ERROR`, the aggregate verdict is `ERROR` with reason "N reps errored"
  (`flakiness 0`), instead of a misleading `FAIL`. Mixed ERROR/PASS/FAIL is
  unchanged (ERROR counts as non-pass in the pass-rate, as today). Score impact:
  none (ERROR is already a non-pass and doesn't block ship like suspect does).
- **`readJournal` shape validation** (`journal.ts`): a parsed line that isn't an
  object with a known `event` string is skipped (same fail-open spirit as the
  corrupt-line guard), so a malformed/foreign line never yields a bogus event.

## Backward compatibility

- Existing single-skill review flow, `/save` override, and matrix render unchanged.
- N=1 `results.yaml` stays byte-identical to M4 (judge-raw is a separate artifact;
  `pass_threshold`/reps fields only for reps>1).
- Runs made before M5a have no judge-raw artifacts → inspector degrades gracefully.
- `cmdGrade` on a single-rep run: same output as before (now via `regradeScenario`).

## Testing

- **`regradeScenario`** (fake adapter): single-rep re-judge reproduces the verdict;
  a reps run re-judges all rep transcripts and re-aggregates (pass-rate/flakiness);
  a suspect scenario that the judge now grades cleanly flips to not-suspect and
  ships; writes judge-raw artifacts per rep; honors the persisted threshold.
- **judge-raw persistence**: `runRep` writes `judgeRawPath`; `findJudgeRawFiles`
  returns them sorted; a gate-failed scenario writes none.
- **`/rejudge` + `/judge`** (serve integration, fake adapter): `/rejudge` mutates
  `results.yaml`, recomputes the grade, journals; `/judge` returns raw (all reps) or
  404; a suspect resolved by re-judge leaves the ship gate open.
- **misfire queue**: renders exactly the `suspect && !override` cells; empty state.
- **`cmdGrade`**: a reps run now re-grades (no more "not supported" error);
  single-rep unchanged.
- **`aggregateReps` all-ERROR** → ERROR; **`readJournal`** skips a malformed line.

## Non-goals (M5a)

- Trends / history / charts across labeled runs (M5b).
- Multi-skill dashboard; a judge-model picker in the UI.
- Re-running the *subject* harness from the UI (re-judge re-runs only the judge).
- Watch mode; long-running daemon.
