# Risk-adaptive and critical-assurance workflow measurement

## Contract and evidence boundary

The qualification product pin is immutable principal-pi-skills merge head
`a6596950d64a3a525f95329d5dbd3e38948be408` (tree
`960359d69deb6f216724b86e13eef67e2f6a6aa1`), matching
`PRINCIPAL_QUALIFICATION_PRODUCT_PIN` in `packages/core/src/qualification-config.ts`.
The earlier implementation baseline was PR #31 head `961f8cc…`; the merge advanced after that
snapshot, so the old statement that the head "had not advanced" is historical, not the active pin.
The source manifest calls itself unpublished `3.0.0`; skill-harness does not depend on that npm
version.

The principal repository contributes **static contract inputs**, not model evidence:

- seven E1 skill scenarios plus Git-Ops stale-receipt E2 are statically linted and have not been
  model-run;
- its eight live workflow E2E cells are specified and have not run;
- historical v2 result cells are not v3 evidence.

The example pack at `examples/principal-v3-pack/` preserves that boundary. Its normalized protocol
fixtures prove the evaluator can accept and reject saved event sequences; they do not report any
principal model cell as executed and do not replace `principal-pi-skills/tests/e2e/run-e2e.sh`.

## Specification schema

`schema: 1` is optional in `specification.yaml`; omission reads as v1, preserving 0.8 specs.
The machine-readable schemas are:

- `schemas/specification-v1.schema.json`
- `schemas/trajectory-event-v1.schema.json`
- `schemas/results-v2.schema.json` (legacy/read-compatible)
- `schemas/results-v3.schema.json` (prompt delivery + criterion-vote observations)

Trajectory assertions are additive under `assert.trajectory`:

```yaml
env:
  workspace: empty-git
  event_sources:
    - adapter: principal-assurance-v1
      path: .git/principal-pi-skills/assurance-v1/runs/*/events.jsonl
    - adapter: pi-daddy-v1
      path: .pi/grants-ledger.jsonl
      required: false

assert:
  trajectory:
    version: "1.0"
    require:
      - event: phase_completed
        where: { phase: build }
    ordered:
      - - { event: code_changed }
        - { event: phase_completed, where: { phase: build } }
        - { event: evidence_recorded, where: { exit_code: 0 } }
    correlate:
      - left:  { event: code_changed, select: last }
        right: { event: evidence_recorded, select: last }
        same: [run_id, task_id, workspace_id, digests.head, digests.tree]
        order: before
    freshness:
      - subject: { event: review_recorded, select: last }
        after:
          - { event: code_changed, select: last }
          - { event: task_packet_recorded, select: last }
          - { event: phase_completed, where: { phase: build }, select: last }
        same: [run_id, task_id, workspace_id]
    unique:
      - events: { event: review_recorded }
        fields: [context_id]
```

The closed DSL has no expressions or callbacks. It supports:

- required events with count bounds, and forbidden events, both with exact or regex argument predicates;
- ordered chains;
- same/different-field and before/after correlations;
- freshness after the last matching change, authority, and persisted Build completion event;
- uniqueness (for fresh context IDs);
- post-supersession mutation prohibitions;
- approval ID/capability/source/scope/grant-order/expiry/use checks (ID and capability binding are intrinsic even if `same` omits them);
- requirement coverage.

Missing relation fields are `ERROR`, not a governance pass. A failing or errored trajectory gate runs
before the judge and objective evidence continues to outrank the judge (`override ?? objective ??
judge`). An explicit author override remains the only override.

## Normalized event model and adapters

Writers emit normalized events with `event_version: "1.1"`; readers also accept legacy `1.0`
events that do not carry the 1.1 execution-identity/deadline fields. A 1.0 event carrying those
fields is rejected rather than pretending an older closed reader could consume it. Every event has a replay sequence, `type`, `source`, promoted
join fields under adapter-specific trust semantics, separate `digests.head` and
`digests.tree`, and optional capability, approval, refusal, receipt, and attribute fields. Native
fields not promoted remain under `attributes`; normalization does not throw information needed for
ordering away.

