# Risk-adaptive and critical-assurance workflow measurement

## Contract and evidence boundary

Implementation is based on immutable principal-pi-skills PR #31 head
`961f8ccbdb2a12e92db1e1b2d4ab7ca50f9d7d21`. GitHub's `ci / spec-lint` check for that exact
commit was `SUCCESS` when implementation began. The PR head had not advanced, so no contract delta
was accepted. The source manifest calls itself unpublished `3.0.0`; skill-harness does not depend on
that npm version.

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
- `schemas/results-v2.schema.json`

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

Every normalized event has `event_version: "1.0"`, a replay sequence, `type`, `source`, promoted
correlation fields (`run_id`, `task_id`, `workspace_id`, `context_id`), separate `digests.head` and
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
- **pi-daddy-v1** explicitly supports the current unversioned 0.17 grant ledger and the versioned v1
  governance supplement. Legacy requested/effective/denied capabilities, definition digest,
  parent/child IDs, approval source/scope, and gate outcome normalize without inventing missing
  task/workspace/expiry fields. Unknown versions fail with a schema/version message.

Multiple native ledgers are merged by recorded timestamps only after each stream's native order is
validated. Equal cross-stream instants, missing timestamps, duplicate principal run streams, and
pi/native ties are ERROR because they cannot prove a strict order. Native sequence remains in
`attributes.native_seq`; declaration/file order is never presented as workflow chronology.

Stable normalized refusal codes include `CAPABILITY_ESCALATION`, `UNDECLARED_CAPABILITIES`,
`UNKNOWN_CAPABILITY`, `APPROVAL_REQUIRED`, `APPROVAL_NO_UI`, `APPROVAL_DECLINED`,
`APPROVAL_DISMISSED`, `APPROVAL_ERROR`, `DEPTH_LIMIT`, and `NON_NARROWING_GRANT`. A legacy refusal
that cannot be classified is `LEGACY_UNCLASSIFIED`, never success.

`writer: "build"` in principal state is workflow metadata. Only a measured
`writer_lease_acquired`/`writer_lease_conflict`/`writer_lease_released` pi-daddy event proves
coordination among children governed by that pi-daddy instance. It does not prove exclusion of an
unrelated process. Initial CWD validation is not path confinement.

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
normalized artifacts and verifies 15 mutations turn objective assertions red: required-event removal,
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
