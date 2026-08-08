# Publishing skill-harness (0.7.0)

This is the npm-publish runbook.

The registry has `0.1.0`, `0.1.1`, `0.1.2`, `0.2.1`, `0.3.0`, `0.3.1`, `0.3.2`, `0.4.0`,
`0.5.0`, `0.6.0`. This repo is at `0.7.0`, so these commands publish a **new version over
an existing line** — the `@skill-harness` scope is already claimed, and `latest` moves to
0.7.0 as each package lands.

**0.7.0 takes the minor: five new capabilities, and one change to what a verdict means.**

Read the last bullet before upgrading — it is the only one that can move a number on
results you already have.

- **`capture`** (pi extension only, `/skill-harness capture`) — promote a live pi
  conversation into a regression case. Interactive by design: it refuses to run without a
  session and the interview primitives, because preview-before-write is what keeps secrets
  out of committed files. Never a CLI command, never headless, not free.
- **`assert.trace`** — objective gates over a structured record of what the model actually
  did: `require_calls`, `forbid_calls`, `require_subagents`, `unchanged_paths`. Evaluated
  before the judge, so a failing gate costs zero judge tokens.
- **Orchestration assertions** — `require_subagents` tests the parent's delegation
  (selection, handoff content, and what the handoff must NOT carry), not just the
  subagent.
- **`coverage` and `affected`** — which instruction sections have no test, and which
  scenarios a diff could plausibly affect. Both free and offline. `affected` resolves every
  ambiguity toward selecting MORE, and an affected run never reports SHIP.
- **Adjudication (`--auto-rejudge`)** — a second (and optionally third) judge on cells that
  are ambiguous, self-contradictory, non-unanimous across reps, or ship-deciding. Spend is
  disclosed as an exact call-count ceiling before anything is bought, and an unresolved
  disagreement blocks SHIP rather than resolving itself.

**The one behavioural change: an objective gate now outranks the judge.**
`effectiveVerdicts` returns `override ?? objective ?? judge_verdict`, where an objective
FAIL forces FAIL and an objective ERROR (evidence missing) forces ERROR. An explicit
author override still wins.

Previously `objective` was recorded in `results.yaml` but never scored — it reached the
ship decision only through a single rep's gate prefix, so `--reps N` out-voted it,
`grade` re-judged past it, and `regate` recomputed it away. A critical scenario in which
the model called a forbidden tool scored 100%, grade A, SHIP.

*Consequence for existing results:* a committed `results.yaml` carrying
`objective: {status: FAIL|ERROR}` beside a PASS verdict will now score differently — that
is the fix, not a regression. Scenarios that declared no trace assertions carry no
`objective` at all and are completely unaffected, which is every result produced before
this release.

**Also in this release, and worth knowing if you rely on the artifacts:**

- **Execution trace format v2.** `changed_paths` is tri-state: `null` means the workspace
  was never observed, `[]` means observed and unchanged. A v1 reader must decline a v2
  trace. Nothing in any corpus has committed traces (`*.jsonl` is gitignored), so no
  stored data is invalidated.
- **`unchanged_paths` is observed by content snapshot**, taken before the model runs and
  diffed after — so it sees `.gitignore`d files (it previously could not see `.env`, the
  canonical case) and does not attribute a fixture's own `_staged/`/`_uncommitted/` trees
  to the model.
- **`delivery_canary` gains `"skipped"`.** A `--canary` that was asked for but could not
  run is now recorded, rather than leaving a `results.yaml` identical to one where
  delivery was never checked.
- **Trace artifacts are fully redacted** — tool `details` and the model's `final_text`
  included, plus credentials embedded in URLs.
- `results.yaml` field ORDER is unchanged from `outcomesToResult`; rewrites no longer
  produce noise diffs.

**Consumer checklist for this release:**

1. `lint all --skills <root>` before and after upgrading — output should be identical.
   Verified against the reference corpus: byte-identical, 62 findings either side.
2. If any committed result carries an `objective` block, re-read its grade: a gate that
   was being ignored is now enforced.
3. `assert.trace.unchanged_paths` requires a workspace (`env.workspace: empty-git` or a
   fixture). The spec parser refuses the combination offline, before any spend.
4. Bump the pin to `v0.7.0` when you want the notes (`.github/workflows/ci.yml`).

### 0.6.0, kept for context

**0.6.0 takes the minor: a new command, a new `lint` code, and a new severity concept.**
Nothing about a verdict, a grade or `results.yaml` changed — this release only *reads*.

