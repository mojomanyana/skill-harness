# Publishing skill-harness (0.2.1)

This is the npm-publish runbook. It is **user-run** — the agent that prepared this
repo does not publish. Run these commands yourself with your own npm auth.

The registry has `0.1.0`, `0.1.1`, `0.1.2`. This repo is at `0.2.1`, so these
commands publish a **new version over an existing line** — the `@skill-harness`
scope is already claimed by the 0.1.x publishes, and `latest` moves to 0.2.1 as
each package lands.

`0.2.0` was tagged but never published, so 0.2.1 is the first release carrying
everything since 0.1.2 — including the fix for the review UI, which did not work
in any published version.

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
`@skill-harness/*@0.2.1` dependency (npm will fail to resolve it otherwise):

```bash
npm publish -w @skill-harness/core --access public
npm publish -w @skill-harness/adapters --access public
npm publish -w @skill-harness/cli --access public     # prepack packages assets/ into the tarball
npm publish -w skill-harness                            # unscoped meta package; depends on @skill-harness/cli@0.2.1
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
npm view skill-harness version            # expect 0.2.1
npm i -g skill-harness && skill-harness --help
npx @skill-harness/cli lint --help
```

## After publishing — land the release on `main`, then move `v1`

**Both steps are mandatory.** Skipping either leaves the repo disagreeing with
what it ships. This has now been missed on two releases in a row (`v0.2.0` and
`v0.2.1` were both tagged on an unmerged `release-*` branch), which is why it is
part of the runbook rather than folklore.

### 1. Merge the release branch to `main`

The version bump lives on `release-<version>`, and the `v<version>` tag points at
its tip. Until that branch reaches `main`, a fresh clone of `main` reports an
older version than the registry serves:

```bash
gh pr create --base main --head release-0.2.1 \
  --title "chore(release): 0.2.1" --body "Version bump + runbook; published to npm."
gh pr merge --merge   # or fast-forward main if there is nothing to reconcile
```

### 1b. Bump consumer pins when the results format grows

`results.yaml` stays **schema 2**, but `source_hashes` gained new key *kinds*
(`scenario:<id>`, `fixture:<path>`) after 0.2.1. An older skill-harness reading a
newer results file resolves those keys as file paths, finds nothing, and reports
one bogus `stale` finding per key — so a repo whose CI pins an older version will
fail on a results file it cannot understand.

The rule: **a `results.yaml` written by version X needs version ≥ X to lint.**
When a release changes what `source_hashes` records, bump the pin in every
consuming repo as part of that release. Today that is one repo:
`principal-pi-skills`, whose workflow pins `v0.2.1` explicitly.

This is deliberately handled by documentation rather than a schema bump: the
schema-1→2 migration precedent exists for *shape* changes, and adding key kinds
is not one. Revisit if there is ever a consumer that cannot be upgraded in
lockstep.

### 2. Move the `v1` tag to the new release commit

`action.yml` is consumed as `uses: mojomanyana/skill-harness@v1`, and the docs
(`AGENTS.md`, `README.md`, `docs/USAGE.md`,
`packages/skill-harness/README.md`) advertise `v1` as a **moving** stable major
tag, in the usual GitHub Actions style (`actions/checkout@v4`). The Action's
major tag is a separate versioning axis from the npm package version — `v1` is
the first stable line of the *Action*, not a claim that the packages are 1.x.

A moving tag that does not move is worse than no tag: `v1` sat on the rebrand
commit for 37 commits, so anyone following the documented CI snippet was gating
their repo on pre-0.2.0 code. Move it as the last step of every release, from
`main`, after the merge above:

```bash
git checkout main && git pull
git tag -f v1 && git push -f origin v1
git rev-list -n1 v1   # sanity: should equal the tip of main
```

Consumers who want to lock an exact version pin the release tag (`@v0.2.1`) or a
commit SHA instead — that is what `principal-pi-skills` CI does.

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
