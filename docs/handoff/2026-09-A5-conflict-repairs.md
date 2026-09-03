# A5 — A4 conflict repairs

Date: 2026-09-03
Branch: `wave1/audit-followups`
Mode: deterministic/offline repair. No model, judge, qualification, push, tag, publish, or sibling-repository write occurred.

## Identity gate

The required identity command was the first action. It confirmed principal-pi-skills
`e438a60`, pi-daddy `4a95243`, and skill-harness `15514c5`, all on
`wave1/audit-followups`; only the expected untracked `.pi/` directories and the untracked
A4 report were present.

## Repairs

### 1. Pi-daddy ledger-v3 producer repin

**Wrong:** vendored v3 metadata, qualification configuration/schema, CI, tests, and docs
still named the pre-merge snapshot identity.

**Evidence command:**

```bash
node scripts/vendor-pi-daddy-ledger-v3-contract.mjs ../pi-daddy \
  4a9524394ca995fd74ed9bbb836dc4e73cda3b8c
node scripts/vendor-pi-daddy-ledger-v3-contract.mjs ../pi-daddy \
  4a9524394ca995fd74ed9bbb836dc4e73cda3b8c --check
```

**Fix:** every v3/qualification/CI/doc pin now names
`4a9524394ca995fd74ed9bbb836dc4e73cda3b8c`. The producer tree remains
`7c006bff213142634f0f911ba9bd6add363ecaae`; all eight vendored artifact digests are
unchanged. A repository-wide search finds no reference to the former snapshot SHA.
The deterministic check reports:

```text
pi-daddy ledger-v3 pin is deterministic and current at 4a9524394ca995fd74ed9bbb836dc4e73cda3b8c
```

### 2. Six ship-gating assertions

The exact producer commands and observed raw shapes are recorded in
`examples/principal-v3-pack/tests/fixtures/principal-native/PROVENANCE.md` under
“A4 assertion-shape observations.” They were run, not inferred from prose.

| Cell | Producer owner | Wrong | Repair against emitted evidence | Mutation that now fails |
|---|---|---|---|---|
| V3-02 | principal assurance ledger | Invented assurance snapshots on run/task/finalization events. | Require the explicit critical request on `run_initialized.request`, a real critical task binding at `task_packet_recorded.packet.critical_scope.applies`, ordered finalization, and no downgrade. | Set packet `critical_scope.applies=false`. |
| V3-06 | principal assurance ledger | Tried to correlate top-level backfill head/tree fields that do not exist. | Require a real nonempty `backfill_completed.receipts` occurrence in the observed change→escalation→backfill→change order. Principal rejects a CLI-emitted backfill occurrence unless all required receipts match the frozen identity; the pack no longer claims an unavailable top-level correlation. | Empty `attributes.receipts`. |
| V3-07 | pi-daddy ledger-v3 | Looked for capabilities on child lifecycle events. | Require two `capability_granted capability=tool:read` events and two `child_started` events; correlate first and last pairs by `run_id` and `execution_id`; continue forbidding write grants and lease conflicts. | Change the second read grant to `tool:write`. |
| V3-08 | pi-daddy ledger-v3 | Asserted nonexistent `WRITER_LEASE_CONFLICT`. | Assert producer code `WORKSPACE_WRITE_CONFLICT` on `child_spawn_refused`; retain lease-conflict existence and workspace correlation. | Substitute `CAPABILITY_ESCALATION`. |
| V3-10 | principal assurance ledger | Invented `finding_adjudicated.evidence`. | Assert rejected disposition plus producer-required nonempty `reason`; principal's state machine rejects an empty/missing adjudication reason. | Set `attributes.reason` to an empty string. |
| V3-13 | principal assurance ledger | Correlated finalization tree to a gate that carries no identity. | Keep ordered keep→successful finalize gate→finalization, and correlate the final tree with the preceding real `evidence_recorded` tree. | Change only the finalization tree. |

`packages/core/test/principal-protocol-fixtures.test.ts` evaluates each corrected assertion
against the observed normalized shape and then applies the listed mutation. All six
positive cases pass and all six mutations fail.

### 3. Principal gate protocol fixture

