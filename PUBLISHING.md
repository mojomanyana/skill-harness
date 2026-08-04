# Publishing skill-harness (0.2.0)

This is the npm-publish runbook. It is **user-run** — the agent that prepared this
repo does not publish. Run these commands yourself with your own npm auth.

The registry currently has `0.1.0`, `0.1.1`, `0.1.2`. This repo is at `0.2.0`
(tagged `v0.2.0`), so these commands publish a **new version over an existing
line** — the `@skill-harness` scope is already claimed by the 0.1.x publishes,
and `latest` moves to 0.2.0 as each package lands.

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
`@skill-harness/*@0.2.0` dependency (npm will fail to resolve it otherwise):

```bash
npm publish -w @skill-harness/core --access public
npm publish -w @skill-harness/adapters --access public
npm publish -w @skill-harness/cli --access public     # prepack packages assets/ into the tarball
npm publish -w skill-harness                            # unscoped meta package; depends on @skill-harness/cli@0.2.0
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
npm view skill-harness version            # expect 0.2.0
npm i -g skill-harness && skill-harness --help
npx @skill-harness/cli lint --help
```

## Verification performed before the 0.2.0 update to this runbook (2026-08-04)

- `npm run build` from the repo root succeeded and left the tree clean.
- Confirmed `dist/` is gitignored for `core`/`adapters`/`cli` (`git ls-files
  packages/core/dist` → empty), which is what makes the build step above
  mandatory. The 0.1.x runbook claimed `dist/` was committed; it is not, and
  publishing from a fresh clone without building would have shipped an empty
  tarball.
- All four inter-package deps confirmed pinned at exactly `0.2.0`
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

Not re-verified here: an actual `npm publish --dry-run` against the registry with
0.2.0 auth, since that is the user-run step.
