# skill-check v2 — framework extraction design

Date: 2026-07-03 · Status: approved (design), pending implementation plan
Decided with: alavanja (options selected via structured Q&A; approach A approved)

## Goal

Evolve `skill-check` from a single-purpose CLI into a reusable skill-testing **framework**
usable three ways with identical semantics:

1. **CLI** — the current flow, preserved throughout (`run` / `grade` / `review` /
   `add-test` / `list`).
2. **pi extension** — run, judge, monitor, and debug skills from inside a pi session,
   including subagent-based validation and a live edit→validate loop.
3. **CI** — GitHub Actions integration with free checks on every PR and manually
   triggered model runs.

Skill tests remain in each skill's own folder (`<skill>/tests/specification.yaml` +
`fixtures/`); only framework machinery lives in this repo.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Packaging | Evolve this repo into a workspace monorepo (keep history, CLI keeps working) |
| Architecture | Library-first: pure `core`, thin consumers (approach A) |
| CI judge | Two-stage: CI executes scenarios + objective gates only; judging runs locally on the Claude subscription (`claude-cli` judge). No metered judge tokens, no OAuth secrets in CI. |
| CI model runs | Manual trigger only (`workflow_dispatch` / PR comment). Free checks (lint, results-consistency) on every PR. |
| Subagent validation | Sandboxed workspace per scenario + parallel fan-out + live in-session validation. (Judge *panel* not in v1; misfire detector covers that need cheaper.) |
| Monitoring v1 | Run journal + trends/flakiness (N-reps), transcript inspector + re-judge + audited recomputing overrides, judge-misfire auto-detector. Watch mode deferred. |

## Package layout

```
skill-check/
  packages/core/          # pure TS: spec parse/lint, plan, execute, gate, judge,
                          # consistency-check, score, persist; adapter interfaces
  packages/adapters/      # pi-cli harness · claude-cli judge · sandbox workspace
  packages/cli/           # existing commands + `lint`, `trends`, `judge --from-run`
  packages/pi-extension/  # slash commands + skill_check_run tool (+ SKILL.md front door)
  packages/ui/            # review UI grown into journal console (local, on-demand)
  action/                 # composite GitHub Action + reusable workflow
```

`core` has no CLI/pi/UI imports. Every consumer calls the same pipeline:
`discover → lint → plan → execute → gate → judge → consistency-check → score → persist`.

## Data contracts

### specification.yaml — backward compatible; three optional additions
- `env:` per scenario — `workspace: none | empty-git | fixture:<path>`. Conversational
  scenarios can declare the workspace they assume (empty repo for git ops, seeded codebase
  for planning), eliminating no-repo judge artifacts at the root.
- `reps:` per scenario, or `--reps N` per run — scenario result becomes a pass-rate;
  a scenario passes at a configurable threshold (default majority); each scenario gets a
  flakiness index.
- Run `label:` (e.g. `round-3`) — recorded in results; ends timestamp-dir archaeology.

### Run artifacts
- `journal.jsonl` — machine-facing event stream (scenario-started, turn, gate-result,
  judge-verdict, misfire-flag, override, score). UI/trends/debugging read only this.
- `results.yaml` **schema 2** — human/git-facing summary:
  - `effective_grade` always computed override-aware (stale-grade class structurally
    impossible);
  - overrides require a `note` and auto-preserve that scenario's transcript
    (un-gitignored) for auditability;
  - `label`, `judge` identity, `suspect` flags recorded.
  - Schema 1 files remain readable (read-only migration).

### Misfire detector (core)
After every judge call: parse per-checklist-item PASS/FAIL from the judge output; assert
verdict == AND(items). Mismatch → scenario marked `suspect`, excluded from the ship bar
until re-judged or human-resolved (configurable). Encodes the observed ~2% misfire class
(always FAIL-verdict-with-passing-reason).

## Adapter interfaces

