# skill-check → skill-harness: rebrand + publish (design)

**Status:** approved (brainstormed 2026-07-06). Completes master-design step 7 (the "publish" sub-project).

## Goal

Rebrand the project from `skill-check` to **`skill-harness`** (the npm name `skill-check` is taken by an unrelated linter; `skill-harness` is a better fit — it *is* a test harness — and `skill-harness`, `@skill-harness/*`, and the GitHub repo name are all free), then publish it so real users can install the CLI from npm and consume the GitHub Action via a stable tag.

## Decisions (from brainstorm)

- **Full rebrand:** repo, all packages, the CLI command, docs, the pi manifest, and the committed pi-extension bundle.
- **Publish topology:** scoped `@skill-harness/{core,adapters,cli}` (public) **plus** a thin unscoped `skill-harness` meta-package that re-exposes the CLI bin (so both `npm i -g skill-harness` and `npm i -g @skill-harness/cli` work). `pi-extension` stays **unpublished** (`pi install git:` + committed bundle).
- **Version:** `0.0.2 → 0.1.0` (first published version); intra-deps pinned to `0.1.0`.
- **Outward-facing execution:** the agent prepares everything and verifies via `npm pack` dry-run; **the user runs `npm publish`** (their npm auth). The agent runs `gh repo rename` + `git tag v1` **with the user's go-ahead** (gh-authed). Nothing is published/renamed without an explicit gate.
- **Base:** this work branches off `docs/agents-usage` (carrying `AGENTS.md` + `docs/USAGE.md`, which get rebranded here); the rebrand PR supersedes PR #9.

## Phase 1 — Rebrand (mechanical, wide, reversible until merged)

**P1.1 — package renames.** `@skill-check/{core,adapters,cli,pi-extension}` → `@skill-harness/*`. Update:
- every `from "@skill-check/…"` import in `src` + `test` across all packages;
- each `package.json` `name` + intra-`dependencies`/`devDependencies` (`@skill-check/core` → `@skill-harness/core`, etc.);
- `vitest.workspace.ts` aliases (`@skill-check/core`, `@skill-check/adapters`, `@skill-check/cli`, `@skill-check/cli/serve`) → `@skill-harness/*`;
- `packages/cli/package.json` `exports` subpath (`./serve`) unchanged in shape (only the package name changes).
- tsconfig project references use **paths** (`packages/core`), not names — unaffected.

**P1.2 — CLI command/bin.** Rename `bin/skill-check.js` → `bin/skill-harness.js` (update its internal dist path resolution comment/logic if it references the name — it resolves `packages/cli/dist/cli.js`, name-agnostic). Root `package.json` `bin`: `{ "skill-harness": "./bin/skill-harness.js" }`. Update the `HELP` const header + any `skill-check` self-references in `cli.ts`.

**P1.3 — identity/docs.** `SKILL.md` (front-matter `name: skill-harness` + install URL `github.com/mojomanyana/skill-harness` + command references), `AGENTS.md`, `README.md`, `docs/USAGE.md`, `action.yml` (`name:`), the root `pi` manifest (`skills: ["./SKILL.md"]` unchanged path; `extensions` path unchanged). Replace `skill-check` → `skill-harness` in all prose/commands; replace `mojomanyana/skill-check` → `mojomanyana/skill-harness` in action/git-install refs.

**P1.4 — rebuild the committed bundle.** `packages/pi-extension` inlines `@skill-harness/*` now → `npm run build && npm run build:ext` and commit the regenerated `packages/pi-extension/dist/index.js` (the `bundle.test.ts` freshness guard enforces this).

**P1.5 — repo rename (outward-facing, gated).** `gh repo rename skill-harness` (GitHub auto-redirects old URLs), then `git remote set-url origin …/skill-harness.git`. Confirm with the user before running. All doc refs already updated in P1.3.

**Phase-1 gate:** `npm run build && npm run build:ext && npx vitest run` green (245 tests), `npm run typecheck` clean, and the dogfood `node bin/skill-harness.js lint all --skills packages/core/test/fixtures` → exit 0. No `@skill-check` string remains except in historical `docs/superpowers/**` (those are dated process docs — leave them).

## Phase 2 — Publish

