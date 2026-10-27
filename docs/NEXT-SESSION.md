# Next session — start here

## Current state

`0.32.0` is published and tagged (2026-10-23, PR117, merge `6a3dcc3`), with
package/install checks verified. It retains
guided authoring, source/reference preflight, answer calibration separated from
execution gates, saved-evidence diagnosis and selective reuse. Run, grade and
calibration save bounded resource summaries. Linux process groups are sampled and
settled after interruption; optional memory/write limits are sampled controls, not
OS quotas or an explanation of the reported host freeze.

The `0.32.0` release adds optional ordered `expectedCriteria` to authored
controls, so an overall verdict match cannot hide a failure for the wrong reason.
Expectations remain human-reviewed and excluded from judge inputs. When only those
expectations change, exact prompt-bound raw votes can be reused without fresh model
calls; the changed expectations still need review. Authoring guidance applies common
requirements consistently, keeps facts local to each fixture and defines count and
disclosure units before judging.

`/skill-harness create <idea>`, `author` and `skill_author` are released authoring
entry points. They retain briefs, ask one necessary question at a time, preview and
apply exact drafts, prepare controls and collect explicit label review. Authoring
runs in the current Pi model; generated skills need Pi alone, with optional separate
pi-daddy wrappers. Separate eval repos use `--specs`. Shared `preflight`, `calibrate`
and `diagnose` replace skill-specific setup scripts.

Published artifacts and clean installed resource loading were verified separately
from model quality. A fresh end-to-end acceptance remains outstanding; publication
does not establish it. Reuse matching saved answers before scheduling fresh subject
calls. Local tests imply no provider calls or new model qualification. Historical
releases remain in the changelog.

Fresh subject execution is qualified on exact Pi **1.0.4 and 1.1.0**. Other or unknown
versions fail closed before subject spawn. Historical Pi 0.83.0 raw captures remain
readable through their explicit legacy parser; they are not current qualification.
See the README's Pi qualification section and shared final conformance table.

The current architecture is Pi-only:

- Pi is the sole subject, judge, and spec-drafting executable.
- Direct `claude` CLI / `claude-code` judge routing is unsupported.
- The default judge and `suggest` model are `openai-codex:gpt-5.6-sol` through Pi.
- Active documentation describes only the current command surface.

## What the product currently retains

The current release retains bounded tool completion facts and exact
private judge-input artifacts to run/grade/regate. Saved evidence must match the
original digest, identity and assistant turns; unbound historical evidence stays
unknown. See [JUDGE-EVIDENCE.md](JUDGE-EVIDENCE.md). This changes judge prompts,
not historical subject results. Fresh execution uses the qualified version set above.

The run→grade→review loop remains the center of the project:

- Pi-only, multi-model subject execution in red, green, and force placement.
- Structured traces and objective gates (`require_calls`, `forbid_calls`,
  `require_subagents`, `unchanged_paths`) evaluated before judge spend.
- Per-repetition nullable subject input/output/cache-read tokens and price-table cost
  from `packages/adapters/prices/model-prices.json`.
- Human overrides, critical/B-series ship gates, stability, lift, source-aware
  staleness, `grade`, `regate`, `rescore`, `restamp`, and declared coverage.
- Tolerant reading of retained schema-3 delivery evidence. Fresh runs use schema 2.

Unsupported commands include live `capture`, `affected` selection, workflow
trajectory assertions, and confidence/automatic rejudging.

## Release and CI traps

- `npm test` on this host skips 22 authoritative release-pack tests unless Node is
  exactly 20.20.2 and npm is 10.8.2. CI `build-test` runs them with that toolchain.
- `npm run release:pack` is the only authorized pack path. Raw workspace pack/publish
  is intentionally refused.
- The packer rejects extra source-tree material, including local ignored work dirs;
  never let `.pi/`, `scratch/`, or private work files enter an archive.
- `packages/pi-extension/dist/index.js` and `packages/skill-harness/dist/index.js`
  are committed bundles. Run `npm run build:ext` whenever bundled core/adapter/CLI
  behavior changes.
