# Roadmap

Last updated: 2026-10-27

`skill-harness` develops, evaluates and improves skills through Pi and a selected
model. It starts from a user's idea or imports a selected skill. Generated skills
need Pi only; optional ecosystem wrappers remain separate. The creation and
run → grade → review loop stays free of product paywalls.

## Released foundation

- Guided skill and evaluation authoring through the current Pi model, with persisted
  answers, one necessary question at a time, exact previews and same/separate repos.
- Explicit tool profiles, discoverable fixtures, requirement mappings and judge-only
  references, with response/code evidence chosen independently of workspace mode.
- Generic proposed controls, operator label review, shared judge preparation and
  calibration, including equivalent valid answers and separate error reporting.
- Saved-evidence diagnosis and fresh transfer cases before claiming an improvement.
- Optional pi-daddy agent definitions preserve native grants/delegation; Principal
  remains optional, and JEV/LoRA retain separate consent and label requirements.
- Recovered-run reliability: separate answer calibration from execution gates,
  audit judge references, report loading observations precisely, reuse saved answers
  selectively, and monitor bounded subprocess/capture activity. Fixture preparation
  has explicit size limits; interruption stops new work and settles owned children.

Live acceptance and published artifacts must be verified separately from source
implementation. The existing Pi subject-runtime qualification pin remains explicit.

## Released — 0.32.0

- Review every positive control against common requirements and its scenario's
  complete contract. Keep source facts local to each fixture, define count/disclosure
  units and use consistent rules for ambiguous claims and valid alternatives.
- Add optional ordered `expectedCriteria` to identify a negative control failing for
  the wrong reason. Human-reviewed expectations stay outside judge inputs; synthetic
  answer calibration remains separate from execution evidence.
- Reuse saved raw criterion votes when only expectations change and exact judge
  prompt bindings match. Changed expectations require review; historical records
  remain intact. Verify published artifacts and clean remote acceptance separately.

## Current state

- Published baseline: `0.32.0` (2026-10-23, PR117). Source candidate `0.32.1`
  adds a fixture-aware warning for regex-like literal read paths without changing gates.
- Local Pi 1.1.0 authoring, calibration, exact judgment reuse, red/force evaluation,
  diagnosis and native readonly-child acceptance completed on 2026-10-27. The
  generated skill remains NOT READY (3/4 scenarios); autonomous selection and UI
  acceptance remain untested. Publication is verified separately.
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

`/skill-harness jev enable workflow` additionally offers optional handoff advice through `jev_advice` after explicit session-scoped paid-call permission and a fresh storage choice. It asks whether a proposed next action is justified for the selected stage and engineering uncertainty, with at most three calls per activation; tests and independent review retain authority. Workflow retention binds actual Pi session/tool IDs and exact selected input bytes and native classifier-context digests. Optional local references are hash-verified; free later outcome linking preserves selected engineering evidence without inferring independent labels or export/training eligibility. See the walkthrough for the distinction from verified public captures.

The exact Pi1.0.4 OAuth subscription comparison is separate from optional metered JEV. Reports preserve grouped splits, independent labels, abstention/error coverage and model/prompt identities. Synthetic fixtures qualify plumbing only. OpenAI Decisions remains excluded. See [the npm acceptance walkthrough](https://github.com/mojomanyana/skill-harness/blob/main/docs/DECISION-LEARNING.md) and the [data contracts](https://github.com/mojomanyana/skill-harness/blob/main/experiments/decision-shadow/LEARNING-WORKFLOW.md).
