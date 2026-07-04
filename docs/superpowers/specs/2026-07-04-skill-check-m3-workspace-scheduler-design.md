# skill-check v2 — Milestone 3 design: workspace sandboxing + `env:` + fan-out scheduler

Date: 2026-07-04 · Status: approved (design) · Decided with: alavanja

Refines the M3 row of the master design
(`docs/superpowers/specs/2026-07-03-skill-check-framework-design.md`) into locked
implementation decisions. Builds on M1 (workspace monorepo) and M2 (results
schema 2 + journal + override-aware scoring), both merged to `main`.

## Goal

Give every scenario an isolated, disposable working directory (no shared `/tmp`,
no home-dir bleed), declared per-scenario via `env:`, and let runs fan out across
scenarios through a bounded concurrency pool — **opt-in**, default sequential.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Parallelism default | **Opt-in**: `--parallel N` on `run`, default `N=1` (byte-identical to today's sequential loop). |
| Scheduler scope | Scenario-level tasks within a `runSkillModel` call; the same pool later serves extension fan-out (M6). |
| `env:` default | `none` when unspecified. A `mode: seeded` scenario with a `fixture:` is sugar for `env: { workspace: fixture:<that fixture> }` — existing seeded scenarios need zero edits. |
| Seeded boundary | `seeded.ts` delegates **cwd creation** to `workspace.ts`; it keeps its gate evaluation (vitest / `diff_contains`). Gates are NOT absorbed into the workspace layer. |
| Rate limiting | Global cap via `--parallel N` for M3. Per-provider cap deferred (low risk while parallelism is opt-in). |
| Isolation | Every scenario gets a fresh temp-dir cwd; child processes never see the user's home. `none` replaces the shared `NEUTRAL_CWD`. |

## Architecture

Approach A (library-first) unchanged: all logic in `@skill-check/core`; CLI stays
thin. Two new core modules, one refactor:

```
packages/core/src/
  workspace.ts   # NEW: createWorkspace(kind) → { cwd, cleanup() }; per-scenario isolation
  scheduler.ts   # NEW: runPool(tasks, concurrency) → results (order-preserved)
  run.ts         # each scenario becomes a task; tasks run through the pool
  seeded.ts      # delegates cwd creation to workspace.ts; keeps gate evaluation
  spec.ts        # parses/validates optional `env:`
```

## Workspace adapter (`workspace.ts`)

```ts
export type WorkspaceKind = "none" | "empty-git" | { fixture: string };

export interface Workspace {
  cwd: string;       // absolute path to the isolated temp dir
  cleanup(): void;   // rmSync the temp dir; safe to call once, always called
}

export function createWorkspace(kind: WorkspaceKind, opts: { specDir: string }): Workspace;
```

- **`none`** — `mkdtemp` an empty temp dir. Replaces the shared `NEUTRAL_CWD`
  (`/tmp`) so scenarios never share state and the child never runs in the user's
  home. No git.
- **`empty-git`** — temp dir + `git init -q` + a baseline commit (empty tree), for
  scenarios that exercise git operations from a clean repo.
- **`{ fixture: <path> }`** — copy the fixture (resolved against `specDir`, matching
  today's `seeded.ts` resolution) into the temp dir + `git init` + baseline commit.
  This is exactly what `seeded.ts` does today, generalized.
- **`cleanup()`** — `rmSync(cwd, { recursive: true, force: true })`. `run.ts` calls
  it in a `finally` per scenario so a thrown harness/judge error still tears down.

Git identity uses the same inline `-c user.email=… -c user.name=…` as `seeded.ts`.
A missing fixture returns a workspace whose creation is reported as a gate-style
failure by the caller (seeded path), preserving today's "fixture missing → FAIL"
behavior.

## `env:` contract (`spec.ts`)

Optional per-scenario field, backward compatible:

```yaml
scenarios:
  - id: G1
    title: init a repo
    env: { workspace: empty-git }      # none | empty-git | fixture:<path>
    turns: [...]
    checklist: [...]
```

- Absent `env:` → `workspace: none`.
- `workspace: fixture:<path>` → `{ fixture: "<path>" }` (path resolved against the
  spec dir, like seeded fixtures).
- A `mode: seeded` scenario with a `fixture:` and no explicit `env:` resolves to
  `{ workspace: { fixture: <that fixture> } }` — **existing seeded scenarios keep
  working unchanged**.
- Validation in `parseSpec`: `workspace` must be `none`, `empty-git`, or
  `fixture:<non-empty path>`; a bad value throws a `SpecError` naming the scenario.

Parsed shape on `Scenario`: `workspace: WorkspaceKind` (always populated after
parse — defaulted to `"none"`), so `run.ts` never re-derives the default.

## Scheduler (`scheduler.ts`)

```ts
/** Run tasks with at most `concurrency` in flight; results in input order. */
export function runPool<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]>;
```

- `concurrency <= 1` → runs tasks strictly in sequence (deterministic, identical
  to today).
- `concurrency > 1` → at most N task thunks active at once; results returned in the
  original task order regardless of completion order.
- A task that throws rejects the whole `runPool` (fail-fast), matching today's
  sequential loop, which also aborts the run on a thrown error. This is
  acceptable because the judge never throws on a bad grade — `gradeTranscript`
  already returns an `ERROR` verdict for unparseable/provider-error output — so a
  rejection means an infrastructure fault (e.g. workspace creation or harness
  spawn), not a per-scenario verdict. Each task's `cleanup()` runs in a `finally`,
  so a fault still tears its workspace down before the run aborts.

## `run.ts` integration

- `RunOptions` gains `concurrency?: number` (default `1`).
- Each scenario's work — create workspace → `produceTranscript` (harness or seeded
  gates, now inside the workspace cwd) → judge → build `ScenarioResult` → emit
  `journal` events → `cleanup()` — becomes a task thunk.
- `runPool(tasks, concurrency)` produces `ScenarioResult[]` in spec order; scoring
  and `writeResults` are unchanged (they already take the ordered array).
- Journal remains append-only. Concurrent scenarios interleave lines, but each
  `appendJournal` writes one whole line and every event carries `id`+`ts`, so a
  consumer reconstructs per-scenario order. `run-started` is emitted before the
  pool; `score` after.
- Progress logs are prefixed with the scenario id (lines interleave at N>1).
- The neutral-cwd constant is removed from the harness call path; the harness/judge
  run in the scenario's workspace cwd. The judge (no skills, no repo needed) runs
  in the same isolated cwd.

## CLI

- `run` gains `--parallel N` (default `1`), parsed to `concurrency` and passed to
  `runSkillModel`. `grade` stays sequential (it re-judges saved transcripts; cheap,
  order-stable, and journaling a re-grade wave benefits from determinism).
- HELP updated; README `run` section documents `--parallel` and `env:`.

## Backward compatibility

- Default `--parallel 1` ⇒ same scheduling as today.
- `none` workspace is a fresh temp dir rather than the shared `/tmp` — strictly
  better isolation; the only observable change is that scenarios no longer share a
  cwd (they never should have relied on that).
- Seeded scenarios: identical behavior; only the cwd-creation code moves.
- Results/journal formats unchanged.

## Testing

- **`workspace.ts`**: `none` → empty dir exists, no `.git`; `empty-git` → `.git`
  present + a baseline commit; `fixture:<path>` → fixture files copied + git
  baseline; `cleanup()` removes the dir; double `cleanup()` is safe.
- **`scheduler.ts`**: results returned in input order under out-of-order
  completion; a max-in-flight probe never exceeds `concurrency`; `concurrency=1`
  runs strictly sequentially; a throwing task rejects `runPool`.
- **`run.ts` (golden)**: a `--parallel 2` run over the fake adapter yields a
  results.yaml byte-identical to the sequential run (determinism), and no temp
  dirs survive after the run (cleanup verified).
- **`spec.ts`**: `env:` parse + validation (each kind + a bad value throwing);
  seeded back-compat (a `mode: seeded` + `fixture:` scenario parses to a
  `fixture:` workspace with no explicit `env:`).

## Non-goals (M3)

- Per-provider rate-limit caps (global `--parallel` suffices while opt-in).
- Watch mode; pi `--mode rpc`.
- Parallelism across skills/models at the CLI top level (scenario-level fan-out is
  the M3 win; top-level fan-out can layer on the same pool later without a format
  change).