Adapters:

- **pi** maps structured tool starts/completions to `tool_started` / `tool_completed` and records the
  native call ID, issue/completion order, arguments, success, and result digest.
- **principal-assurance-v1** accepts only schema `1.0`, verifies contiguous sequence, one run ID,
  `prev_digest`, recomputed `event_digest`, and non-decreasing recorded timestamps before
  normalization, and preserves principal event names verbatim
  (`risk_classified`, `task_packet_superseded`, `repair_suspended`, `finalization_completed`, etc.),
  and promotes packet/build/evidence/finalization identity.
- **pi-daddy-v1** is the historical *adapter selector* name. It supports the public unversioned
  pi-daddy 0.17 `GrantRecord` and pi-daddy's `ledgerVersion: 2` events, pinned to the producer's
  canonical contract artifacts at immutable pi-daddy 0.19.0 commit
  `c364a6717e3d5e369ecd3298b9cbb595eb94d9b2`. V2 dispatch happens
  before the legacy fallback and covers `capability_decision`, `workspace_lease`, `child_lifecycle`,
  and `check_receipt`. The former `schema_version` / `record_type` “governance v1” shape was a
  hypothetical harness fixture, not a pi-daddy release format; it is no longer accepted or cited as
  evidence. Unknown explicit `ledgerVersion` values fail with the received and expected versions.

### Pinned producer contract

The contract is **interpreted, not transcribed**. `contracts/pi-daddy/ledger/v2/` holds
byte-exact copies of the producer's `ledger-event.schema.json`, `src/refusals.ts`, four builder
fixtures, and contract README, with repository, commit, source paths, schema digest, and
per-artifact SHA-256 in `PINNED.json`. A v2 record is validated
against that closed schema *before* semantic normalization, so an undeclared top-level field, an
invalid `signal`/`outcome`/`state`/`access`/`executor`/`gateOutcome`/approval enum member, wrong
nullability, and requiredness drift all fail closed by construction rather than by a check someone
remembered to write. The evaluator refuses any JSON Schema keyword it cannot enforce, so a future
contract construct is a loud failure and not a quiet hole.

The accepted refusal vocabulary is derived directly from the pinned schema rather than restated.
The real-builder verifier imports the producer's compiled `REFUSAL_CODES` from the exact checkout
and proves it set-equal to both schema and adapter. `packages/adapters/test/pi-daddy-contract.test.ts`
asserts the artifact digests, that the runtime schema copy still equals the vendored bytes, and that
**every remaining** vocabulary the adapter restates — refusal field/detail-type names, event
discriminators, approval sources and scopes,
lease outcomes and access, lifecycle states, executors, and the correlation field whitelist including
which of its fields are numeric — is set-equal to its place in the pinned schema, in both directions. A hand-maintained second vocabulary without that drift assertion
is how `GRANT_ID_MALFORMED` came to read as "unsupported", and with the schema gating first, a set
that drifts *narrower* now produces the mirror failure: a contract-valid record admitted by the
schema and then thrown out by a stale harness check. The two harness-side subsets — which lease
outcomes a receipt may be appended after, and which may precede that release — are asserted as
containment rather than equality, because they encode harness semantics; anything the test
equality-asserts belongs in the restated manifest instead. Both manifests are guarded against
vacuity, so emptying one is a red test rather than a green one.

The evaluator refuses more than an unknown keyword. A keyword whose *value* has an unexpected shape
(`required: "a"`) and a `$ref` carrying sibling constraints are both refused, because either would be
skipped downstream and validate less than the schema declares. `format: date-time` is evaluated as
RFC 3339 §5.6 actually reads — lowercase `t`/`z` and a leap `:60` included — so a conforming producer
line is never reported as a contract violation; the harness's own narrower timestamp rule still
applies afterwards, where it is labelled a harness requirement.