- **New command `stability <skill|all>`** — run-over-run verdict flips per scenario ×
  model tag × delivery mode, derived from committed history. Free and offline (no model,
  no judge, no harness), and it exits 0 whatever it finds.
- **`lint` gains `info` findings, and its exit code now counts only gate-failing ones.**
  `LintFinding` gains an optional `severity` (absent = `error`, so every existing code
  behaves exactly as before) and a new code `stability` carries `severity: "info"`.
  Consequences for a consumer: `lint` prints `ℹ` lines and `::notice` annotations it did
  not print before, the summary line reads `N finding(s), M note(s) (do not fail the
  gate)`, and **a repo whose CI failed only because of stability notes would now pass** —
  which cannot happen in practice, since the code is new. Anything parsing lint output
  should key on `severity`/the `✗` vs `ℹ` prefix rather than on line count.
- **`collectTrends` is unchanged in shape**, but its history walk moved into a new
  exported `collectScoredRuns` (one walker, shared with stability). `TrendData` is
  byte-identical for the same tree.
- **`RunColumn.cells[id]` gains an optional `stability`** object (flips, compared,
  volatility, note) — present only on cells that flipped. Additive; the review UI reads
  it for a `⇄` marker and tooltip.
- **`formatScorecard(summary, lift?, stability?)`** takes a third optional argument. Old
  two-argument calls behave as before.
- No `results.yaml` change at all: stability is derived on read, never stored, so it works
  retroactively on history recorded by every earlier version.

**Consumer checklist for this release:**

1. Bump the pin to `v0.6.0` when you want the notes (`.github/workflows/ci.yml`).
2. Run `stability <skill> --skills <root>` once over the existing corpus — it costs
   nothing and needs no new runs.
3. Do not "fix" a boundary-cell note. The remedy is `--reps N` on that scenario, or an
   override with a note once you have decided which side is right.

### 0.5.0, kept for context

**0.5.0 took the minor: a mode that was never scored now scores, so committed numbers
change.** Nothing about a *verdict* changed; what changed is which runs get a grade.

- **`force` runs are scored.** `green` and `force` both deliver the skill, so both are
  graded against the ship bar; `red` remains the unscored control. Every force run
  recorded by ≤ 0.4.x carries an `effective_grade` placeholder (`mode=force (not
  scored)`) that a 0.5.0 recompute disagrees with, so **`lint` reports one
  `consistency — effective_grade is stale` finding per such run** until they are
  re-scored. `rescore <run-dir>` fixes it: free, offline, no judge, no model.
- **`grade` / `regate` / the review UI's re-judge now read the run's OWN mode's
  artifacts** (`<id>.force.txt`, `<id>.force.diff.txt`) instead of assuming green. A
  force or red run that previously failed with "nothing to re-grade" now works — and a
  red run re-graded this way stays unscored.
- **`results.yaml` gains two optional fields.** `harness_cli_version` (what `pi
  --version` said) and `delivery_canary: pass` (green + `--canary` only). Older readers
  ignore unknown top-level keys, but the standing rule still applies: *a `results.yaml`
  written by version X needs version ≥ X to lint.*
- **`trends` splits a model tag by mode.** `TrendModel` gains `mode`, and a tag holding
  both green and force history yields two series instead of one pooled sparkline.
  Anything consuming `/trends` JSON by index needs to key on `mode` as well as `tag`.
- **`Lift` gains `mode`, and its skill side is the newest scored run** (green *or*
  force) rather than the newest green one. A corpus that moved to force delivery gets
  its lift back; a corpus with both sees the newer delivery. Field names (`greenPassed`,
  `greenTimestamp`, `cells[].green`) are unchanged on purpose — they mean "the
  skill-active side", and renaming them would break every published report asset.
- **The pi adapter refuses a skill dir with no `SKILL.md`** and resolves relative paths
  before exec. A run that used to silently measure a naked model (pi accepts a
  nonexistent `--skill` path with exit 0) now fails loudly at the first scenario.
  `discover()` also returns absolute `dir`/`specPath` now.
- **New flag `run --canary`** (green only): one probe proving the skill reached the
  model, aborting the run if it did not. Off by default — it costs a rep.
- **The pi extension's flag parser records bare flags.** `--canary` (and any future
  valueless flag) used to be dropped silently; a valueless `--model` / `--mode` /
  `--judge` still falls back to the default rather than passing `""` down.

**Consumer checklist for this release** (`principal-pi-skills` and anything else pinning):

1. Bump the pin (`.github/workflows/ci.yml`, the `ref:` on the skill-harness checkout)
   to `v0.5.0` in the same PR as any results produced by it.
