# Frozen work signals and explicit review bridge — v1

Additive adapter APIs, not a reinterpretation of `contracts/work-capture/v2`.

1. `retainWorkSignalObservation(root, snapshot, facts)` validates closed bounded host declarations and retains canonical `work-signal-observation-v1` bytes. Returns `{manifestId,inputSha256}`.
2. `readWorkSignalObservation(root, manifestId)` reopens verified bytes and rederives `work-signals-v1` cases. It rejects missing/corrupt/mismatched/unsupported input; unknown scope stays an explicit issue, not an empty success claim.
3. `captureWorkSignalCases(root, observationId)` creates immutable case references and a selected batch. Case parser `work-signal-case`/`1` stores `{version:'work-signal-case-v1',observationId,caseId}`; no cached verdict. Batch parser `work-signal-batch`/`1` stores `{version:'work-signal-batch-v1',observationId,candidateIds,visibility:'silent',promotion:'not-authorized'}`. Both source identities bind the referenced observation/case.
4. `createWorkSignalReviewer(root,batchId,operatorAuthor)` exposes `list(offset=0,limit=5)`, `history(caseManifestId)` and `decide({caseManifestId,priorDecisionId,disposition,note})`. Decisions use the existing durable lock/CAS/history writer and `decision_schema:1`. No new history engine or worker control path.

Each selected case is rederived from its original input on access, including immediately before decision storage. Case membership in the exact observation is checked; a valid case from a different observation cannot be substituted. Missing original input blocks decisions. `list` additionally returns `observationId` and observation `issues`, so unresolved scope with zero cards is not hidden. Counts describe the selected batch, not exhaustive live work or calibration denominators.

Defect cards have `capture_schema:3` and explicit `overdue_checkpoint`, `reopened_acceptance`, or `intent_conflict` reason/metrics. Coverage issues retain `capture_schema:2`. Both remain silent/unresolved/causal-not-established nominations. The old `createWorkCaseReviewer` accepts only its original v2 batch contract and REFUSES these new batches. A UI must opt into this bridge and these card versions; existing pi-daddy pinned v2 clients are not upgraded by this library addition.

`operatorAuthor` and supplied facts are conditional host declarations, not authentication. Retained inputs do not prove the truth/availability of external referenced evidence, active branch, an authenticated human pause or authority to expose/promote/adopt. Live source capture, actual dashboard version selection, privacy/role authority and automatic pause/exposure policy remain integration work.

Limits: closed input arrays at most256 entries, input bytes at most1MiB, selected batch at most1024 unique case manifest IDs, batch/case payload reads at most128KiB, pages at most5. Existing non-expiring decision locks and1MiB history bound remain. Trusted local archive integrity is not hostile same-UID containment, rollback resistance or a storage quota.

Changing rule semantics requires a new explicit observation format/reader. Preserve old inputs, outcomes and decision corrections; never silently relabel a saved nomination or erase an unknown result.