It is free and offline after dependencies are installed. `node scripts/check-pi-daddy-contract.mjs`
runs the vendored four-fixture check and negative control. For cross-repository evidence, use
`npm run verify:pi-daddy-contract -- <clean-pi-daddy-checkout>`: it requires the exact pinned HEAD,
builds both repositories, imports production builders/refusal enumeration, validates builder output
against the pinned schema, preserves joins, and applies negative mutations. CI obtains that checkout
at the literal SHA rather than pi-daddy `main` or npm. A positive-only check cannot tell "the gate
ran" from "the gate is gone".

The producer's schema is the floor. Requirements the harness adds on top run *after* a record is
admitted, and are harness requirements rather than contract violations: nested
`correlation.run_id`/`correlation.task_id` (pi-daddy permits an uncorrelated v2 line; the harness
cannot join one to workflow evidence, so it fails as unjoinable), a git-object-shaped receipt
`treeSha`, the correlation byte/secret bounds below, and every semantic relation in this section.

Pi-daddy v2 mapping:

| pinned pi-daddy v2 field | Normalized trajectory field |
|---|---|
| `ledgerVersion`, `event`, `ts` | `source: pi-daddy-v2`, event-specific `type`, `at`; native discriminator/version also remain in `attributes` |
| `correlation.run_id/task_id/context_id/phase` | `run_id`, `task_id`, `context_id`, `phase`; required workflow IDs fail closed when absent |
| `correlation.workspace_id` | retained under `attributes.correlation` as a non-authoritative controller label; never promoted by itself to canonical `workspace_id` |
| trusted `taskDigest` / complete `definitionDigest` | validated SHA-256 `digests.task` / `digests.definition`; a present definition requires non-empty name, source, and digest |
| correlation `plan_digest/task_digest/definition_digest` | non-authoritative opaque `digests.correlation_plan/correlation_task/correlation_definition` (and the full nested correlation remains in `attributes.correlation`); secret-shaped values are refused |
| correlation `base_sha/head_sha/tree_sha` | `digests.correlation_base/correlation_head/correlation_tree`; never promoted as measured candidate identity |
| correlation `event_seq/last_change_seq/last_authority_seq/check_receipt_id` | same snake-case names in `attributes` |
| `parentId`, `childId`, top-level `workspaceId` | `parent_id`, `child_id`, `workspace_id`; a top-level/nested workspace mismatch is rejected |
| capability arrays and `blocked` outcome | deduplicated requests, validated disjoint result subsets, and requested/granted/refused/spawn-refusal events; pre-resolution refusals may leave requests unclassified, approved stale gated entries do not become refusals, a blocked spawn emits no grant, and execution starts only on lifecycle `starting` |
| approval source/scope/expiry/use maps | enum- and relation-validated `approval_used` plus structured approval fields and use bounds; tools-form delegation uses pi-daddy's isolated `<delegate>` subject |
| structured `refusal` | pinned refusal-code taxonomy plus scalar structured details when the producer recorded one; low-level lease failures and blocked chain records may legitimately omit it rather than invent a code |
| lease access/outcome/recovery/release | write access → `writer_lease_*`; read access → `workspace_read_*`; complete lease state remains in `attributes` |
| lifecycle state/executor/exit/signal flags | `child_started/completed/failed`, `exit_code`, and lifecycle attributes; executor is restricted to `process` / `herdr` |
| receipt/workspace/check/tree identity | `check_receipt_recorded`, `workspace_id`, `digests.tree` **from the receipt's top-level `treeSha` only**, and receipt/check IDs in `attributes`; `receiptId` must be SHA-256. `correlation.tree_sha` is kept solely as `digests.correlation_tree` and is **not** required to equal it — the producer's builders emit the two independently, so requiring agreement both rejected pi-daddy's canonical receipt and let a controller string vouch for a measured identity |

