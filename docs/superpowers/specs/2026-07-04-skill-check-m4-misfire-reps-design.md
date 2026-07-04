# skill-check v2 — Milestone 4 design: misfire detector + reps/flakiness

Date: 2026-07-04 · Status: approved (design) · Decided with: alavanja

Refines the M4 row of the master design
(`docs/superpowers/specs/2026-07-03-skill-check-framework-design.md`) into locked
implementation decisions. Builds on M1–M3 (workspace monorepo; results schema 2 +
journal + override-aware scoring; per-scenario workspaces + `env:` + `--parallel`),
all merged to `main`.

## Goal

Turn the coarse M2 misfire tripwire into a precise per-checklist-item consistency
check that **blocks SHIP until resolved**, and let a scenario run N times
(`--reps N`) to yield a pass-rate + flakiness index. Both are opt-in and reduce
to today's behavior at N=1.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Misfire → SHIP | An unresolved `suspect` scenario is **excluded from the pass/total denominator** and forces `SHIP=false`. An author **override resolves** it (rejoins scoring). |
| Reps threshold | Scenario PASSes if `pass_rate ≥ threshold`; threshold **defaults to 0.5 (ties pass)**, configurable per run (`--pass-threshold`) and per scenario. |
| Flakiness | `1 − |2·pass_rate − 1|` (0 = unanimous, 1 = even split). **Recorded, never gates.** |
| Suspect aggregation | A scenario is `suspect` if **fewer than half its reps are clean** (non-misfired). N=1 ⇒ one suspect rep ⇒ suspect. |
| Reps default | `N=1` (opt-in, like `--parallel`). Per-scenario `reps:` overrides `--reps N`. |
| Detector fail-open | If per-item grades can't be parsed, **no `suspect` flag** — a parse miss never blocks a run. |
| Schema | Extend results schema 2 with **optional** `reps`/`passes`/`flakiness` (no migration; old files read as N=1). |

## Misfire detector (`grade.ts`)

The judge prompt already asks the model to "Grade each checklist item PASS or FAIL"
then emit a `VERDICT:` line. M2 shipped a coarse tripwire (`grade.ts`): FAIL verdict
whose item grades contain no "fail". M4 replaces it with a per-item parse:

- Parse item lines matching `^\s*\d+[.)]\s*(PASS|FAIL)` (case-insensitive, multiline)
  into a boolean list.
- `andItems = every item is PASS`.
- `verdictBool = verdict === "PASS"`.
- `suspect = itemsParsed && verdict !== "ERROR" && verdictBool !== andItems` — fires
  on **either** mismatch direction (false-pass or the observed false-fail class).
  The explicit `ERROR` guard matters: an `ERROR` verdict with parsed all-pass items
  must **not** trip the `verdictBool !== andItems` comparison.
- **Fail-open:** if no item lines parse (`items.length === 0`), `suspect = false`.
  An `ERROR` verdict (unparseable output) also yields `suspect = false` — it is
  already surfaced as ERROR and counts as a non-pass.

`GradeResult.suspect` keeps its type (`boolean`); only the computation sharpens.
No change to `judgeInWorkspace`/`gradeTranscript` signatures.

## Reps + flakiness (`run.ts`, `spec.ts`)

`RunOptions` gains `reps?: number` (default 1) and `passThreshold?: number`
(default 0.5). A scenario's effective rep count is `scenario.reps ?? opts.reps ?? 1`;
its threshold is `scenario.passThreshold ?? opts.passThreshold ?? 0.5`.

Each rep is a full cycle: `createWorkspace(scenario.workspace)` → harness (or seeded
gates) → `judgeInWorkspace`. Reps are independent tasks, so they compose with the
M3 scheduler — `run.ts` builds `scenario × rep` task thunks and feeds them all to
`runPool(tasks, concurrency)` (N reps × M scenarios in one pool). Each rep writes its
transcript to `transcriptPath(runDir, id, mode)` suffixed with the rep index for
N>1 (`<id>.<mode>.rep<k>.txt`); N=1 keeps today's `<id>.<mode>.txt` name.

Aggregation per scenario (pure function, unit-tested):

```
clean   = reps where !rep.suspect
suspect = clean.length * 2 < N                    // fewer than half clean
if suspect: { judge_verdict: "FAIL", passes: <clean passes>, flakiness, reps: N, suspect: true }
else:
  passes    = clean reps with verdict PASS
  pass_rate = passes / clean.length
  verdict   = pass_rate >= threshold ? "PASS" : "FAIL"
  flakiness = 1 - Math.abs(2 * pass_rate - 1)
  { judge_verdict: verdict, passes, flakiness, reps: N, suspect: false }
```

