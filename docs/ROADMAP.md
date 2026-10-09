# Roadmap

Last updated: 2026-10-08

`skill-harness` is a Pi-only, multi-model test and optimization loop for agent
skills. The run → grade → review loop stays free of product paywalls.

## Current state

- Current source release target: `0.28.0` (see package manifests).
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
- Judge-panel automation, mutation testing, authenticated delivery observers, and cross-harness execution remain deferred. Reviewed local learning-data preparation is available as an explicit decision workflow; automatic learning or deployment remains deferred.

## Optional decision evaluation and learning data

`skill-harness decision --help` exposes the npm-installed offline fixture, comparison, selected-session import and reviewed LoRA export workflow. `/skill-harness jev enable` asks for a fresh per-session storage choice every time; declining still permits explicitly confirmed JEV calls. Storage retains selected unlabeled inputs only and never authorizes training.

`/skill-harness jev enable workflow` additionally offers optional handoff advice through `jev_advice` after explicit session-scoped paid-call permission and a fresh storage choice. It asks whether a proposed next action is justified for the selected stage and engineering uncertainty, with at most three calls per activation; tests and independent review retain authority. Workflow retention binds actual Pi session/tool IDs and exact outbound bytes. Optional local references are hash-verified; free later outcome linking preserves selected engineering evidence without inferring independent labels or export/training eligibility. See the walkthrough for the distinction from verified public captures.

The exact Pi1.0.4 OAuth subscription comparison is separate from optional metered JEV. Reports preserve grouped splits, independent labels, abstention/error coverage and model/prompt identities. Synthetic fixtures qualify plumbing only. OpenAI Decisions remains excluded. See [the npm acceptance walkthrough](https://github.com/mojomanyana/skill-harness/blob/main/docs/DECISION-LEARNING.md) and the [data contracts](https://github.com/mojomanyana/skill-harness/blob/main/experiments/decision-shadow/LEARNING-WORKFLOW.md).
