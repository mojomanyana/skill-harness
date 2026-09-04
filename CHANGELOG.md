# Changelog

## Unreleased

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
