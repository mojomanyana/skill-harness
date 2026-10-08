# Next session — start here

## Current state

`0.26.1` is the current source release target. Package manifests identify these
candidate bytes; verify npm and GitHub directly before asserting publication or
`latest` promotion.
Historical released versions remain recorded in the changelog.

Fresh subject execution is qualified only on exact Pi **1.0.4**. Other or unknown
versions fail closed before subject spawn. Historical Pi 0.83.0 raw captures remain
readable through their explicit legacy parser; they are not current qualification.
See the README's Pi qualification section and shared final conformance table.

The current architecture is Pi-only:

- Pi is the sole subject, judge, and spec-drafting executable.
- Direct `claude` CLI / `claude-code` judge routing is unsupported.
- The default judge and `suggest` model are `openai-codex:gpt-5.6-sol` through Pi.
- Active documentation describes only the current command surface.

## What the product currently retains

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

`/skill-harness jev enable workflow` additionally offers optional handoff advice through `jev_advice` after explicit session-scoped paid-call permission and a fresh storage choice. It sends only selected evidence for a fixed readiness question, with at most three calls per activation; tests and independent review retain authority. Workflow retention binds actual Pi session/tool IDs but remains unlabeled and ineligible for export or training. See the walkthrough for the distinction from verified public captures.

The exact Pi1.0.4 OAuth subscription comparison is separate from optional metered JEV. Reports preserve grouped splits, independent labels, abstention/error coverage and model/prompt identities. Synthetic fixtures qualify plumbing only. OpenAI Decisions remains excluded. See [the npm acceptance walkthrough](https://github.com/mojomanyana/skill-harness/blob/main/docs/DECISION-LEARNING.md) and the [data contracts](https://github.com/mojomanyana/skill-harness/blob/main/experiments/decision-shadow/LEARNING-WORKFLOW.md).

## Current record ingestion candidate

The source candidate adds explicit `pi-daddy-record-v1` ingestion for current native
pi-daddy ledger envelopes. See [the compatibility contract](PI-DADDY-RECORD-COMPATIBILITY.md).
Historical bare-v3 and v2 inputs retain their separate pins. Published 0.24.2 does
not include this new adapter. A source pin alone is not evidence of publication.