- Judge usage is not persisted. Only subject usage is recorded and priced.
- No OS sandbox is claimed.
- Resource monitoring covers harness-owned subprocesses, not overall Windows/WSL
  health. Unsupported metrics stay unknown; Linux process tests are platform-gated.
- Authored control labels stay proposed until the operator accepts them. A saved
  authoring linkage is not calibration, product approval or training authorization.

## Pi-daddy contracts

The compatibility `pi-daddy-v1` selector validates the frozen ledger-v2 contract under
`contracts/pi-daddy/ledger/v2/`. The separate `pi-daddy-ledger-v3` selector validates
the production-v3 pin under `contracts/pi-daddy/ledger/v3/`. Never hand-edit the
generated adapter modules; use the vendoring/check scripts named in `AGENTS.md`.

## Before handing off another change

1. Run `npm run build:ext`, `npm run typecheck`, and `npm test`.
2. Run `git diff --check` and inspect generated-bundle drift.
3. Keep `.pi/`, `scratch/`, release artifacts, and provider credentials out of commits.
4. For release claims, wait for CI `build-test`; it is the authoritative packer run on
   this host.

## Optional decision evaluation and learning data

`skill-harness decision --help` exposes the npm-installed offline fixture, comparison, selected-session import and reviewed LoRA export workflow. `/skill-harness jev enable` asks for a fresh per-session storage choice every time; declining still permits explicitly confirmed JEV calls. Storage retains selected unlabeled inputs only and never authorizes training.

`/skill-harness jev enable workflow` additionally offers optional handoff advice through `jev_advice` after explicit session-scoped paid-call permission and a fresh storage choice. It asks whether a proposed next action is justified for the selected stage and engineering uncertainty, with at most three calls per activation; tests and independent review retain authority. Workflow retention binds actual Pi session/tool IDs and exact selected input bytes and native classifier-context digests. Optional local references are hash-verified; free later outcome linking preserves selected engineering evidence without inferring independent labels or export/training eligibility. See the walkthrough for the distinction from verified public captures.

The exact Pi1.0.4 OAuth subscription comparison is separate from optional metered JEV. Reports preserve grouped splits, independent labels, abstention/error coverage and model/prompt identities. Synthetic fixtures qualify plumbing only. OpenAI Decisions remains excluded. See [the npm acceptance walkthrough](https://github.com/mojomanyana/skill-harness/blob/main/docs/DECISION-LEARNING.md) and the [data contracts](https://github.com/mojomanyana/skill-harness/blob/main/experiments/decision-shadow/LEARNING-WORKFLOW.md).

## Current record ingestion

The current release includes explicit `pi-daddy-record-v1` ingestion for current native
pi-daddy ledger envelopes. See [the compatibility contract](PI-DADDY-RECORD-COMPATIBILITY.md).
Historical bare-v3 and v2 inputs retain their separate pins.

## Workflow integration

`jev_advice` now returns matching text/details/native structuredContent and declares
its output schema. Pi1.1.0 native tool-only Codemode plus Principal's adapter are
qualified offline with a fake provider; the separate decision-comparison profile
remains pinned to Pi1.0.4. See DECISION-LEARNING.md for the explicit local runtime test.

`decision fixtures --set workflow --out NEW_DIR` creates synthetic convergence
cases and independent fixture labels. The existing default corpus is preserved.
No diagnostic archive ingestion, automatic labels, provider migration or training
is part of this change.
## Workflow selection import

`decision import-workflow` connects explicitly selected schema-2 legacy and schema-3 native workflow decisions to reviewed case curation. It verifies local source/input/evidence bytes and both recorded and current supplied same-session storage consent. It does not read provider outcome files, assign labels or train. Independent human/test label receipts, rights and separate export/training approval still apply. Export does not consume or reverify the import receipt; retain it with the curation evidence. Live JEV quality, representative data and actual LoRA training remain unqualified.

JEV activation now asks for a supported Pi-native classifier provider/model before paid-call and storage consent. Status is metadata-only; native authentication resolves only for authorized calls. Native records distinguish requested identity and catalog cost estimates from resolved/billed values. SKILL_HARNESS_DATA_ROOT sets the shared private collection root (default ~/.skill-harness), with per-session folders and a read-only decision collections inventory. Legacy standalone CLI calls remain environment-key based.
