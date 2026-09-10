# Work-target cases and silent structural nominations (P07 partial)

The existing human-authored capture_schema1 and its skill/subagent promotion path are unchanged. `WorkCaptureCaseV2` is a separate work-target nomination, not a scored test or confirmed diagnosis. It carries exact selected snapshot/obligation identities, detector version/population, evidence hashes and bounded metrics. State is always unresolved, visibility silent, causal attribution not established. Promotion into a skill specification is not authorized by this record.

`detectWorkCandidates(work, options)` consumes the actual P01 `WorkProjection` under the host's independently established context—not arbitrary wire, a caller's acceptance claim, or reconstructed P04 summary. P04 intentionally omits configuration provenance, so its display rows alone cannot establish equivalent attempts. Options are bound to the exact selected scope and a named version/population; threshold/exemplar policy is fingerprinted.

Implemented rules:

- Repeated distinct, resolved executions with observed terminal occurrences, identical recorded configuration and matching current obligation/artifact/variant bindings can nominate repeat-without-progress.
- Declared-only state, different configurations, prior obligation revisions, declared waits and explicitly expected failures do not become that candidate.
- Missing/conflicted artifact/evidence coverage or unresolved acceptance produces a coverage issue, never a worker defect. Unresolved scope produces no case. Implementation `structural-work-v2` distinguishes a known `TRUSTED_REJECTION` from a coverage problem; it can support a repeat-without-progress hypothesis when the other observed facts are complete. Old implementation versions do not silently inherit this change.
- An economical exemplar requires acceptance under supplied authority plus observed, cited usage in one explicit unit and below its predeclared limit. Missing/estimated usage cannot qualify. This is not a first-pass-acceptance calculation or a universal agent score.

`captureWorkCandidates(root, work, options)` explicitly retains the actual structural snapshot before its candidate records and an immutable batch manifest. It runs outside workers; it is not a monitoring hook or automatic timer. Repetition is idempotent. `retainWorkCandidate`/`readWorkCandidate` validate identity/state; `groupWorkIncidents` groups multiple observations/versions of the same scoped work instead of counting each alert as an independent incident. All data stays in an explicitly selected private archive; no raw session text or source export is performed by the detector. A host must authorize capture of its supplied projection.

`appendWorkCaseDecision` produces an immutable, digest-bound correction chain and rejects stale parents or altered history. Skip stays skip, not agreement. The calling controller must establish the registered case and authorized author; this function does not authenticate a caller or promote a scenario. `createWorkCaseReviewer` now supplies selected-batch private decision storage, bounded read-only pages, exact-prior locking, idempotent replay and crash/partial-history refusal. It fixes the author at operator initialization and never obtains it from the case/request. This is not user authentication or automatic exposure; the nominator never supplies decisions. The downstream schema, real-store fixtures and host API are documented in `contracts/work-capture/v2/README.md`.

## Remaining scope

Checkpoint-overdue, reopened-acceptance and separately proved intent-violation predicates are implemented by the opt-in `work-signals-v1` API in `docs/WORK-SIGNALS.md`. They require corresponding frozen host facts and explicitly emit new defect case version3; the existing v2 review contract is not silently widened. Actual fact capture and v3 presentation/storage integration remain pending; timestamps/display rows are not enough. Deployed silent/calibration scheduling, authenticated decision UI/host integration, exposure policy, trusted independent labels, and scenario promotion remain pending. P08/P13 must not treat these unresolved candidates as calibrated truth or activation authority. Model interpretation, if later authorized, remains asynchronous/advisory.

Ordinary checks:

```sh
node node_modules/vitest/vitest.mjs run packages/core/test/work-capture.test.ts packages/adapters/test/work-candidates.test.ts packages/adapters/test/work-case-archive.test.ts
```

Fixtures here are deterministic synthetic host projections, not live observation, authority authentication or full P07 acceptance.
