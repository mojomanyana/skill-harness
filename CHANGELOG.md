# Changelog

## Unreleased

### Added

- Results schema 3 retains adapter-computed subject delivery observations, named prompt normalization provenance, per-repetition criterion votes, and recomputable panel outcomes.
- Objective `skill_delivered` findings fail or error when model-visible prompt bytes contain zero, duplicate, or unobservable skill contracts.
- `skill-harness screen <run-dir>...` derives delivery-proven control/treatment rates and criterion failure rates offline with zero model or judge calls.

### Compatibility

- Schema 1 and schema 2 results remain readable at their recorded version. Reads never rewrite or migrate evidence on disk.
- Judging prompts, verdict parsing, scoring semantics, and panel aggregation are unchanged; schema 3 adds observation and validation only.