2. `rescore` every committed force run once, in one commit, to convert the
   `not scored` placeholders into real grades — free, and it clears the new lint
   findings. Re-run nothing.
3. If a published scorecard mixes green-epoch and force-epoch numbers, split them: the
   same skill text scores differently under each delivery (measured: `build` A1 0/3 →
   3/3, `plan` C2 3/3 → 0/3).

### 0.4.0, kept for context

**0.4.0 took the minor, and consumers pinning an exact version must bump.** It changes
what `results.yaml` records and adds a `lint` finding, which are two of the three reasons
0.3.0 was a minor:

- **`source_hashes` gains four key kinds** and stops writing one. `scenario:<id>` (one
  digest over stimulus + rubric + policy + gates) is replaced by `stimulus:<id>`,
  `rubric:<id>`, `policy:<id>`, `gates:<id>` and a spec-level `rubric:__persona`. An
  older reader resolves unknown prefixed keys as "not comparable" — that forward-compat
  branch has been there since 0.3.0 — so **an older skill-harness will not false-flag a
  0.4.0 results file, but it also cannot check it**, and its coverage check silently
  stops applying. The rule stands: *a `results.yaml` written by version X needs version
  ≥ X to lint.*
- **A new `consistency` finding**: linting a tree whose records were written by a newer
  harness than the running one now reports it. A repo whose CI pins an old version and
  whose results are produced locally from a newer one will start failing — correctly,
  and that is the point.
- **`lint` messages changed shape.** A `stale` finding now names the cheapest honest
  remedy (`re-grade`, `rescore`, `regate`, or `re-run`) instead of always saying
  "re-run". Anything grepping those messages needs updating; the `code` values are
  unchanged.
- **A metered judge is refused** unless `--allow-metered-judge` /
  `SKILL_HARNESS_ALLOW_METERED_JUDGE` is set, and the default judge moved from
  `anthropic:claude-opus-4-8` to `claude-code:claude-opus-4-8` (Claude subscription).
  **This breaks any CI that relied on an ANTHROPIC_API_KEY judge by default** — add the
  flag, or set the env var, deliberately.
- **New command `regate`**, and `--version` / `-v`. `results.yaml` gains
  `harness_version`. Captured diffs no longer contain `node_modules/`, `coverage/` or
  `.vitest/`, so a `diff_contains` needle matching a test filename that used to pass for
  free will now correctly fail.

**Consumer checklist for this release** (`principal-pi-skills` and anything else pinning):

1. Bump the pin (`.github/workflows/ci.yml`, the `ref:` on the skill-harness checkout)
   to `v0.4.0` in the same PR as any results produced by it.
2. If CI judged with an API key by default, add `--allow-metered-judge` or switch to
   `claude-code:`.
3. Re-run nothing for correctness — no gate's *verdict* semantics changed. But note that
   pre-0.4.0 runs carry only legacy `scenario:` keys, so their lint remedy will say
   "re-run" where a 0.4.0 run would have said "re-grade"; a re-run converts that.

### 0.3.2, kept for context

0.3.2 was a patch: `computeLift` stopped comparing two verdicts produced by different
aggregations (a `--reps 1` baseline against a `--reps 3` green paired one draw with a
majority-of-3), and the review UI stopped claiming "no red baseline" when a baseline
existed but nothing in it was comparable.

### 0.3.1, kept for context

**0.3.1 was a patch and nobody on 0.3.0 was affected by the bugs it fixed.** Two
things changed:

- `computeLift` no longer compares mode-insensitive scenarios — the ones with
  `system_prompt_file`, which `pi` runs with `--no-skills --append-system-prompt`
  *whatever the mode*, so red and green were the same run. They were classed
  `kept`, which reads as evidence against the skill when the skill in fact
  produced that red-side pass, so every such scenario pushed lift **down**. It
  changes `lift` output, and `Lift` gains a required `modeInsensitive` field —
  additive for anything reading a `Lift`, breaking only for code constructing one
  as a literal. **Nobody can have hit this**: it needs a red-mode run on a spec with
  `system_prompt_file` scenarios. The only red baseline ever recorded is the
  two-scenario `golden-skill` fixture, and neither scenario uses that field.
- `@skill-harness/cli`'s `prepack` copies `assets/report.*` rather than all of
  `assets/`. A demo GIF landed in `assets/` after 0.3.0 was cut, which would have
  taken the cli tarball from 20.1 kB to 511 kB. **0.3.0's published tarball is
  unaffected** — it was packed before the GIF existed.

That release existed to stop the repo disagreeing with the registry, not because
anyone was broken.

