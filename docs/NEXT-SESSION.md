# Next session — start here

*Written 2026-08-09, at the close of the 0.7.0 release session. Read this before
`docs/ROADMAP.md`: the roadmap says where the project is going, this says what is
half-finished and what will bite you.*

## Where things stand

`skill-harness@0.7.0` is **published, merged, and tagged** (`v0.7.0`, PRs #43 + #44).
CI is green. 1123 tests. Working tree is clean.

0.7.0 shipped five capabilities in one minor — `capture`, `assert.trace`,
`require_subagents`, `coverage`/`affected`, adjudication — plus the change that made
the trace gates actually gate: **an objective FAIL/ERROR now outranks the judge** in
`effectiveVerdicts`. Before that, `objective` was written into `results.yaml` and
never scored, so a critical scenario in which the model called a forbidden tool
graded 100% and SHIPped. If you touch scoring, that ordering is the invariant to
protect: `override ?? objective ?? judge_verdict`.

## Open work, in the order I would do it

### 1. `runStructured` has no automated test — the largest coverage gap

`packages/adapters/src/pi.ts` (`runStructured`, ~75 lines) and all of
`packages/adapters/src/pi-json.ts` have **no test that imports them**. Every trace
test above them runs against a fake adapter that hand-writes trace objects, and
`pi-json-contract.test.ts` only reads the fixture files — it never executes the
module. The only thing that covers the real path is `./scripts/smoke-real-pi.sh`,
which spends money and must be run by hand.

One sharp edge to fix while you are in there: the stdout prefilter test I added
re-declares `SKIPPED_TYPE_RE` as a **copy** of the regex in `pi-json.ts` rather than
importing it. It therefore pins the assumption (pi puts `type` first in every event)
but would not catch someone editing the real regex. Import the real one.

Close it with `vi.mock("node:child_process")` and a fake spawn emitting a canned
JSONL stream — the fixtures already exist in
`packages/adapters/test/fixtures/pi-json/`. Assert: argv contains `--mode json` and
the right session flags per turn; a stream with no terminal event throws rather than
returning an empty trace; and `runStructured`'s transcript is byte-identical to
`run()`'s for the same turns (the docstring claims parity and nothing checks it).

This is free, and it is the last thing standing between the release path and being
verifiable in CI.

### 2. `principal-pi-skills` — 123 paid re-runs are pending

Sister repo. `gitops-safety` is **merged into `main`**; everything below is landed.

- `covers` is declared on all 98 scenarios (free).
- `reps: 3` is pinned on all 98 (free) — this staled the `policy:` facet, which
  `rescore` cleared across 12 run dirs with **zero verdicts moved**. The diff was
  `policy:` hashes and `harness_version` only.
- **What remains, measured on `main` at 2026-08-09: 56 `re-run` + 1 `re-grade`.**
  The re-runs come from the agent renames to `principal-*` and the debug contract
  edit — not from anything in 0.7.0. They spend subject tokens and need a
  deliberate, budgeted wave. Re-measure before planning it; this number has moved
  twice already.

Still unadopted there, both deferred on purpose and both still the right call:
- **`assert.trace`** — needs a real captured `.trace.jsonl` to verify tool names
  against. A gate that silently never fires is worse than no gate.
- **`require_subagents`** — needs pi-mono's subagent extension vendored into
  `.pi/extensions/`. That is a decision about carrying someone else's code, not a
  mechanical step.

⚠️ **A parallel session has been writing that repo.** It committed my working-tree
`covers` edits as `89bb442`, then merged `gitops-safety` to `main` and carried on.
Fetch and read the log before editing — and check whether one is still running, or
you will both be writing the same files.

### 3. Phase 2 distribution

Untouched, deliberately last, at the owner's call. See `docs/ROADMAP.md`.

## Things that will bite you

- **The pi-extension bundle is committed.** `packages/pi-extension/dist/index.js` is
  an esbuild artifact under version control. Run `npm run build:ext` and commit it
  whenever bundled core/cli source changes; `bundle.test.ts` fails if it goes stale.
  Never add pi-extension to an emitting `tsc -b` — that clobbers the bundle.
- **`pi -p` hangs** unless stdin is `/dev/null`. Silent timeout, looks like a slow
  model.
- **CI has no `pi` on PATH.** A test that shells out to the adapter passes locally
  and fails there. This already happened once: an argument-validation test was
  ordered behind the PATH probe. Run the suite against a PATH without `pi` before
  trusting it.
- **`gh` needs an account switch** for PRs on these repos: `gh auth switch --user
  mojomanyana`, then switch back to `mojo-cosmic` when done.
- **Digest facets decide cost.** `stimulus:` → `run` (spends), `rubric:` → `grade`,
  `policy:` → `rescore` (free), `gates:` → `regate` (free). `covers` is in **no**
  digest by construction. Before any spec-wide edit, measure lint before and after on
  the same tree — an edit that moves `stimulus:` bills a full board.
- **`docs/posts/` drafts no longer claim version numbers.** Five of them used to
  announce 0.7.0–0.11.0 for features that all shipped in one release. Don't
  reintroduce per-post versions.

## What was removed this session, and why

Ten completed milestone plans and nine specs under `docs/superpowers/` (~10,000
lines, July M1–M7a, init-suggest, rebrand-publish). Every one described shipped,
published work while carrying 26–41 **unchecked** boxes and zero checked — so an
agent reading `milestone-6.md` would conclude the pi extension does not exist. It
does; it is published. Git history keeps them.

Kept: `2026-08-07-pi-native-regression-capture-program.md` (live-referenced, and its
checklist is the record of the work just finished), and the dated investigation docs
under `docs/`, which are the evidence behind published posts.
