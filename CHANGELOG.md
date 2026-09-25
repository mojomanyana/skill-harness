# Changelog

## 0.18.0 — focused measurement core (2026-09-25)

### Removed

- Remove the retained-learning lifecycle, evidence archive, screening internals, qualification runner, paired comparisons, judge-agreement reporting, affected selection, live conversation capture, workflow trajectory assertions and confidence-triggered rejudging.
- Remove authenticated prompt-delivery production and its observer bundle. Fresh runs write results schema 2 and cannot produce `NOT-MEASURED` delivery verdicts.

### Compatibility

- Historical schema-3 results remain readable without migration, including retained delivery observations and ship-blocking `NOT-MEASURED` verdicts.
- The retained run→grade→review core remains: offline lint, Pi/multi-model execution, red/green/force placement, objective gates, critical/B-series shipping gates, saved-transcript grading, source-aware staleness and offline rescoring.

## 0.17.0 — whole-session retrospectives (2026-09-15)

- Import explicitly selected Pi parent/child transcripts, delegation ledgers, feedback and artifacts.
- Preview exact source hashes before private retention; show chronological excerpts, full sources,
  per-transcript usage coverage and missing evidence through the existing CLI/Pi learning flow.
- Attach operator findings and proposals to exact retained source lines.
- Acceptance, calibrated improvement and policy adoption are not inferred from session prose or notes.
- No new model calls, automatic skill edits or expansion of the existing adoption policy scope.

## 0.16.0 — Unreleased

### Added

- Guided retained learning through `skill-harness learning`, `/skill-harness learning`, and the existing producer bridge: named cases, actual retained evidence, complete-artifact comparison review, hypotheses and separate adopt/reject/defer decisions.
- Scope-bound trust setup with frozen cohorts and independently attributed labels, plus explicit later-outcome linkage. Readiness stays silent when evidence is missing; opening it does not reserve attention or start work.
- Public learning API and offline product guide/requirement register, paired with pi-daddy 0.27.0's ordinary-work model/effort policy profile and producer-owned registry controls.

### Fixed

- Activation linkage requires the original applied registry view, exact request and active/last-change adoption identity, and the complete prepared receipt. Incomplete or mismatched proof fails closed; intent and preference do not activate policy.
- Adoption help points to the implemented `/grants learning` in interactive Pi. Packaging coverage uses the unmodified packer; implementation-rewriting canaries are removed while normal input/archive-integrity checks remain.

### Compatibility and release status

- Feature PR #80 merged at `c6cd55d4db9ccf9a1ec790459c3cc5e6b1eac69f` with green CI and Sol approval. Source/built cross-package registry/learning integration passed with synthetic fixtures; that is not a final released install.
- Results remain schema 3. The four public packages and private root/Pi-extension boundaries are unchanged. This metadata preparation changes no runtime code or third-party dependency; no scorecard migration or model rerun is required merely for the version bump.
- Canonical release archives, fresh installed two-extension verification and publication remain pending. Fixture labels are not human approval, calibration, production adoption, acceptance or efficacy. Existing active sessions require a fresh Pi session to load a newer immutable bridge.
- Draft post: [A preference is not an activation](docs/posts/2026-09-14-a-preference-is-not-an-activation.md).

## 0.15.0 — 2026-09-12

### Added

- Retain content-addressed projection-only runtime facts with exact attempt terminal evidence and obligation acceptance/coverage while unavailable checkpoint, wait and prior-acceptance facts remain explicit.
- Retain monotonic bounded learning-lifecycle navigation across case, hypothesis, comparison, optional human choice, adoption, rollback and later outcomes. Missing stages stay null and immutable evidence identity cannot regress.
- Publish the exact loaded dashboard bridge for pi-daddy's daily closing review and learning navigation without turning navigation into authority.
- Raise the runtime `js-yaml` floor to 4.3.2 after the release-bound production audit reproduced GHSA-2883-xcg3-v3hh against 4.3.1; the production audit is clean at the new lock.

### Compatibility and limits

- Results remain schema 3 and the four-package public publication set is unchanged. No scorecard migration or remeasurement is required merely to install 0.15.0.
- Runtime completion, retained evidence and a successful package smoke do not establish human quality choice, trust calibration, configured adoption, publication outcome or OS containment.
- The release smoke is path verification only. Existing historical comparison runs are not replayed or relabelled as packaged-route evidence.

## 0.14.0 — 2026-09-11

### Added