### 0.3.0, kept for context

0.3.0 was a **behaviour-breaking release for CI consumers**, which is why it took
the minor rather than the patch: `lint` gained the `fixture-marker`,
`post_test`-existence and scenario-coverage checks (a repo that passed on 0.2.1
can fail on 0.3.0), `assert.diff_contains` now matches the diff's changed lines
rather than its raw text, and `source_hashes` records new key kinds that older
versions cannot read. Seeded results produced before 0.3.0 were graded without
the judge seeing the diff and need re-running, not re-grading.

## Prereq

```bash
npm login
```

You need an npm account with publish rights on the `@skill-harness` scope and on
the unscoped `skill-harness` name — the same account that published 0.1.x.

## Build first — this is not optional

`dist/` is **gitignored** (only `packages/pi-extension/dist/index.js` is
force-committed, and that one is never published). A fresh clone therefore has no
`dist` at all, and every publishable package ships `dist/**` as its entire
payload — so publishing without building first produces a tarball with no code in
it. Always run:

```bash
npm install
npm run build
git status --short     # expect clean: a dirty tree here means uncommitted source
```

## Smoke against real pi — before you publish

`npm test` is 1,000+ tests against fixtures and fake adapters, which is exactly
right for CI: fast, free, deterministic. But three code paths only exist when a
real process is on the other end, and no fake can exercise them — the streaming
JSONL reader in `runStructured`, the `--no-extensions --extension` argv the
harness passes to pi, and the live judge loop under `--auto-rejudge`.

```bash
./scripts/smoke-real-pi.sh          # SPENDS TOKENS: ~2 subject calls + 1–2 judge calls
```

One scenario exercises all three and asserts on the artifacts, not just the exit
code: trace version and `pi_version` recorded, the declared extension's `Agent`
tool actually present, no thinking / home paths / tool-result bodies persisted,
and adjudication having genuinely taken a second opinion.

**Worth running even though the suite is green.** It caught `grade` silently
dropping the `objective` field from `results.yaml` — a gated scenario reading as
"no assertions declared" — while 1,036 tests passed. The round-trip suite
(`packages/core/test/field-roundtrip.test.ts`) now covers that class, but the
smoke run is what found it.

A smoke run is **one draw on a cheap model, not a measurement**: its
`results.yaml` is gitignored so a throwaway scorecard never lands in the repo.

## Publish, in dependency order

Run from the **repo root** (npm workspaces `-w` flag, verified with npm 11.9.0 /
Node 24.14.0 — this repo's `engines.node` requires >=20, which ships npm >=10,
so `-w` should work on any supported install). Each step must land on the
registry before the next, since each package's `package.json` pins an exact
`@skill-harness/*@0.7.0` dependency (npm will fail to resolve it otherwise):

```bash
npm publish -w @skill-harness/core --access public
npm publish -w @skill-harness/adapters --access public
npm publish -w @skill-harness/cli --access public     # prepack stages assets/report.* into the tarball
npm publish -w skill-harness                            # unscoped meta package; depends on @skill-harness/cli@0.7.0
```

`@skill-harness/core` and `@skill-harness/adapters` publish exactly the `dist/`
that `npm run build` produced above — there is no per-package build hook to fall
back on, which is why the build step is mandatory rather than a nicety.
`@skill-harness/cli`'s `prepack` script
(`rm -rf ./assets && mkdir -p ./assets && cp ../../assets/report.* ./assets/`)
runs automatically as part of `npm publish`/`npm pack` and stages the review-UI
assets (`assets/report.template.html`, `assets/report.grade.js`) into its tarball.
It copies `report.*` rather than all of `assets/` deliberately: `assets/` also
holds the README's demo GIF and the scripts that record it, and `cp -r` put half
a megabyte of them in the tarball (0.3.1 fixed that).

If `-w` doesn't work with your npm version, publish per-package instead:

```bash
(cd packages/core && npm publish --access public)
(cd packages/adapters && npm publish --access public)
(cd packages/cli && npm publish --access public)
(cd packages/skill-harness && npm publish)
```

Do **not** publish `@skill-harness/pi-extension` — it's `private: true` and
ships to pi users via `pi install git:...`, not the npm registry.

## Verify after publishing

```bash
npm view skill-harness version            # expect 0.7.0
npm i -g skill-harness && skill-harness --help
npx @skill-harness/cli lint --help
```

## After publishing — land the release on `main`, then tag it

**Every step below is mandatory.** Skipping one leaves the repo disagreeing with
what it ships. This was missed on two releases in a row (`v0.2.0` and `v0.2.1`
were both tagged on an unmerged `release-*` branch), which is why it is part of
the runbook rather than folklore.

