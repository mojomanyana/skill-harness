# Force-mode runs are scored — 0.5.0

Written 2026-08-06 by the skill-harness agent, for the owner of `principal-pi-skills`.
That repo is read-only from here, so this is a note rather than a set of commits.

**Released in `skill-harness` 0.5.0** (npm: `skill-harness@0.5.0`,
`@skill-harness/{core,adapters,cli}@0.5.0`; tag `v0.5.0`). Item 0b of the addendum, plus
the item 0 fix set.

## What you asked for, and what shipped

`results.ts` no longer hard-codes `mode=green` as the only scored mode. **`green` and
`force` are both scored; `red` remains the unscored control.** Scored directly — no spec
key, no `--score-force` flag. Rationale, so you can reject it consciously: "was the skill
in front of the model?" is a property of the mode, not a per-repo preference, and a flag
would be one more thing to remember on every invocation (the failure mode this repo has
already been bitten by twice, with the judge default and with `--skills .`). There is also
no third-party consumer whose green-only default needed preserving.

## What to do, and what it costs

```bash
npx skill-harness@0.5.0 rescore <run-dir> [<run-dir> ...]
```

Free, offline, no judge, no model. Every `rescore` recomputes `effective_grade` under the
current policy, so the ten `release-2-force` run dirs stop reading `not scored` and become
real scorecards. Expect `(no verdict changed)` on all ten — no threshold moved; the grade
is what was missing. Then commit the ten `results.yaml` files and the manifest edit.

Two things to know before you run it:

1. **`lint` will report those ten runs first.** A pre-0.5.0 force run's placeholder grade
   disagrees with a 0.5.0 recompute, so you get
   `consistency — results.yaml effective_grade is stale in <dir> (recompute differs) —
   re-apply the current scoring policy: rescore (free, offline)`.
   That finding is the prompt for the command above, and it clears when you run it.
2. **Bump the CI pin to `v0.5.0` in the same PR as the rescored results.** The standing
   rule holds: a `results.yaml` written by version X needs version ≥ X to lint. Your pin
   is `.github/workflows/ci.yml:32`.

## Everything else that force runs can now do

These were all broken for force runs, not just scoring — a force run's artifacts are
`<id>.force.txt` / `<id>.force.diff.txt`, and every re-decision path looked for green ones:

| command | before | now |
|---|---|---|
| `grade <run-dir>` | `no green transcripts … nothing to re-grade` | re-judges the run's own mode; a force run comes back scored |
| `regate <run-dir>` | `no staged-diff artifact on disk` | reads `.force.diff.txt`; needle fixes cost judge calls only |
| review UI re-judge | `400 only green runs can be re-judged` | works for green and force; red still refused there (use `grade`) |
| `rescore` | wrote the placeholder back | writes the real grade |

A red baseline is also re-gradable now (`grade` on a red run dir), and stays unscored. If
you ever want to tighten a red baseline's verdicts to feed lift, that is the free way.

## Lift, and the thing you should not do

`collectLift` takes the **newest scored run** in a tag as the skill side, so red-vs-force
is a first-class lift — a red baseline is `--no-skills` whatever the mode, so the
comparison is as valid as red-vs-green ever was, and `Lift.mode` records which delivery it
measured. Your tags holding both a release-1 green run and a release-2 force run will
report the force one.

The field names are still `greenPassed` / `greenTimestamp` / `cells[].green`. They mean
"the skill-active side"; renaming them would break every committed report asset to say
something `mode` already says.

**What not to do: do not put green-epoch and force-epoch numbers in one series or one
claim.** Your own measurement is the argument — identical skill text, `build` A1 0/3 →
3/3 and `plan` C2 3/3 → 0/3, both directions at once. The harness now enforces the split
where it renders history (`trends` gives one series per mode, labelled), but a scorecard
table in a markdown file is yours to keep honest. If `RESULTS-MANIFEST.md` presents a
release-2 scorecard, saying "delivery: skill-as-system-prompt (`--mode force`), pi 0.83.0"
next to it is now cheap: every 0.5.0 run records `harness_cli_version`, and the ten
existing runs will not have it (they predate the field — `rescore` will not invent one).

## The delivery hole itself

Fixed as far as it can be fixed from this side:

- **The adapter refuses a skill dir with no `SKILL.md`**, in green *and* force, before
  exec. pi 0.83.0 takes `--skill /nonexistent` with exit 0 and a normal answer; that path
  can no longer produce a run at all.
- **`discover()` returns absolute paths.** It was building `join(root, name)` — relative
  under `--skills .` — and handing it to a child process running in a different cwd. Your
  invocation style is what made this reachable.
- **`harness_cli_version`** (`pi --version`) is recorded next to `harness_version` on
  every new run.
- **`run --canary`** (green only, off by default, one extra subject call): the model is
  asked to quote the `## ` headings of its own instructions, and the run aborts before the
  wave if they don't come back. It anchors on the longest heading and never on
  frontmatter, since the description is always in context under progressive disclosure.
  **Honest limit:** it proves the body is *reachable* in that invocation. It cannot prove
  the model loaded it on every later turn — under disclosure that is the model's choice —
  which is why the docs point at `--mode force` rather than presenting the canary as
  equivalent.
- Green runs without a canary print a `NOTE:` on the scorecard naming the
  version-dependence and both remedies. The default mode is still `green`; flipping the
  default was not in the addendum's ask, and your corpus passes `--mode force` explicitly.

## Also in 0.5.0, found while working on it

- The review UI's `/rejudge` was **dropping `source_hashes` and `partial`** when it wrote
  results — silently retiring the staleness gate for any run re-judged from the browser.
  Both are carried now, with the one `rubric:` key that re-judge actually applied
  refreshed (the same doctrine `grade` follows).
- `grade` re-judges `--reps N` runs (has since 0.3.x) — `README.md` still claimed it
  refused them. Corrected.
- The pi extension's flag parser silently dropped valueless flags, so a bare `--canary`
  would have been accepted and ignored. Bare flags now register; a valueless `--model` /
  `--mode` / `--judge` falls back to the default instead of passing `""` down.

## Verification

The 0b workflow was rehearsed against your own data without writing to your repo: one
`release-2-force` run dir (`plan`, glm-5p2, `2026-08-05T13-46-47Z`) was copied to a
scratch tree and rescored with the built CLI. `mode=force (not scored)` became
**`B (83%) 10/12 NOT READY`** with `0 verdict(s) moved`, `label: release-2-force` intact,
and no `harness_cli_version` invented for a run that predates the field. `lint` on the
copy reported one `consistency … rescore (free, offline)` finding per unscored force run,
and none afterwards. (The two `A2`/`C2` FAILs are what gate it — `gated: 2 critical
fails`.) Expect the same shape for the other nine.

`npm ci && npm run build && npm run build:ext && npm test` — 632 tests pass;
`npm run typecheck` clean; `lint all` against the golden fixture reports 0 findings. The
force-epoch behavior has its own suites: `packages/core/test/force-scoring.test.ts` (the
scoring policy, the rescore/grade/regate/lint/lift paths) and
`packages/core/test/canary.test.ts` (the probe, the abort-before-spend, the version
record). Full detail in `PUBLISHING.md`'s 0.5.0 section.
