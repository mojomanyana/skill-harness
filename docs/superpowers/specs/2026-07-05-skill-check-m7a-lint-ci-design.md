# skill-check v2 — Milestone 7a: lint + free-PR CI action (design)

**Status:** approved (brainstormed 2026-07-05).
**Master design:** `docs/superpowers/specs/2026-07-03-skill-check-framework-design.md` (migration path step 7; CI section lines 101–112). Steps 1–6 are complete and merged.

## Scope

Step 7 ("`action/` + docs") is larger than one plan; it decomposes into **7a** (this spec — the *free* PR tier), **7b** (the metered manual-run tier: `workflow_dispatch` model runs, pi-in-CI, `FIREWORKS_API_KEY`, artifact upload, PR-comment, `judge --from-run`), and **publish** (npm-publish polish / the `skill-check` name-collision decision). 7a delivers the design's headline promise — *"consumer repos add one workflow file; their `tests/` folders are unchanged"* — for the free, static checks that need no model runs, no API keys, and no publishing.

## Goal

A `skill-check lint` command (static spec/fixture validation + conditional results-consistency) that **exits non-zero on failure** and emits **GitHub PR annotations**, wrapped in a **composite GitHub Action** so a consumer skills-repo adds one workflow file to get free lint checks on every PR. Plus consumer docs and a self-CI workflow that dogfoods it.

## Decisions (from brainstorm)