### 1. Merge the release branch to `main`

The version bump lives on `release-<version>`. Until that branch reaches `main`,
a fresh clone of `main` reports a different version than the registry serves:

```bash
gh pr create --base main --head release/0.7.0 \
  --title "chore(release): 0.7.0" --body "Version bump + runbook."
gh pr merge --merge   # or fast-forward main if there is nothing to reconcile
```

### 1b. Bump consumer pins when the results format grows

`results.yaml` stays **schema 2**, but `source_hashes` gained new key *kinds*
(`scenario:<id>`, `fixture:<path>`) after 0.2.1. An older skill-harness reading a
newer results file resolves those keys as file paths, finds nothing, and reports
one bogus `stale` finding per key — so a repo whose CI pins an older version will
fail on a results file it cannot understand.

The rule: **a `results.yaml` written by version X needs version ≥ X to lint.**
When a release changes what `source_hashes` records, every consuming repo needs a
reader that new.

A repo tracking `@latest` gets that automatically **once the release is tagged** —
which is the one ordering trap left: results produced by a local checkout of
`main` that is ahead of the newest tag can out-run CI. Either tag the release
before committing results generated from it, or generate them from the released
tag.

A repo on an exact pin needs that pin bumped as part of the release.

This is deliberately handled by documentation rather than a schema bump: the
schema-1→2 migration precedent exists for *shape* changes, and adding key kinds
is not one. Revisit if there is ever a consumer that cannot be upgraded in
lockstep.

### 2. Tag the release, and move `latest`

```bash
git checkout main && git pull
git tag v0.7.0 && git push origin v0.7.0     # the immutable release tag
git tag -f latest && git push -f origin latest   # the ref the docs point at
```

Moving `latest` is what keeps `AGENTS.md`, both READMEs and `docs/USAGE.md` free
of version numbers — they say `@latest`, so a release needs no doc edits at all.
Only this file names concrete versions.

**There is deliberately no `v1`.** It existed until 0.3.0 and was removed. The
usual case for a moving *major* tag (`actions/checkout@v4`) assumes behaviour
inside the major is compatible. `lint` is a **gate**: every release that adds a
check makes a repo that passed yesterday fail today — 0.3.0 added three. A tag
promising "stable major, moves forward" advertises a stability a linter cannot
honour. `latest` moves just as much but promises only "the newest release", which
is true, and the docs tell consumers to pin a release tag when they want to
choose *when* new checks land.

Consumers that pin need their pin bumped as part of the release
(`.github/workflows/ci.yml`, the `ref:` on the skill-harness checkout).
`principal-pi-skills` **is** that case, and deliberately: its CI checks out
`ref: v0.3.0` at an exact pin, so a red build there means the skills changed rather
than the harness underneath them. Moving `latest` reaches its CI not at all — the
owner bumps the pin as its own commit, per release, and re-runs the affected skills
in the same PR.

Corrected 2026-08-05: `88c8ccd` and the 0.3.1 notes called that repo an `@latest`
tracker. It never was, on either surface — its workflow pins, and its `package.json`
contains no skill-harness reference at all. The pin-vs-latest *guidance* those commits
added is right and stays; only the example was wrong.

For a repo that genuinely tracks `@latest`, the release reaches CI the moment the tag
moves, so **push the tag when you are ready for that gate to change**, not mid-flight
on unrelated work.

Either way, re-run the skills whose results the new version invalidates: a
release that changes what a gate measures leaves the committed scorecard
describing the old measurement.

## Verification performed before the 0.2.1 update to this runbook (2026-08-04)

- `npm run build` from the repo root succeeded and left the tree clean.
- Confirmed `dist/` is gitignored for `core`/`adapters`/`cli` (`git ls-files
  packages/core/dist` → empty), which is what makes the build step above
  mandatory. The 0.1.x runbook claimed `dist/` was committed; it is not, and
  publishing from a fresh clone without building would have shipped an empty
  tarball.
- All four inter-package deps confirmed pinned at exactly `0.2.1`
  (`adapters`→`core`, `cli`→`core`+`adapters`, `skill-harness`→`cli`), which is
  what makes the dependency order above mandatory.
- `npm pack --dry-run -w <pkg>` re-run for all four publishable packages.
  Confirmed:
  - `@skill-harness/core` and `@skill-harness/adapters` tarballs contain only
    `dist/**` + `package.json` + `LICENSE` + `README.md` — no `src/`, `test/`,
    or `node_modules/`.
  - `@skill-harness/cli`'s tarball (9 files) additionally contains
    `assets/report.template.html` and `assets/report.grade.js` flat under
    `assets/` (not nested `assets/assets/`), staged by its `prepack` script.
  - `skill-harness` (the unscoped meta package) contains only `bin.js` +
    `package.json` + `LICENSE` + `README.md` (4 files).