- The public `skill-harness` meta-package now declares and ships the Pi extension bundle, observer sibling and review assets. A fresh npm installation can load the extension directly; the private `@skill-harness/pi-extension` workspace remains unpublished.
- The loaded extension publishes a frozen same-process dashboard API bridge for exact archived-work source `127b349…`, allowing pi-daddy 0.24.0 to start its production connected daily host without fixture helpers or copied source jobs.
- Archived work can derive only exact scope, obligation and coverage from retained Work-v4 state when no declared facts exist. It creates no deadlines, waits, violations, prior acceptance, reopen history or unavailable artifact evidence.

### Changed

- Release packing and installed-package tests bind the new extension resource, direct runtime `typebox` dependency, bundle freshness and public inventory. The bundle imports only bridge-required host dependencies.
- The required real-Pi release smoke now uses subscription `gpt-5.6-sol` as subject and distinct `gpt-5.6-terra` as judge. Its finite limit remains Pi process invocations, not complete provider-call accounting.
- Connected-factory documentation distinguishes source, candidate-installed, released-installed and loaded-session identity and preserves the existing producer transport decision.

### Compatibility and limits

- Results remain schema 3 and the four-package public publication set is unchanged. No scorecard migration or remeasurement is required merely to install 0.14.0.
- Candidate/released extension loading and host startup are path evidence, not model efficacy, human acceptance, adoption, native authentication or OS containment.
- C06 human choice/reveal/adoption/later outcomes and C08 genuine-domain evidence remain external and are not release claims.

## 0.13.0 — 2026-09-11

### Added

- Explicit external evidence lifecycle APIs and the model-free `archive ingest|inspect|watch` CLI, with retained-byte checkpoints, access policy, review/export boundaries, and pinned pi-daddy execution-retention-v2 validation.
- Durable work capture, signals, case review, blind intervention comparison, investigation, learning, adoption, and rollback primitives. These record bounded decisions; they do not authorize deployment or claim outcomes.
- A read-only archived-work adapter generated from pi-daddy's work-v4 parser/projector and a two-domain local replay that composes retained evidence without changing either producer.
- Bounded Codex subscription transport, original-producer accounting, and an installed-resource `AgentSession.prompt` review path with exact resource/session/wire bindings, seal-before-judge ordering, no tools, and no retries.

### Changed

- Qualification and trusted-host supervision retain stricter caller/child lifetime, source-cancellation, response-terminal, model-role, and settlement evidence.
- CI now checks both new generated archive reader trees byte-for-byte against immutable producer commit `7c78769c47177b1972b09e1f5c5474ad44cd2cac` before ordinary tests can run.
- The withdrawn mutation-testing command and catalogue are removed. Historical mutation evidence remains historical; ordinary regression and contract checks remain.

### Compatibility and limits

- Results remain schema 3; schema-1/2 compatibility and schema-3 delivery semantics are unchanged. No scorecard migration is required merely to install 0.13.0.
- Historical pi-daddy ledger-v2 and ledger-v3 selectors stay pinned. The new work-v4 and execution-retention-v2 readers are separate immutable selectors and are not moved to a producer's latest release.
- Four npm packages remain public: core, adapters, CLI, and the unscoped meta-package. The monorepo root and `@skill-harness/pi-extension` remain private and are never published.
- Local replay, successful transport, advisory review, and retained evidence are not OS containment, remote attestation, deployed efficacy, adoption, campaign acceptance, or native acceptance.

## 0.12.0 — 2026-09-04

### Added

- Results schema 3 retains adapter-computed subject delivery observations, named prompt normalization provenance, per-repetition criterion votes, and recomputable panel outcomes.
- Schema-v3 `skill_delivered` is a semantic boundary, not observation-only metadata: known zero/duplicate delivery becomes `NOT-MEASURED`, is never judged, is excluded from efficacy denominators, and blocks SHIP without blaming the product. Unobservable or unauthenticated instrumentation remains `ERROR`.
- `skill-harness screen <run-dir>...` derives delivery-proven control/treatment rates, a separate not-measured bucket, and criterion failure rates offline with zero model or judge calls.
- The permanent offline mutation catalogue now covers schema-v3 validation, delivery outcomes and judge suppression, observer provenance, and screen classification/filtering.
- Extension-free observer logs are HMAC-authenticated and source-bound; truncation/replay/tampering becomes ERROR. Same-process extensions or arm runtime injection fail observation closed instead of receiving a forgeable capability.
- Schema 3 retains `criterion_count` and rejects truncated criterion arrays or adjudication state/verdict that diverges from recomputed clean votes.

### Compatibility

- Schema 1 and schema 2 results remain readable at their recorded version. Reads never rewrite or migrate evidence on disk.
- Schema 1 and schema 2 retain their historical meaning. Schema 3 deliberately changes the meaning of a result: behavioral efficacy is reported only after delivery is established. Judge prompts, verdict parsing, and panel vote collapse are unchanged; scoring now excludes `NOT-MEASURED` from its denominator.