- **lint check set:** static checks always; **results-consistency only for skills that have a committed `results.yaml`** (skipped silently otherwise).
- **Self-CI workflow:** included (the repo has no CI today; it also proves the action end-to-end).
- **`run --fail-on-not-ship`:** deferred to 7b (nothing in 7a uses `run`'s exit code).
- **Action obtains skill-check by building it in-action** (`npm ci && npm run build` at `github.action_path`) — no npm publish, no committed CLI artifact. `pi` is NOT needed (lint is static).

## Architecture / components

### Core: `lintSkill` (new, `packages/core/src/lint.ts`)
`parseSpec`/`loadSpec` already validates: YAML shape, `skill`/`judge_persona`, `ship_bar` numeric `total`/`min_pass`, `critical` string-array, per-scenario `id`/duplicate-id/`title`/`mode`/`checklist`-strings/seeded-`fixture`-present, `env.workspace`. `lintSkill` runs that (catching `SpecError`) and **adds** the checks it doesn't do. It returns a list of findings rather than throwing, so `lint` can report all problems across all skills.

```ts
export interface LintFinding { skill: string; scenario?: string; code: string; message: string; }
export function lintSkill(skillDir: string): LintFinding[];
```

`lintSkill(skillDir)`:
1. `loadSpec(join(skillDir,"tests","specification.yaml"))` inside try/catch → on `SpecError`, return a single finding `{code:"spec", message: err.message}` (can't run further checks without a valid spec).
2. **ship_bar sanity** (`code:"ship_bar"`): `min_pass ≤ total`; `total ≤ scenarios.length` (bar can't require more passes than scenarios exist). Finding per violation.
3. **critical-ids exist** (`code:"critical"`): every id in `spec.critical` refers to a real `spec.scenarios[].id`. Finding per unknown id.
4. **fixture paths exist** (`code:"fixture"`): each seeded scenario's `fixture` resolves (relative to the spec's dir) to an existing directory. Finding per missing fixture.
5. **results-consistency (conditional)** (`code:"consistency"`): if `<skillDir>/tests/results/**/results.yaml` exist, for each: recompute `effective_grade` via `finalizeResults`/`score` from its scenarios+overrides and assert it equals the persisted `effective_grade`; assert each scenario with an `override` carries a non-empty `note` AND a preserved transcript on disk. Skipped entirely when no committed results.yaml. (Reuses `readResults`, `finalizeResults`/`effectiveVerdicts`, `findTranscriptFiles`.)

### CLI: `cmdLint` (new, `packages/cli/src/cli.ts`)
`skill-check lint <skill|all> --skills <root>`. Resolves skills via the existing `discover`/`resolveSkill` (`all` → `discover(root).filter(hasSpec)`; a name → `resolveSkill`). Runs `lintSkill` on each, aggregates findings.
- **Output:** human report (grouped by skill; `✓ <skill>` or `✗ <skill>: <code> — <message>` lines; a summary `N skills, M findings`).
- **GitHub annotations:** when `process.env.GITHUB_ACTIONS === "true"`, ALSO print `::error title=skill-check::<skill>[/<scenario>] <message>` for each finding (file-anchored to the spec where possible: `::error file=<specPath>::…`) so failures surface inline on the PR.
- **Exit code:** `process.exitCode = 1` if any finding; `0` if clean. Also `1` (with a clear message) if the skills root has no skills / a named skill is unknown (mirrors existing error handling).
Registered in `main()`'s dispatch + the `HELP`/README usage block.

### `action/` — composite GitHub Action (`action.yml` at repo root)
```yaml
name: skill-check
description: Lint agent-skill specs (free, static — no model runs)
inputs:
  skills-root: { description: "path to the skills root (dir of skill subdirs)", default: "skills", required: false }
  skill:       { description: "skill name or 'all'", default: "all", required: false }
runs:
  using: composite
  steps:
    - uses: actions/setup-node@v4
      with: { node-version: "20" }
    - shell: bash
      run: npm ci && npm run build
      working-directory: ${{ github.action_path }}
    - shell: bash
      run: node "${{ github.action_path }}/bin/skill-check.js" lint "${{ inputs.skill }}" --skills "${{ github.workspace }}/${{ inputs.skills-root }}"
```
The action runs in the CONSUMER's checkout (`github.workspace`) but builds skill-check at `github.action_path` (its own checkout, brought by `uses: mojomanyana/skill-check@<ref>`). `bin/skill-check.js` runs the built `dist` (or its tsx fallback). Lint's exit code fails the consumer's job; annotations show inline.

### Consumer docs
A README "CI" section documenting the one workflow file the consumer adds:
```yaml
name: skill-check
on: pull_request
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: mojomanyana/skill-check@v1
        with: { skills-root: ./skills }
```
Note their `tests/` folders are unchanged; lint is free/static (no `pi`, no secrets).

### Self-CI (`.github/workflows/ci.yml` for skill-check's own repo)
On `push`/`pull_request`: `npm ci` → `npm run build` → `npx vitest run` → `npm run typecheck` → dogfood `node bin/skill-check.js lint all --skills packages/core/test/fixtures` (or the golden-skill's parent) to prove lint + the CLI path in CI.

## Interfaces (contracts)
- `lintSkill(skillDir: string): LintFinding[]` (core) — never throws; a bad spec becomes a `code:"spec"` finding.
- `LintFinding { skill; scenario?; code; message }`.
- `cmdLint(args: Args): Promise<void>` (cli) — sets `process.exitCode`.
- Exit code contract: 0 = all clean, 1 = ≥1 finding or resolution error. This is the CI gate.

## Testing
- **`lintSkill` unit tests** (`packages/core/test/lint.test.ts`): clean spec → `[]`; invalid spec → one `code:"spec"` finding (not a throw); `min_pass>total` and `total>scenario-count` → `ship_bar` findings; unknown critical id → `critical` finding; missing seeded fixture dir → `fixture` finding; committed results.yaml with a tampered grade → `consistency` finding; override without note → `consistency` finding; no results.yaml → consistency skipped.
- **`cmdLint` tests** (cli): `all` across a temp skills root aggregates findings from multiple skills; exit code 0 (clean) vs 1 (findings); unknown skill → exit 1; annotation lines emitted when `GITHUB_ACTIONS=true` (set env in-test) and absent otherwise. Hermetic (temp dirs, no network).
- **Action/self-CI**: validated by the self-CI workflow actually running the composite action against the golden fixture (verified once the workflow runs on the branch/PR). `action.yml` is YAML-linted; the composite steps are exercised by CI, not a unit test.

## Non-goals (7a)
- Model runs in CI, `pi`-in-CI, `FIREWORKS_API_KEY`/any secrets, `workflow_dispatch` manual runs, artifact upload, PR-comment posting, `judge --from-run` (all 7b).
- npm publish, `files`/`repository`/`publishConfig` fields, the `skill-check` name-collision resolution, `workspace:`-protocol migration (all the "publish" sub-project).
- `run --fail-on-not-ship` (7b).
- Changing the review UI, scoring, results schema, or the pi-extension.

## Risks
- **In-action build cost/time** — `npm ci && npm run build` per action run. Acceptable for a lint gate; cache `node_modules` via `actions/setup-node` cache if needed. (Alternative — a committed CLI bundle like the pi-extension's — is deferred; build-in-action keeps 7a simple and always-fresh.)
- **`bin/skill-check.js` in a fresh checkout** — after `npm run build`, `dist/cli.js` exists so the launcher uses it (no tsx fallback needed); the self-CI run verifies this end-to-end.
- **results-consistency false positives** — recomputation must use the exact same `finalizeResults`/`score` path the writer used, or a legitimately-current results.yaml would flag. Mitigated by reusing the core functions (single source of truth) rather than re-deriving.
- **Annotation format** — `::error::` must be exactly GitHub's syntax to render; covered by a format test + the self-CI dogfood.