**Wrong:** the finalization fixtures encoded synthetic
`gate_evaluated.attributes.result="pass"` and fabricated gate head/tree digests.

**Producer command:** the provenance file records the exact `assurance-state.mjs gate`
commands used for `finalize` and `finish`. They emitted:

```json
{"type":"gate_evaluated","gate":"finalize","code":"OK","missing_count":0}
```

**Fix:** both fixtures now use `code:"OK"`, `missing_count:0`, and no gate identity.
The final tree correlation uses the real evidence receipt. A dedicated regression mutates
both gates back to the old `result:"pass"` shape and proves the assertion does not pass.

### 4. Principal provenance identity

**Wrong:** both provenance documents carried a fabricated 40-character expansion of the
real short prefix.

**Evidence commands:**

```bash
git -C ../principal-pi-skills cat-file -t \
  e438a605c2376d3b06132f3e2db21ae0706983d0
sha256sum examples/principal-v3-pack/tests/fixtures/principal-native/assurance/events.jsonl
```

They returned `commit` and the existing fixture digest
`5297f64e7a1f360e37dcde42cb5682f295fcfd0934ad9c5c70e1eeb9db7fc542`.
The fixture and copied agent bytes did not change, so nothing was regenerated or rehashed.

**Fix:** both documents now record
`e438a605c2376d3b06132f3e2db21ae0706983d0`. The protocol-fixture test extracts the
recorded SHA and runs `git cat-file -t` in the named principal checkout. CI checks out
that exact producer identity and supplies its path to the test. Before the correction,
the new test failed with `fatal: git cat-file: could not get object info`; afterward it
passes.

### 5. `regate` spending honesty

**Wrong:** `SKILL.md` put `regate` in an unconditional no-model/no-judge list even though a
gate fail→pass transition immediately invokes a judge and reports the count only afterward.

**Fix:** `regate` remains behaviorally unchanged. Active docs, help, source comments, and
historical explanatory docs now say: no subject call, but one judge call may be made for
each fail→pass rep. `SKILL.md` removes it from the free/offline command set and requires
confirming possible judge spend before invocation. The test title that called the general
operation “free” now describes the narrower saved-evidence behavior it actually tests.

### 6. Principal lint baseline

Every skill-harness document that repeated the old current count now records:

```text
7 skill(s), 104 finding(s), 32 note(s) (do not fail the gate)
```

The 104 findings are exempt and the blocking count is zero. A repository-wide search
finds no remaining instance of the old baseline.

## Verification

All commands were free/offline on Node 26.7.0/npm 12.0.2.

- `npm run typecheck` — PASS.
- `npm test` — **94 files passed, 1 skipped; 1,529 tests passed, exactly 23 skipped**.
  The only skips were the expected pinned-toolchain `release-pack.test.ts` cases.
- `node bin/skill-harness.js mutation-test` — **21/21 mutations detected**; no model or judge calls.
- `node bin/skill-harness.js lint principal-v3-pack --skills examples` — **1 skill, 0 findings**.
- Targeted repaired-assertion/provenance/contract tests — **32/32 passed**.
- V3 vendor `--check` at `4a95243...` — PASS.
- `node scripts/check-pi-daddy-v3-contract.mjs` — **5/5 canonical fixtures accepted**; negative controls active.
- Before the real-builder verifier, `pgrep -af '[n]ode.*test/workspace.test.ts'` found no process.
- A clean local clone at exact pi-daddy `4a95243...`, installed with `npm ci --offline`, passed
  `npm run verify:pi-daddy-v3-contract -- <clean-clone>`: **57 positive cases, 8 fail-closed mutations**.
- `npm run build:ext` — PASS; committed extension bundle regenerated.

## Pending upstream

No repaired ship-gating cell remains pending upstream. Existing excluded cells remain:

- V3-14 needs a real principal `workspace_deleted`/`workspace_released` event.
- V3-15 needs a real `side_effect_performed` event.
- Principal still has no `approval_granted` producer event; it was not invented downstream.

The separate principal qualification product pin still predates `gate_evaluated`; this repair
does not claim that old product exercises the new pack semantics.
