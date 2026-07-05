# Publishing skill-harness (0.1.0)

This is the npm-publish runbook. It is **user-run** — the agent that prepared this
repo does not publish. Run these commands yourself with your own npm auth.

Not covered here (handled separately, by the controller, gated on user confirmation):
the `v1` git tag and the `gh repo rename` to `skill-harness`.

## Prereq

```bash
npm login
```

You need an npm account with publish rights. The `@skill-harness` scope is
free/unclaimed — your first publish of `@skill-harness/core` claims it for
your account/org.

## Publish, in dependency order

Run from the **repo root** (npm workspaces `-w` flag, verified with npm 11.9.0 /
Node 24.14.0 — this repo's `engines.node` requires >=20, which ships npm >=10,
so `-w` should work on any supported install). Each step must land on the
registry before the next, since each package's `package.json` pins an exact
`@skill-harness/*@0.1.0` dependency (npm will fail to resolve it otherwise):

```bash
npm publish -w @skill-harness/core --access public
npm publish -w @skill-harness/adapters --access public
npm publish -w @skill-harness/cli --access public     # prepack packages assets/ into the tarball
npm publish -w skill-harness                            # unscoped meta package; depends on @skill-harness/cli@0.1.0
```

`@skill-harness/core` and `@skill-harness/adapters` need no build step beyond
what's already committed to `dist/` (or re-run `npm run build` from the repo
root first if you want a fresh build). `@skill-harness/cli`'s `prepack` script
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
npm i -g skill-harness && skill-harness --help
npx @skill-harness/cli lint --help
```

## Verification performed before writing this runbook

- `npm run build` succeeded from the repo root.
- `npm pack --dry-run` was run for `@skill-harness/core`, `@skill-harness/adapters`,
  `@skill-harness/cli`, and `skill-harness`. Confirmed:
  - `@skill-harness/core` and `@skill-harness/adapters` tarballs contain only
    `dist/**` + `package.json` — no `src/`, `test/`, or `node_modules/`.
  - `@skill-harness/cli`'s tarball additionally contains `assets/report.template.html`
    and `assets/report.grade.js` flat under `assets/` (not nested
    `assets/assets/`), staged by its `prepack` script.
  - `skill-harness` (the unscoped meta package) contains only `bin.js` +
    `package.json`.
- `npm pack --dry-run -w @skill-harness/core` and
  `npm publish --dry-run -w @skill-harness/core` both worked from the repo
  root — the `-w` workspace-flag form is confirmed to work with this repo's
  npm (11.9.0). Use it as written above.
- `npx vitest run` — 245/245 tests passing (doc-only change, no source/version
  touched).
