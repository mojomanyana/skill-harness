# Publishing skill-harness (0.3.0)

This is the npm-publish runbook. It is **user-run** — the agent that prepared this
repo does not publish. Run these commands yourself with your own npm auth.

The registry has `0.1.0`, `0.1.1`, `0.1.2`, `0.2.1`. This repo is at `0.3.0`, so
these commands publish a **new version over an existing line** — the
`@skill-harness` scope is already claimed, and `latest` moves to 0.3.0 as each
package lands.

0.3.0 is a **behaviour-breaking release for CI consumers**, which is why it takes
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

## Publish, in dependency order

Run from the **repo root** (npm workspaces `-w` flag, verified with npm 11.9.0 /
Node 24.14.0 — this repo's `engines.node` requires >=20, which ships npm >=10,
so `-w` should work on any supported install). Each step must land on the
registry before the next, since each package's `package.json` pins an exact
`@skill-harness/*@0.3.0` dependency (npm will fail to resolve it otherwise):

```bash
npm publish -w @skill-harness/core --access public
npm publish -w @skill-harness/adapters --access public
npm publish -w @skill-harness/cli --access public     # prepack packages assets/ into the tarball
npm publish -w skill-harness                            # unscoped meta package; depends on @skill-harness/cli@0.3.0
```

`@skill-harness/core` and `@skill-harness/adapters` publish exactly the `dist/`
that `npm run build` produced above — there is no per-package build hook to fall
back on, which is why the build step is mandatory rather than a nicety.
`@skill-harness/cli`'s `prepack` script
(`rm -rf ./assets && cp -r ../../assets ./assets`) runs automatically as part
of `npm publish`/`npm pack` and stages the review-UI assets
(`assets/report.template.html`, `assets/report.grade.js`) into its tarball.

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
npm view skill-harness version            # expect 0.3.0
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
gh pr create --base main --head release-0.3.0 \
  --title "chore(release): 0.3.0" --body "Version bump + runbook."
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
git tag v0.3.0 && git push origin v0.3.0     # the immutable release tag
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
(`.github/workflows/ci.yml`, the `ref:` on the skill-harness checkout). Consumers
tracking `@latest` — `principal-pi-skills` as of 0.3.0 — need nothing, but the
release reaches their CI the moment the tag moves, so **push the tag when you are
ready for that gate to change**, not mid-flight on unrelated work.

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
