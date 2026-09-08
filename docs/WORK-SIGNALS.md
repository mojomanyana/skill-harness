# Additional frozen structural signals — P07 rule slice

`detectAdditionalWorkCases(snapshot, facts)` implements the remaining rule predicates over explicit frozen HOST facts, not inferred display timestamps or worker prose:

- One known pending checkpoint for an obligation, observed after its declared deadline, can nominate overdue work. Met/future checkpoints do not; unknown or contradictory checkpoint facts become coverage issues, never a latest-timestamp winner.
- Reopened acceptance requires the SAME obligation, intent, policy and artifact digests plus an explicit prior acceptance evidence reference. Changed requirements/policy/artifact cannot masquerade as an escape.
- An independently evaluated objective FAIL may nominate an intent conflict. Objective ERROR or unavailable scope/coverage stays a coverage issue. Declared waiting does not conceal an independently supplied effect violation.

The host must establish provenance, exact scope binding and availability of those facts. Passing arbitrary objects is not authentication. Without those inputs the rule does not invent them. No model or worker is called, no control state is changed, and all nominations remain silent/unresolved/causal-not-established.

New defect signal records explicitly use `capture_schema:3`; the pinned capture_schema2/reviewer contract is NOT silently widened. Coverage issues retain their existing v2 meaning. Distinct observations are retained by content identity, not last-write-wins. This initial fact profile permits one unambiguous checkpoint observation per obligation; richer multi-checkpoint histories need a versioned input profile.

`retainWorkSignalObservation(root, snapshot, facts)` now retains closed, canonical private host-fact inputs under `work-signal-observation-v1`. `readWorkSignalObservation(root, manifestId)` reopens verified bytes and rederives the nominations; it never trusts cached case output. Unknown fields/accessors, sparse arrays, duplicate obligation digests, malformed scope and missing/corrupt bytes refuse. Input arrays preserve order, changed observations remain distinct, and invalid JSON diagnostics omit raw excerpts. This format binds the `work-signals-v1` rule semantics; a semantic revision requires a new explicit format/reader, not reinterpretation of old inputs.

Retention proves the bytes of the supplied declarations, not their truth, host authentication, live P01 provenance or availability of separately referenced evidence. No extra unknown metadata (including credentials or worker prose) is accepted for retention. Existing v2 case/review APIs remain unchanged and reject these separate observation manifests.

`captureWorkSignalCases` plus the explicit `createWorkSignalReviewer` now bridge frozen observations to bounded case cards and the existing durable decision writer. Case references rederive their nomination from original bytes on every access; another observation's case or missing inputs cannot support a decision. The old v2 reviewer remains unchanged. See `contracts/work-signals/v1/README.md` for the separate wire/API contract.

Remaining integration: opt actual dashboard clients into these card versions, bind live declared checkpoints and independent outcomes, and complete deployed P07/P08/calibration policy. Existing v2 review clients must reject/defer unsupported v3 rather than reinterpret it. This rule slice is not full P07 acceptance.

```sh
node node_modules/vitest/vitest.mjs run packages/core/test/work-signals.test.ts
```

Fixtures are independent synthetic host facts, not live observation or confirmed production defects.