- **Harness** — `run(scenario, workspace) → transcript`. v1: `pi-cli` child-process driver
  (current behavior, kept). pi `--mode rpc` is a later optimization, not a dependency.
- **Judge** — `judge(prompt) → raw`. v1: `pi-cli` (any provider:model) and `claude-cli`
  (subscription OAuth; promotes this session's patch to a supported adapter). The
  judge-resembles-subject guard stays.
- **Workspace** — `create(scenario) → cwd` (isolated temp dir, `--no-context-files`,
  optional `empty-git` init or fixture copy + git init — generalizes `seeded.ts`),
  teardown after. Child processes never see the user's home directory.
- **Scheduler** (core) — concurrency pool (default ~4, configurable) with per-provider
  rate-limit knob; identical for CLI `--parallel` and extension fan-out.

## pi extension

- `/skill-check run [skill] [--model …] [--reps N]` — resolve skill from cwd/arg, run
  affected scenarios (fan-out, sandboxed), stream verdicts into the session, end with
  scorecard + failed-transcript paths.
- `/skill-check judge [run-dir]` — (re)judge with the configured judge.
- `/skill-check review` — open the UI.
- `skill_check_run` **tool** exposed to the model — enables "validate the skill you just
  edited" inside a session; the session orchestrates child pi processes as test subjects.
- The conversational SKILL.md front door ships alongside for agents without the extension.
- Install: `pi install git:github.com/mojomanyana/skill-check`.

## CI (two-stage)

- **Every PR (free):** `skill-check lint` — spec schema, ship_bar totals vs scenario
  counts, critical-id existence, checklist YAML traps, fixture compilation, and
  results-consistency (effective grade matches verdicts+overrides; overrides carry note +
  transcript). These mirror real defect classes found in review.
- **Manual (`workflow_dispatch` / PR comment):** stage 1 runs scenarios + objective gates
  with the `FIREWORKS_API_KEY` secret; uploads the run dir (journal + transcripts) as an
  artifact; posts a PR comment with objective results + "awaiting judge".
- **Local stage 2:** `skill-check judge --from-run <artifact-url|zip>` downloads, judges
  on subscription, writes results, optionally posts the final scorecard to the PR.

## Monitoring / UI

Local on-demand server (no daemon), journal-driven:
- run browser + transcript inspector (transcript, gates, judge raw output);
- misfire queue with one-click re-judge or audited override (note required, transcript
  preserved, effective grade recomputed live);
- trends: grade per skill×model across labeled runs; per-scenario flakiness index.

## Migration path (CLI green at every step)

1. Workspace restructure; `src/` → `core` + `cli`, zero behavior change, locked by golden
   tests (same commands ⇒ same results.yaml on a fixture skill). Commit the claude-cli
   judge patch as part of this step.
2. Results v2 + journal + override-aware scoring (schema-1 read support).
3. Workspace sandboxing + `env:`; fan-out scheduler.
4. Misfire detector + reps/flakiness.
5. UI: inspector, misfire queue, re-judge, trends.
6. pi-extension package.
7. `action/` + docs. Consumer repos add one workflow file; their `tests/` folders are
   unchanged.

## Non-goals (v1)

- Judge panels / multi-vote judging (misfire detector + re-judge covers the need).
- Watch mode (edit → auto-rerun) — later milestone.
- A long-running daemon — the UI stays on-demand; the journal leaves the door open.
- Harnesses other than pi for *running* scenarios (claude-cli is judge-only in v1).

## Risks

- **pi extension API surface** — verify tool/slash-command registration + streaming
  output against pi's extension docs at implementation start; fall back to
  prompt-template + CLI if a capability is missing.
- **Fireworks rate limits under fan-out** — scheduler ships with a conservative default
  and a per-provider cap.
- **Misfire parser brittleness** — judges vary in formatting; the consistency check must
  fail open (no `suspect` flag) when per-item lines can't be parsed, never block a run.
