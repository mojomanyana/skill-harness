# Results schema 3: retained observations

Schema 3 makes a completed run screenable without replaying either model.

## Compatibility

`results.yaml` with schema 1 or 2 remains readable with its historical meaning. Reading never rewrites it. Rewriters preserve a schema-3 record's observations; they cannot manufacture observations for older files. Unknown historical evidence therefore remains UNKNOWN.

Schema 3 is an intentional semantic boundary: a result means behavioral efficacy was evaluated only when contract delivery was established. Schema 1/2 did not make that guarantee.

## Subject delivery

Each `subject_invocations[]` entry identifies a scenario, repetition and retry attempt and contains one provider request's `prompt` observation:

- `mechanism`: `none`, `pi-skill`, `append-system-prompt`, or `system-prompt-file`;
- `contract_sha256`, `contract_bytes`, and `contract_occurrences`;
- `raw_sha256` and `bytes` for the model-visible prompt projection from Pi's final provider payload;
- `normalized_sha256` and `normalization_rule`;
- per-request `status`: PASS when that request has the expected occurrence count; NOT-MEASURED for known zero/duplicate delivery; ERROR when no supported or authenticated payload can be observed. The aggregate gate uses only the terminal retry attempt: force/system-prompt requires one on every request, red requires zero throughout, and green progressive disclosure permits leading zeroes but requires an eventual exactly-once delivery and forbids duplicates.

For an extension-free subject, the internal Pi extension runs last, observes `before_provider_request`, and never changes the payload. The observer HMAC-authenticates each complete observation plus a shutdown count; the parent rejects truncation, replay, mutation, or a missing summary, rebinds contract digest/length/mechanism, and recomputes status instead of trusting child JSON. User-role bytes are excluded from occurrence counting so a stimulus quoting the contract cannot prove delivery. Plaintext payloads are not retained.

Scenario/arm extensions and arm-supplied runtime environment are arbitrary code in Pi's own process. A positive in-process attestation cannot be hidden from hostile code in that same process. Such runs therefore receive parent-authored `ERROR` provenance, expose neither capture path to the child, and never load the observer. Ambient Node/native preload variables likewise fail observation closed. This fail-closed boundary prevents forged PASS evidence; it deliberately leaves extension-bearing runs unscreenable until an out-of-process recorder exists.

## Normalization registry

| ID | Transformation |
|---|---|
| `cwd-line-v1` | Replace the complete value of every line beginning exactly `Current working directory:` with `Current working directory:<normalized>`. Preserve every other byte. |

Changing this registry changes `source_hashes[observation:prompt-normalization]`; lint's honest remedy is a new run because payload plaintext is intentionally not retained.

## Objective gate

Every schema-3 scenario carries a `skill_delivered` objective assertion derived from its observations. `NOT-MEASURED` and `ERROR` prevent judging and block SHIP. `NOT-MEASURED` is excluded from efficacy pass-rate denominators rather than counted as product failure; `ERROR` remains an instrumentation/evidence failure. Existing judge and panel rules are unchanged, but schema 3 deliberately changes result semantics by requiring proven delivery before they operate.

## Judge votes and recomputation

`scenario.criterion_count` records the expected rubric cardinality, and `scenario.rep_judgments[]` records every repetition, including that repetition's objective delivery result. Each `judgments[]` member retains judge identity, ordinal, overall verdict/reason/suspect, and one verdict/reason for every numbered criterion. An omitted criterion is retained as criterion `ERROR`, not silently dropped; validation requires unique contiguous indexes `1..criterion_count`. Runtime validation recomputes each panel's recorded verdict from clean votes, verifies the per-repetition delivery objective against that repetition's terminal retry, and rejects divergence. A behavioral PASS/FAIL requires at least one retained clean judgment unless FAIL came directly from objective behavioral evidence. The top-level scenario verdict/suspect must match the retained repetition aggregate. Adjudication state and verdict must match the recomputed collapse (apart from the documented critical all-repetitions bound), and unresolved panels never enter `screen`. Existing vote collapse semantics are unchanged.

## Offline screening

`skill-harness screen <run-dir>...` groups by skill, model, and scenario. It counts only PASS/FAIL outcomes whose delivery observation passed, reports known-undelivered repetitions in a separate `not-measured` bucket, and reports per-criterion fail rates. NOT-MEASURED never enters either efficacy denominator. Classification uses control rate: CEILING ≥80%, FLOOR ≤10%, INFORMATIVE 20–70%, otherwise UNKNOWN. The command never resolves an adapter and makes zero subject/judge calls.
