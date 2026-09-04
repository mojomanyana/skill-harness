# Results schema 3: retained observations

Schema 3 makes a completed run screenable without replaying either model.

## Compatibility

`results.yaml` with schema 1 or 2 remains readable. Reading never rewrites it. Rewriters preserve a schema-3 record's observations; they cannot manufacture observations for older files. Unknown historical evidence therefore remains UNKNOWN.

## Subject delivery

Each `subject_invocations[]` entry identifies a scenario, repetition and retry attempt and contains one provider request's `prompt` observation:

- `mechanism`: `none`, `pi-skill`, `append-system-prompt`, or `system-prompt-file`;
- `contract_sha256`, `contract_bytes`, and `contract_occurrences`;
- `raw_sha256` and `bytes` for the model-visible prompt projection from Pi's final provider payload;
- `normalized_sha256` and `normalization_rule`;
- per-request `status`: PASS when that request has the expected occurrence count; FAIL for a contradictory count; ERROR when no supported payload can be observed. The aggregate gate uses only the terminal retry attempt: force/system-prompt requires one on every request, red requires zero throughout, and green progressive disclosure permits leading zeroes but requires an eventual exactly-once delivery and forbids duplicates.

The internal Pi extension runs last, observes `before_provider_request`, and never changes the payload. User-role bytes are excluded from occurrence counting so a stimulus quoting the contract cannot prove delivery. Plaintext payloads are not retained.

## Normalization registry

| ID | Transformation |
|---|---|
| `cwd-line-v1` | Replace the complete value of every line beginning exactly `Current working directory:` with `Current working directory:<normalized>`. Preserve every other byte. |

Changing this registry changes `source_hashes[observation:prompt-normalization]`; lint's honest remedy is a new run because payload plaintext is intentionally not retained.

## Objective gate

Every schema-3 scenario carries a `skill_delivered` objective assertion derived from its observations. FAIL or ERROR outranks the judge under the existing objective-gate precedence. The gate does not change grading, scoring, or panel rules; it prevents those rules from operating on a falsely labelled delivery.

## Judge votes and recomputation

`scenario.rep_judgments[]` records every repetition, including that repetition's objective delivery result. Each `judgments[]` member retains judge identity, ordinal, overall verdict/reason/suspect, and one verdict/reason for every numbered criterion. An omitted criterion is retained as criterion `ERROR`, not silently dropped. Runtime validation recomputes each panel's recorded verdict from clean votes, verifies the per-repetition delivery objective against that repetition's terminal retry, and rejects divergence. Existing vote collapse semantics are unchanged.

## Offline screening

`skill-harness screen <run-dir>...` groups by skill, model, and scenario. It counts only PASS/FAIL outcomes whose delivery observation passed, and reports control/treatment rates plus per-criterion fail rates. Classification uses control rate: CEILING ≥80%, FLOOR ≤10%, INFORMATIVE 20–70%, otherwise UNKNOWN. The command never resolves an adapter and makes zero subject/judge calls.