- The `-w` workspace-flag form was confirmed working against this repo on the
  earlier 0.1.0 run (npm 11.9.0) and the `--dry-run` packs above used it again.

For the 0.2.1 release these were re-confirmed against the bumped tree, and the
publish itself was run (see the `v0.2.1` tag).

For 0.3.0 (published 2026-08-04) all of the above were re-run against the bumped
tree — build clean, four exact `0.3.0` inter-package pins, pack contents unchanged
in shape (core 49 files, adapters 7, cli 9 incl. the two `assets/` files, unscoped
4). Two notes for next time:

- **This release inverted the runbook's order** — merge and tag happened first and
  the publish came days later, leaving the registry on 0.2.1 while `main` and the
  `v0.3.0`/`latest` tags said 0.3.0. Nothing broke, because a consumer tracking the
  git `@latest` tag reads the repo rather than the registry, but for the window in
  between `npm i -g skill-harness` served code older than the docs described.
  Publish first, as written above.
- **`npm view <pkg> version` lags the publish.** Immediately after `+ skill-harness@0.3.0`
  it still reported 0.2.1, because `view` reads `dist-tags` and that document is
  CDN-cached; the version was already in `npm view <pkg> versions`. Re-query with
  `--prefer-online` (or a throwaway `--cache` dir) before concluding the dist-tag
  failed to move — it resolved on its own within a minute here, and
  `npm dist-tag add` was not needed.

## Verification performed for 0.3.1 (published 2026-08-05)

- `npm run build:ext` clean; 505 tests pass; `npm pack --dry-run` re-run for all
  four packages: core 49 files / 65.7 kB, adapters 7 / 3.1 kB, cli 9 / 20.1 kB,
  unscoped 4 / 2.3 kB — same shape as 0.3.0, cli back to its pre-GIF size.
- **`npm version --workspaces` does not update inter-package pins.** It bumped all
  five `version` fields to 0.3.1 and left every `@skill-harness/*` dependency
  pinned at `0.3.0`, so `cli@0.3.1` would have shipped depending on `core@0.3.0` —
  a new version number in front of the old, buggy code. Pins were corrected by
  hand in `adapters`, `cli`, `skill-harness` **and `pi-extension`'s
  `devDependencies`**, which is easy to miss because it is the one package that is
  never published.
- **That mismatch also poisons the lockfile.** With versions at 0.3.1 and pins at
  0.3.0, `npm install` cannot satisfy the pins from the workspace, so it silently
  downloads the *published* 0.3.0 tarballs into nested `node_modules` — meaning
  build and tests run against the released code, not the local tree. Fixed by
  correcting the pins, deleting the nested `@skill-harness` dirs and reinstalling;
  verify with `grep -c 'registry.npmjs.org/@skill-harness' package-lock.json`,
  which must be **0**.
- Next release: bump versions and pins together (`npm version --workspaces`
  followed by a pin sweep), then re-run that grep before building.

### What went wrong anyway, and the two guards that would have caught it

The publish itself was clean and all four packages verified from a fresh install.
Two process failures around it are worth not repeating:

- **CI was red on the release commit and the release was merged regardless.** The
  status was read from `gh run watch … | tail -3; echo $?`, which reports **`tail`'s**
  exit status, not `gh`'s — it prints `exit=0` whatever the run did. Read the
  conclusion instead, and never through a pipe:

  ```bash
  gh run view <id> --json conclusion,jobs --jq '.conclusion, (.jobs[] | "\(.name): \(.conclusion)")'
  ```

- **The failing test was the pi-extension bundle-freshness check, and it was right.**
  `dist/index.js` had been built while duplicate `@skill-harness/*` copies were still
  in nested `node_modules` (fallout from the version/pin mismatch above). esbuild
  inlines each copy separately, so the committed bundle was 5418 lines where a clean
  rebuild is 4574. Checking the *lockfile* was not enough — the duplicates were on
  disk. Before committing a bundle, reproduce CI:

  ```bash
  npm ci && npm run build && npm test     # npm ci wipes node_modules; npm install does not
  ```

  Fixed in `cdfcaba`. npm was never affected: `pi-extension` is `private: true` and
  the four published packages are built by `tsc`, not this bundle. The stale artifact
  was what pi users get from `pi install git:...`, which is why `latest` was moved
  forward to `cdfcaba` while `v0.3.1` stayed on the published tree.