Every v2 variant requires nested `correlation.run_id` and `correlation.task_id` before it can enter a
trajectory; missing join identity is an actionable ERROR rather than an unjoinable event. That is a
harness join requirement, not a contract violation — pi-daddy's closed schema makes `correlation`
optional, so the record is admitted by the producer's schema and then refused here. Correlation
also enforces pi-daddy's pinned field whitelist, value types, 512-character string bound, 4 KiB scope
bound, and 32 KiB total bound, preventing it from becoming an arbitrary payload or secrets sink. Every
assembled native attribute object and persisted collection error is sanitized before persistence, with
free-text diagnostics stored only as redacted digests and malformed native values never echoed raw. Values absent
from the native record are omitted rather than synthesized as false/empty or stringified as `"undefined"`. Legacy 0.17 remains intentionally
lossy: task/workspace/correlation/expiry evidence that its public record never carried is not invented.
Pi-daddy's correlation metadata is controller-supplied and non-authoritative; only the top-level v2
`taskDigest`, definition digest, and a check receipt's measured `treeSha` are promoted as trusted
identities. Correlation copies stay under explicitly named `correlation_*` digest keys, so a controller
value cannot satisfy an assertion over measured `digests.head` / `digests.tree`. A regression fixture
in which a receipt's `treeSha` and `correlation.tree_sha` deliberately differ proves which one
`digests.tree` comes from, and that an assertion over the correlation value does not pass.

Multiple native ledgers are merged by recorded timestamps. Equal cross-stream instants, missing
timestamps, duplicate principal run streams, and pi/native ties are ERROR because they cannot prove a
strict order. One pi-daddy exception is intentional: `check-runner.ts` stamps the check's earlier end
time but appends the receipt immediately after the later matching lease-release line. The adapter accepts
only that bounded inversion when the same check owner most recently acquired the workspace before the release, uses semantic
timestamps for normalized chronology, and retains append order in `attributes.native_seq`. Every other
pi-daddy event must remain non-decreasing within the same run/task/workspace/child stream; independent
children and runs may interleave because pi-daddy timestamps before taking its cross-process append lock. Other native adapters remain
non-decreasing per source. Declaration/file order is never presented
as cross-stream workflow chronology.

There are two refusal vocabularies and they are not the same list. A **v2** record carries the
producer's own code, and the accepted set is derived exactly from `#/$defs/refusalCode` in the pinned
schema — 32 codes at commit `c364a67`, including `GRANT_ID_MALFORMED` and the
production-reachable `WORKSPACE_NOT_AUTHORIZED`. The latter's real planner/builder regression
fixture preserves its exact denied `workspace:<id>` capability, structured refusal, nested
correlation, and run/task joins. The real-builder verifier independently checks the production
`REFUSAL_CODES` export against that derived set. **Legacy 0.17**
records carry no structured refusal, so the adapter
classifies them into its own stable normalized codes: `CAPABILITY_ESCALATION`,
`UNDECLARED_CAPABILITIES`, `UNKNOWN_CAPABILITY`, `APPROVAL_REQUIRED`, `APPROVAL_NO_UI`,
`APPROVAL_DECLINED`, `APPROVAL_DISMISSED`, `APPROVAL_ERROR`, `DEPTH_LIMIT`, `MISSING_TASK`, and
`NON_NARROWING_GRANT`. A legacy refusal that cannot be classified is `LEGACY_UNCLASSIFIED`, never
success.

`writer: "build"` in principal state is workflow metadata. Only a measured
`writer_lease_acquired`/`writer_lease_conflict`/`writer_lease_released` pi-daddy event proves
coordination among children governed by that pi-daddy instance. `workspace_read_*` preserves read
activity but is not evidence that a kernel lock excluded another process. Neither proves exclusion of
an unrelated process. Initial CWD validation is not path confinement.

## Critical release policy

`critical: true` and membership in top-level `critical:` are unified into one release-gating set.
For a critical scenario, the effective repetition threshold is always `1.0`: every clean repetition
must pass. This includes right-sizing counterexamples, so over-refusal and needless machinery can be
release failures. Ordinary scenarios retain their declared/default threshold.

