# Results schema 3 compatibility

Fresh runs write schema 2. Readers and artifact-only rewrite commands still accept
schema 3 so committed result corpora remain usable; reading alone never rewrites a
file or invents missing observations.

## Delivery observations

A schema-3 scenario may contain `skill_delivered` and top-level
`subject_invocations`. Each invocation records prompt provenance, delivery contract
identity, mechanism, and status. Readers recompute terminal delivery from the retained
invocations and reject inconsistent stored aggregates.

Delivery status affects interpretation:

- `PASS`: behavioral evidence may be scored.
- `FAIL`: the contract was not delivered exactly once; verdict is `NOT-MEASURED`.
- `ERROR`: instrumentation evidence is incomplete; verdict is `ERROR`.

`NOT-MEASURED` is excluded from efficacy denominators and blocks SHIP. Missing evidence
is never converted to PASS.

## Prompt normalization

Supported normalization identities are registered explicitly. A retained
`source_hashes[observation:prompt-normalization]` value remains readable, but payload
plaintext is not retained and cannot be reconstructed.

## Criterion panels

`scenario.criterion_count` records rubric cardinality.
`scenario.rep_judgments[]` records each repetition's objective result and judge panel.
Every judgment retains judge identity, ordinal, overall verdict/reason/suspect, and one
verdict/reason for each criterion.

Validation requires:

- unique contiguous criterion indexes `1..criterion_count`,
- panel verdicts that match clean-vote collapse,
- repetition delivery objectives that match terminal invocation evidence,
- scenario verdict/suspect values that match repetition aggregation,
- adjudication state and verdict consistent with the recomputed collapse.

An omitted criterion is `ERROR`, not a silently dropped vote. Behavioral PASS/FAIL
requires at least one clean judgment unless objective behavioral evidence directly
produced FAIL.

## Rewrite policy

`grade`, `regate`, `rescore`, review-UI rejudge, and override writes preserve schema-3
fields they do not recompute. They do not synthesize delivery evidence for schema 1/2
files. A retained result that names the removed direct `claude-code` judge is readable;
its next judge-backed rewrite uses the current Pi default and records the replacement
judge.