## Verification performed for 0.3.2 (prepared 2026-08-05, unpublished at time of writing)

Prepared on `release-0.3.2`. The publish itself is still the user's step — this
section records what was checked so the publish is the only unverified part.

- **Bumped versions and pins in one sweep**, per the note 0.3.1 left behind: a
  single `sed 's/"0.3.1"/"0.3.2"/g'` across the root and all five package manifests
  catches the `version` fields *and* the `@skill-harness/*` pins in `adapters`,
  `cli`, `skill-harness` and `pi-extension`'s `devDependencies` together, which is
  what `npm version --workspaces` fails to do. Verified: 12 occurrences moved, none
  left at 0.3.1.
- **`SKILL.md`'s frontmatter `version:` is a sixth place the version lives**, and no
  previous release note mentioned it — it was still `0.3.1` on a tree bumped
  everywhere else. It is the manifest pi reads when the harness is installed as a
  skill, so a stale value misreports the installed version to the agent using it.
  Bump it with the manifests, and confirm with
  `grep -rn '0\.3\.1' --include='*.md' --include='*.json' . | grep -v node_modules`
  before committing: the only hits left should be historical prose (this runbook's
  context sections, `docs/ROADMAP.md`, `docs/posts/`).
- `grep -c 'registry.npmjs.org/@skill-harness' package-lock.json` → **0** after
  `npm install`, so the workspace satisfies its own pins and nothing resolves to a
  published tarball.
- Reproduced CI before committing: `npm ci && npm run build && npm test` — 516
  tests pass, `npm run typecheck` clean, and the tree afterwards contained *only*
  the manifest/lockfile changes. That last part matters: it confirms
  `packages/pi-extension/dist/index.js` is already fresh (the bundle embeds no
  version string, so a patch bump does not stale it) and that the bundle-freshness
  test was really exercised against a clean `node_modules`.
- `npm pack --dry-run` re-run for all four publishable packages. Shape unchanged
  from 0.3.1 — core 49 files / 66.8 kB, adapters 7 / 3.1 kB, cli 9 / 20.5 kB (both
  `assets/report.*` flat, not nested), unscoped 4 / 2.3 kB. The small core/cli
  growth is the `aggregationMismatch` code plus `liftNoneBadge` in
  `assets/report.grade.js`.
- **Read CI's conclusion without a pipe**, the guard 0.3.1 added after a red release
  commit was merged on a `tail`-masked exit status:

  ```bash
  gh run view <id> --json conclusion,jobs --jq '.conclusion, (.jobs[] | "\(.name): \(.conclusion)")'
  ```

## Verification performed for 0.6.0 (published 2026-08-06)

- Versions **and** pins bumped across the root and all five manifests plus `SKILL.md`'s
  frontmatter `version:`. `grep -c 'registry.npmjs.org/@skill-harness' package-lock.json`
  → **0**.
- CI reproduced from a clean install: `npm ci && npm run build && npm run build:ext &&
  npm test` — **662 tests pass** (50 files); `npm run typecheck` clean; `lint all` against
  the golden fixture reports 0 findings and exits 0; `--version` → `0.6.0`; `stability` is
  in `--help`.
- **Validated against the real corpus, read-only.** `stability all --skills
  ~/prepos/principal-pi-skills` reports **6 boundary cells across 7 skills** — including
  the reported `plan`/DS A5 case (`PASS!→FAIL!`, both runs unanimous, labelled as across a
  SKILL.md edit) and a second one nobody had noticed (`plan`/glm C2, `FAIL!→PASS→FAIL`,
  2 flips in 2 steps). `plan`/DS D1 correctly comes back as **not** a flip: its
  `../../agents/plan.md` changed between the runs, and the note says so. Six notes over a
  ~140-run corpus is the signal-to-noise this only pays for if it stays rare.
  `collectReport` on the same tree attaches the `⇄` marker to exactly those cells.
