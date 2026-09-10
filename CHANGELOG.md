# Changelog

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
