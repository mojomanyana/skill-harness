# Roadmap

Last updated: 2026-10-07

`skill-harness` is a Pi-only, multi-model test and optimization loop for agent
skills. The run → grade → review loop stays free of product paywalls.

## Current state

- Repository baseline: `0.23.0` (see package manifests and release tags).
- Fresh runs write results schema 2.
- Historical schema 1–3 results remain readable for compatibility.
- Pi is the only execution path for subject, judge, and `suggest` model calls.
- Direct Claude CLI judging is removed; judging and drafting default to
  `openai-codex:gpt-5.6-sol` through Pi.
- Subject usage is retained per repetition when Pi reports it; repository pricing
  can derive subject cost. Judge usage is not yet retained.

## Product rules

1. **Judge ≠ subject.** Warn on same-family grading and never recommend it.
2. **The author owns the verdict.** Overrides require notes and preserve evidence.
3. **Critical and B-series failures block SHIP.** Pass percentage alone is not enough.
4. **Use the cheapest honest remedy.** `rescore`, `grade`, and `regate` precede a new run when applicable.
5. **Missing evidence is never zero or PASS.** Unreported metrics stay null; unavailable gate evidence is ERROR.
6. **Keep the core loop local and inspectable.** `results.yaml` is durable; transcripts remain private unless an override preserves them.
7. **Pi-only, provider-neutral.** Model providers may vary, but execution goes through Pi.

## Phase 1 — Pi-only cleanup and documentation

- [x] Remove direct Claude CLI judge routing. (2026-10-01)
- [x] Route judge and spec-drafting calls through Pi. (2026-10-01)
- [x] Make `openai-codex:gpt-5.6-sol` the non-metered default judge. (2026-10-01)
- [x] Preserve regrading of retained results that record the removed judge provider by migrating the next judge-backed rewrite to the current Pi default. (2026-10-01)
- [x] Remove obsolete handoffs, local assistant configuration, superseded plans, dated measurements, and draft posts. (2026-10-01)
- [x] Reconcile README, AGENTS, SKILL, usage, package, and release documentation. (2026-10-01)
- [x] Merge and release the Pi-only changes. (0.20.0)

### Exit criteria

- Active documentation describes one execution architecture: Pi.
- Explicit `claude-code` judge selection fails with an actionable message.
- Retained results remain readable, and judge-backed rewrites are not stranded.
- Build, typecheck, tests, bundle freshness, and release-pack checks pass on their required toolchains.

## Phase 2 — Usage and cost completeness

- [x] Capture nullable per-repetition subject input, output, and cache-read tokens. (0.19.0)
- [x] Derive subject cost from one dated repository price table. (0.19.0)
- [ ] Record judge token usage without inventing values providers do not report.
- [ ] Show subject and judge coverage separately in CLI and review reports.
- [ ] Add supported models to the price table only with a dated source and tests.

### Exit criteria

- Every displayed total states its coverage.
- Unknown usage and cost remain null.
- Subject and judge costs are distinguishable.

## Phase 3 — Reliability and ecosystem adoption

- [ ] Publish a tested Pi provider/model compatibility matrix.
- [ ] Add a contributor guide for specs, trace gates, fixtures, and retained-result compatibility.
- [ ] Curate good-first issues for external contributors.
- [ ] Improve CI guidance for repositories that pin releases versus follow `@latest`.
- [ ] Track external repositories using the Action and review loop.

### Exit criteria

- External skill repositories can adopt lint, run, review, and CI without maintainer assistance.
- Provider differences are measured from real runs rather than inferred from model names.

## Deferred

- Hosted/team workflows remain deferred until the local loop has sustained external adoption.
- OS-level sandboxing is not claimed; the current workspace isolation seam is not containment.
- Judge-panel automation, mutation testing, retained-learning workflows, authenticated delivery observers, and cross-harness execution are not planned.