- New suites: `packages/core/test/stability.test.ts` (22 — flip/volatility/path, the
  unanimous-flip flag, every rejection reason, mode and tag isolation, the three states,
  the scorecard and review-matrix surfaces) and
  `packages/cli/test/stability-cmd.test.ts` (8 — the command's output, `--all`, the
  `--window` guard, and lint's `ℹ`/`::notice`/exit-0 behavior).
- `npm pack --dry-run` for all four: core **63 files / 103.6 kB** (one new module,
  `stability`), adapters 7 / 4.3 kB, cli 9 / 24.9 kB, unscoped 4 / 2.3 kB.
- `packages/pi-extension/dist/index.js` regenerated with `npm run build:ext` and committed.
- **After publishing:** all four packages report `0.6.0`, `dist-tags.latest` moved (the
  unscoped package again lagged the scoped three by under a minute — expected, see 0.5.0).
  From a clean temp dir, `npx skill-harness@0.6.0 stability plan --skills <corpus>` prints
  the three real boundary cells, so the published tarball carries the new module and its
  CLI wiring. Tags `v0.6.0` and `latest` both point at the merge commit `d6dbc18`.

## Verification performed for 0.5.0 (published 2026-08-06)

- Versions **and** pins bumped across the root and all five manifests plus `SKILL.md`'s
  frontmatter `version:`. `grep -c 'registry.npmjs.org/@skill-harness' package-lock.json`
  → **0**.
- CI reproduced from a clean install: `npm ci && npm run build && npm run build:ext &&
  npm test` — **632 tests pass** (48 files); `npm run typecheck` clean; `lint all` against
  the golden fixture reports 0 findings. `--version` prints `0.5.0`; the `--help` header
  and `defaults:` block carry the new scored-mode/delivery paragraph.
- **The 0b workflow was rehearsed against real committed data, without touching the other
  repo.** One `release-2-force` run dir from `principal-pi-skills` (`plan`, glm-5p2,
  2026-08-05T13-46-47Z) was copied to a scratch tree and rescored with the built CLI:
  `mode=force (not scored)` → `B (83%) 10/12 NOT READY`, `0 verdict(s) moved`,
  `label: release-2-force` and the absent `harness_cli_version` both preserved (a rescore
  must not invent provenance a run never had). `lint` on the same copy reports exactly one
  `consistency … rescore (free, offline)` finding per unscored force run, and none after.
- New suites: `packages/core/test/force-scoring.test.ts` (12 tests — the scoring-mode
  truth table, run/rescore/grade/regate on force runs, the lint remedy, red-vs-force
  lift) and `packages/core/test/canary.test.ts` (16 — anchor selection, pass/fail/skip,
  abort-before-spend, the version record). `pi.test.ts` gained the delivery tripwire and
  `pi --version` cases; `trends.test.ts` the per-mode series.
- `npm pack --dry-run` for all four: core **61 files / 93.9 kB** (was 59 / 84.5 — one new
  module, `canary`), adapters 7 / 4.3 kB, cli 9 / 23.3 kB (both `assets/report.*` flat),
  unscoped 4 / 2.3 kB.
- `packages/pi-extension/dist/index.js` regenerated with `npm run build:ext` and committed
  (`bundle.test.ts` is what fails if it goes stale — it did, once, before this step).
- **After publishing:** all four packages report `0.5.0` on the registry and
  `dist-tags.latest` moved (the unscoped `skill-harness` lagged the scoped three by about
  a minute — worth knowing before assuming a failed publish). `npx skill-harness@0.5.0
  --version` → `0.5.0` from a clean temp dir, and `npx skill-harness@0.5.0 lint` runs
  against a real skill tree. Tags `v0.5.0` and `latest` both point at the merge commit
  `ac6030e` on `main`.

## Verification performed for 0.4.0 (prepared 2026-08-05, published)

- Versions **and** pins bumped in one `sed` sweep across the root and all five manifests,
  plus `SKILL.md`'s frontmatter `version:` (the sixth home 0.3.2 discovered).
  `grep -c 'registry.npmjs.org/@skill-harness' package-lock.json` → **0**.
- CI reproduced from a clean install: `npm ci && npm run build && npm run build:ext &&
  npm test` — **591 tests pass**; `npm run typecheck` clean; `lint all` against the golden
  fixture reports 0 findings.
- `--version` prints the bumped value; `--help` header carries it; the `defaults:` line
  shows `claude-code:claude-opus-4-8`.
- **`regate` is in `--help` and refuses cleanly with no args.** Its unit suite covers the
  four per-rep cases, the gates-hash refresh, transcript regeneration + `.pre-regate.txt`
  preservation, the `vitest`/`post_test` refusal, and the missing-artifact refusal.
- `npm pack --dry-run` re-run for all four: core **59 files / 84.5 kB** (was 49 / 66.8 —
  the five new core modules: `regate`, `downgrade`, `version`, `defaults`,
  `judge-policy`), adapters 7 / 3.1 kB, cli 9 / 22.4 kB (both `assets/report.*` flat),
  unscoped 4 / 2.3 kB. Check the count against this rather than against 0.3.x's 49.