`judge_reason` for N>1 is a summary (`"4/5 reps passed (flaky 0.40)"`); for N=1 it is
the single rep's reason (unchanged). For N=1 the whole thing collapses to today: one
clean rep → verdict passes through, `flakiness 0`; one suspect rep → `suspect`.

## Spec additions (`spec.ts`, backward compatible)

Optional per-scenario fields, validated in `parseSpec`:

```yaml
scenarios:
  - id: A1
    reps: 5                 # optional; positive integer; overrides --reps
    pass_threshold: 0.8     # optional; 0..1; overrides --pass-threshold
    turns: [...]
    checklist: [...]
```

`Scenario` gains `reps?: number` and `passThreshold?: number` (undefined when absent).
Validation: `reps` a positive integer; `pass_threshold` a number in `[0, 1]` — else a
`SpecError` naming the scenario.

## Scoring (`score.ts`, `results.ts`)

`ScenarioVerdict` gains `suspect?: boolean`. `score` treats a suspect verdict as
**neither pass nor fail** — excluded from `passed` and `total` — and records
`suspectCount`:

```
for v of verdicts:
  if (v.suspect) { suspectCount++; continue }      // excluded from total & passed
  total++
  if (v.verdict === "PASS") passed++
  else { critical / B-series accounting as today }
ship = total >= shipBar.total && passed >= shipBar.min_pass
       && (!no_critical_fail || criticalFails === 0)
       && bSeriesFails === 0
       && suspectCount === 0                        // NEW gate
note: suspectCount>0 → `${suspectCount} suspect: re-judge/resolve` (takes precedence in the note)
```

`ScoreResult` gains `suspectCount`. `finalizeResults` (`results.ts`) builds the
score input as `{ id, verdict: override ?? judge_verdict, suspect: suspect && override == null }`
— so an **override resolves** a suspect scenario (the human looked at it) and it
rejoins scoring. `effectiveVerdicts` is extended to carry `suspect` accordingly.

`ScenarioResult` (schema 2, optional additions): `reps?: number`, `passes?: number`,
`flakiness?: number`. `schema` stays `2`; a file without these reads as N=1
(`reps` undefined ⇒ 1, `flakiness` undefined ⇒ 0). `readResults`/`migrateResults`
unchanged (new fields are additive).

## Journal (`journal.ts`)

`judge-verdict` and `misfire-flag` events gain an optional `rep?: number` (0-based,
matching the `rep<k>` transcript suffix);
`run.ts` emits one `judge-verdict` per rep (and a `misfire-flag` per suspect rep).
The aggregate lives in `results.yaml`; no new event types. Events without `rep`
(N=1) are unchanged.

## CLI + UI

- `run` gains `--reps N` (default 1) and `--pass-threshold T` (default 0.5), parsed
  and passed as `reps`/`passThreshold`. HELP + README updated.
- `grade` (re-judge) stays single-rep — it re-judges saved transcripts.
- Review matrix: a reps cell shows the pass-rate + flakiness (`4/5 · flaky 0.40`);
  a suspect scenario shows a distinct `suspect` badge and its column renders
  `NOT READY — N suspect` (mirrors the server gate). `report.ts` threads
  `reps`/`passes`/`flakiness` into the client payload.

## Backward compatibility

- Default `--reps 1` + no `env`/`--parallel` ⇒ identical scheduling and, for
  non-suspect scenarios, identical `results.yaml` to M3.
- The only default-path behavior change is intentional: a misfire now blocks SHIP
  (M2 only flagged it). This is the milestone's point.
- Schema 2 unchanged for readers; reps fields optional.

## Testing

- **`grade.ts` detector:** well-formed items agreeing → not suspect; false-pass
  (verdict PASS, an item FAIL) → suspect; false-fail (verdict FAIL, all items PASS)
  → suspect; unparseable items → fail-open (not suspect); ERROR verdict → not suspect.
- **reps aggregation (pure fn):** unanimous pass/fail; majority at default 0.5
  (incl. tie passes); custom threshold 0.8 rejecting 3/5; all-suspect → suspect;
  minority-suspect → not suspect, clean-only pass-rate; flakiness values.
- **`score`:** suspect excluded from pass/total; `suspectCount>0` ⇒ `ship=false` +
  note; override resolves suspect (rejoins, ship recomputes).
- **`spec.ts`:** `reps`/`pass_threshold` parse + validation errors.
- **golden (N=1):** results.yaml byte-identical to M3 for a non-suspect run;
  a seeded/greeting run still SHIPs.
- **CLI:** `--reps`/`--pass-threshold` reach `runSkillModel`; help shows them.

## Non-goals (M4)

- Judge panels / multi-vote judging (the detector + reps cover the need).
- Auto-re-judge of suspect scenarios (manual re-judge or override resolves).
- Trends dashboard / flakiness-over-time UI (M5).
- Per-provider rate caps, watch mode (unchanged M-later non-goals).