**P2.1 — the assets-packaging snag (the one real engineering task).** `serveReview` (`@skill-harness/cli`) reads `assets/report.template.html` + `report.grade.js` from the **repo root** via a `templatePath()` resolution — those files are **not** inside the `@skill-harness/cli` npm tarball, so a published `review` command would 404. Fix: copy `assets/` into `packages/cli/` at build (a `prepack`/build step, e.g. `cp -r assets packages/cli/assets`) and make `templatePath()`'s default resolution find the packaged copy (add a candidate relative to the package, e.g. `join(__dirname, "..", "assets")`) while keeping the repo-root candidate for the unpublished/dev path. Verify by `npm pack` + inspecting the tarball contains the assets, and (ideally) installing the packed tarball and running `review`.

**P2.2 — publishable package metadata.** For each published package (`@skill-harness/{core,adapters,cli}` + the thin `skill-harness` meta):
- remove `private: true` where present (root/meta must be publishable; `@skill-harness/cli` is already non-private);
- add `"files": ["dist"]` (cli also `"assets"` from P2.1), `"repository": { "type": "git", "url": "git+https://github.com/mojomanyana/skill-harness.git" }`, `"license": "MIT"`, `"publishConfig": { "access": "public" }` (required for scoped public packages);
- `@skill-harness/cli` gains `"bin": { "skill-harness": "./dist/cli.js" }` (ensure `dist/cli.js` has a `#!/usr/bin/env node` shebang) so the scoped install provides the command.

**P2.3 — the thin `skill-harness` meta-package.** A minimal publishable package `name: "skill-harness"`, `version: 0.1.0`, `dependencies: { "@skill-harness/cli": "0.1.0" }`, `bin: { "skill-harness": "./bin.js" }` where `bin.js` re-execs `@skill-harness/cli`'s CLI. Location: `packages/skill-harness/` (a workspace member, consistent with the others). It exists to claim the unscoped name + give `npm i -g skill-harness`.

**P2.4 — version bump.** All packages `0.0.2 → 0.1.0`; intra-deps pinned to `0.1.0`. (No release automation/changesets — a documented manual publish order: core → adapters → cli → meta.)

**P2.5 — `npm pack` verification (the gate before publish).** For each package, `npm pack --dry-run` and assert the tarball contents (dist present; cli includes assets; no src/tests/node_modules). Do NOT `npm publish` — produce a `PUBLISHING.md` with the exact ordered commands the user runs with their npm auth (`npm login`, then `npm publish --access public` per package in dependency order).

**P2.6 — cut `v1` (gated).** After the rebrand is merged to `main`, `git tag v1 <release-commit> && git push origin v1` (a mutable major tag the action's `@v1` resolves to). Confirm with the user. Update the README caveat (drop "until first release") once tagged.

## Testing

- Phase 1: the existing 245-test suite must stay green after the rename (it's a pure rename — behavior-preserving); `bundle.test.ts` enforces the rebuilt bundle; a repo-wide `grep -rl "@skill-check\|skill-check" --exclude-dir=docs/superpowers` should return only intentional/historical hits (verify none in `src`/`package.json`/`action.yml`/`SKILL.md`).
- Phase 2: `npm pack --dry-run` content assertions per package; a packed-tarball install smoke for the `review` assets path (P2.1). No unit test for the actual publish (manual, user-run).

## Non-goals

- Release automation (changesets/CI publish) — manual publish this milestone.
- Publishing `@skill-harness/pi-extension` — stays `pi install git:`.
- GitHub Marketplace listing for the Action — deferred (the `@v1` tag is enough to consume it).
- The 7b metered-CI tier — separate, still deferred.

## Risks

- **Blast radius of the rename** — every import + alias + the bundle. Mitigated by the green-suite gate + the `grep` sweep + `bundle.test.ts`.
- **Irreversibility** — `npm publish` (versions can't be trivially unpublished) and the repo rename are outward-facing; both are user-gated (user runs publish; user OKs the rename/tag). The `npm pack` dry-run de-risks publish before it happens.
- **Assets packaging (P2.1)** — the one non-mechanical task; verified by tarball-install smoke, not just metadata.
- **Old-URL breakage** — GitHub redirects renamed-repo URLs, and `pi install`/action refs are updated in-repo; external pins to the old name keep working via redirect.