Any judge/API/tooling `ERROR` remains `ERROR`; repetitions cannot vote it into PASS or turn it into a
behavioral FAIL. It blocks release as missing evidence. One objective failure cannot be outvoted by
other reps. A full green/force `run` that is NOT READY now exits non-zero; red baselines and partial
runs do not pretend to be release gates.

## Paired comparison

`compare` spends subject and judge calls. Confirm the skill, models, and judge before running it.

```bash
skill-harness compare build \
  --reference main \
  --candidate ../principal-pi-skills \
  --model fireworks:accounts/fireworks/models/deepseek-v4-pro \
  --reps 3 --mode force
```

A reference may be a git ref in the candidate repository or another skills root. Both sides run from
throwaway snapshots. The command refuses different scenario IDs, spec bytes, fixture/extension/system-prompt/post-test
inputs, subject model, mode, judge, or repetition plan. Test-input equivalence is preflighted before
the first subject call. Artifacts remain independently inspectable under:

```text
<candidate>/.skill-harness/comparisons/<timestamp>/<skill>/<model>/
  reference/
  candidate/
  comparison.yaml
  comparison.txt
```

The report records exact skill/spec/fixture/harness/model/judge digests, environment and harness CLI
versions, per-scenario regression/lift and flakiness, subject token coverage, judge/re-judge calls,
wall time, tool calls, delegated children, and maximum observed concurrency where available.
`--max-subject-token-increase`, `--max-wall-time-increase`, and `--max-tool-call-increase` are
separate opt-in cost/latency gates; crossing one—or lacking the data needed to evaluate a requested
maximum—exits 1 and blocks release, but never changes a cell's behavioral classification.

This is a **paired setup**, not deterministic sampling. The provider is not claimed to seed LLM
outputs. Exit policy: 2 for a critical behavioral regression; 1 for an ordinary behavioral/ship-bar
regression or unresolved infrastructure error; 0 otherwise. `--only` and `--affected` comparisons
are branch feedback and always say NOT READY/never SHIP.

## Assertion mutation self-test

```bash
skill-harness mutation-test
```

This command is deterministic, offline, and makes no model or judge calls. It starts from known-good
normalized artifacts and verifies 21 mutations turn objective assertions red: required-event removal,
forbidden side effect, transition reorder, workspace substitution, concurrent writer, approval
expiry, three freshness floors, head-equal/tree-different, non-zero receipt, missing requirements,
superseded-task mutation, context reuse, and finalization mismatch.

## Cost/latency availability

Wall time and judge-call counts are available for every newly run rep. Subject input/output/cache
tokens, subject cost, tool calls, delegated-child count, and maximum concurrency come from pi JSON
traces, so today they are available for reps that use structured execution (`assert.trace` or
`assert.trajectory`). Reports state the coverage (`reported reps / total reps`) rather than
presenting a partial sum as complete. Judge providers currently do not expose judge token counts.

## Sandbox status

Saved per-repetition trace/event hashes are compared during `regate`; missing reps and changed
artifacts are refused rather than shrinking or rewriting the denominator. Native payloads are
secret-redacted before normalized event persistence. Event artifacts remain gitignored unless a
human override deliberately preserves its audit evidence.

The principal digest chain is an integrity check, not external attestation: it detects torn or edited
saved logs but an unsandboxed subject that can replace and rehash a whole ledger can fabricate one.
No signature, MAC, trusted terminal digest, or remote witness is claimed.

No OS sandbox is claimed. Temp fixture directories and git workspaces are not containment. Core now
exports a `SandboxBackend`/`withSandbox` seam with fake-backed lifecycle/diff/network-policy tests.
A bounded follow-up is to add one Linux backend (container or bubblewrap), wire an explicit CLI flag,
capture its workspace diff, and test denied network/process/filesystem access on supported hosts.
Until that backend exists, reports must continue to say containment is unavailable.
