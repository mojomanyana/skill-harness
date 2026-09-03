# A6 cross-repository consistency recheck

Date: 2026-09-03
Mode: deterministic/offline recheck. No model, judge, qualification, push, tag, publish, or sibling-repository write occurred. The only repository write is this report.

## Verdict

# CONFLICT

The producer-facing wire contracts and the six repaired field predicates now agree with observed producer output, but the repair set is not complete. The active ledger-v3 consumer README still pins an older pi-daddy commit/tree/version, provenance resolution is not enforced for every recorded provenance identity, `regate` is still called free/no-judge in source documentation and a test title, two active design statements still use the stale 101 baseline, and the skill-harness suite now skips 25 release-pack tests rather than the required 23. Those are direct failures of the requested closure criteria.

## Identity gate

The required command was the first action. Verbatim output:

```text
/home/neman/Code/principal-pi-skills
wave1/audit-followups
e438a60
/home/neman/Code/pi-daddy
wave1/audit-followups
4a95243
?? .pi/
/home/neman/Code/skill-harness
wave1/audit-followups
70bbb09
```

All required branches and heads matched. The sibling repositories were read and tested but not modified. Final status remained: principal clean; pi-daddy with only untracked `.pi/`; skill-harness clean before this report.

## Repair closure check

### 1. Producer repin — STILL OPEN

The exact obsolete `58d09dd2431cd426be4b709a97926490bb583623` no longer occurs at HEAD. Runtime, generated adapter, qualification config/schema, CI, `PINNED.json`, vendor metadata, and current handoff instructions name:

```text
commit  4a9524394ca995fd74ed9bbb836dc4e73cda3b8c
tree    7c006bff213142634f0f911ba9bd6add363ecaae
version 0.21.1
```

The required vendor commands were run:

```bash
node scripts/vendor-pi-daddy-ledger-v3-contract.mjs ../pi-daddy \
  4a9524394ca995fd74ed9bbb836dc4e73cda3b8c
node scripts/vendor-pi-daddy-ledger-v3-contract.mjs ../pi-daddy \
  4a9524394ca995fd74ed9bbb836dc4e73cda3b8c --check
```

Output:

```text
vendored 8 ledger-v3 artifact(s) from 4a9524394ca995fd74ed9bbb836dc4e73cda3b8c
64e3d875...c511  ledger-event.schema.json
8ddadea3...2efe  pi-daddy-README.md
beb4e0f9...0452  refusals.ts
a23d9b8f...cfbd  fixtures/capability-decision.json
40d8e0ef...d3e7  fixtures/workspace-lease.json
a24d2aeb...bef3  fixtures/child-lifecycle.json
e71eeca0...6b72  fixtures/check-receipt.json
5be5d97b...1bd3  fixtures/workflow-fact.json
pi-daddy ledger-v3 pin is deterministic and current at 4a9524394ca995fd74ed9bbb836dc4e73cda3b8c
```

`npm run build && node scripts/check-pi-daddy-v3-contract.mjs` also passed: all eight hashes, the generated adapter pin, 5/5 canonical fixtures, and negative controls.

However, `contracts/pi-daddy/ledger/v3/README.md:7-9,23` still claims commit `591abb4a358bf8a84455486812b83609e2a47e3f`, tree `c9fe1b324ffbf0d72e7d904972594b3a936e9928`, version `0.20.0`, and gives that obsolete vendor command. `packages/adapters/test/pi-daddy-v3-contract.test.ts:15` still labels the now-merged pin provisional. The vendor script does not regenerate the consumer README, so its successful check does not cover this contradiction.

### 2. Six ship-gating field repairs — CLOSED for producer-field compatibility

The principal observations were independently repeated by invoking the sibling's `scripts/assurance-state.mjs` CLI in invocation-owned temporary state directories. The pi-daddy observations were independently repeated with the exact production-builder heredoc in fixture provenance. Observed producer/adapter mappings:

| Cell | Owning producer | Observed producer field(s) used by assertion | Provenance command recorded? | Mutation proof |
|---|---|---|---|---|
| V3-02 | principal assurance ledger | `run_initialized.request`; `task_packet_recorded.packet.critical_scope.applies`; real `finalization_completed` occurrence | Yes, `PROVENANCE.md` V3-02 init/event commands | `critical_scope.applies: true→false` fails |
| V3-06 | principal assurance ledger | `backfill_completed.receipts[]` | Yes, exact `backfill_completed` CLI command | empty `receipts` fails |
| V3-07 | pi-daddy v3 builders + harness adapter | `capability_decision.effective:["tool:read"]` → `capability_granted.capability`; `child_lifecycle.executionId/state` → `child_started.execution_id/attributes.state` | Yes, self-contained production-builder heredoc | second grant changed to `tool:write` fails |
| V3-08 | pi-daddy v3 builders + harness adapter | `refusal.code:"WORKSPACE_WRITE_CONFLICT"` → `writer_lease_conflict` and `child_spawn_refused.refusal_code` | Yes, same heredoc | substitute `CAPABILITY_ESCALATION` fails |
| V3-10 | principal assurance ledger | `finding_adjudicated.disposition` and required nonempty `reason` | Yes, exact event command | empty `reason` fails |
| V3-13 | principal assurance ledger | `gate_evaluated.{gate,code,missing_count}`; `evidence_recorded.tree_sha`; `finalization_completed.{final_branch,head_sha,tree_sha}` | Yes, exact gate/finalization commands | changed finalization tree fails |

The direct principal run emitted, among the target evidence:

```json
{"type":"task_packet_recorded","packet":{"critical_scope":{"applies":true,"matched_by":["entire-run"]}}}
{"type":"backfill_completed","receipts":[{"control":"frozen-diff-review"},{"control":"requirements-trace"},{"control":"risk-specific"}]}
{"type":"finding_adjudicated","finding_id":"REV-FALSE","disposition":"rejected","reason":"producer evidence shows the alleged path is unreachable"}
{"type":"gate_evaluated","gate":"finalize","code":"OK","missing_count":0}
{"type":"finalization_completed","final_branch":"feature","head_sha":"cccc...","tree_sha":"eeee..."}
```

The direct pi-daddy builder run emitted two allowed capability decisions with `effective:["tool:read"]`, two `child_lifecycle` records with matching `executionId` and `state:"starting"`, and refused lease/capability records carrying `WORKSPACE_WRITE_CONFLICT`.

`npx vitest run packages/core/test/principal-protocol-fixtures.test.ts packages/adapters/test/pi-daddy-v3-contract.test.ts` passed 22/22. The repaired-assertion table in `principal-protocol-fixtures.test.ts` runs all six positive shapes and all six stated mutations.

Caveat for the full claim audit: compatibility is closed, but some scenario prose remains stronger than its objective proof. V3-07 proves two bounded read-only starts, not temporal overlap/concurrency. V3-13's checklist says exact branch/head/tree and workspace preservation, while the trajectory assertion correlates only tree and has no workspace-release event. These are listed below as provisional semantic gaps.

### 3. Real gate protocol shape — CLOSED

Both finalization fixtures now use:

```json
{"type":"gate_evaluated","attributes":{"gate":"finalize","code":"OK","missing_count":0}}
```

and the corresponding `finish` shape. They do not place fabricated head/tree identity on the gate. Final tree identity is correlated from `evidence_recorded` to `finalization_completed`.

The principal CLI independently emitted exactly `gate`, `code:"OK"`, and `missing_count:0`. `principal-protocol-fixtures.test.ts` rewrites both gates to the obsolete `{gate,result:"pass"}` shape and asserts the result is not PASS. The targeted test passed.

### 4. Provenance identity — STILL OPEN

The corrected principal SHA resolves:

```bash
git -C ../principal-pi-skills cat-file -t \
  e438a605c2376d3b06132f3e2db21ae0706983d0
# commit
```

The fabricated `e438a60516ca941c39c74bb3f62a7f2ba2b36f87` does not resolve. The principal fixture and A3 handoff now record the real SHA.

The new test does not enforce the requested general rule. It regexes only the first `commit <40-hex>` in one principal `PROVENANCE.md` and checks that object. It does not enumerate every provenance document/PINNED record, map each named repository, or ensure every recorded provenance SHA resolves there. Existing pi-daddy provenance identities were manually checked and currently resolve (`dde8eeb...`, `c364a67...`, `4a95243...`, and the stale README's `591abb4...`), but there is no check making that repository-wide property durable.

### 5. `regate` free-command honesty — STILL OPEN

Primary CLI help, `SKILL.md`, `AGENTS.md`, README, and usage text now generally say that `regate` makes no subject call but may judge fail→pass reps. Behavior is unchanged: `regateRun` calls `judgeOneRep` before returning its `judgeCalls` count.

Contradictory wording remains:

- `packages/cli/src/cli.ts:485-489` says the cost is printed before calls, although output is printed only after `regateRun` returns.
- `packages/core/src/regate.ts:345` says regate “asks no judge anything” immediately after its judge-call branch.
- `packages/core/src/results.ts:702` calls it “a free, offline command.”
- `packages/core/test/field-roundtrip.test.ts:168` titles the operation “regate asks no judge anything.”
- `docs/posts/2026-08-05-the-gate-that-charged-you-to-fix-a-typo.md:62` says three of four remedies are free, despite later describing the fail→pass judge call.

Therefore `regate` is neither genuinely free nor consistently no longer documented/test-described as free.

### 6. Principal lint count — STILL OPEN

The live baseline is confirmed as:

```text
7 skill(s), 104 finding(s), 32 note(s) (do not fail the gate)
✓ 104 finding(s): 104 exempt, 0 vouched, 0 blocking
```

Most current docs use 104. However, `docs/superpowers/specs/2026-08-22-codex-arms-campaign-design.md:159` still says “the 101 lint findings do not grow,” and line 316 still requires the count to “stay at 101/32.” Its appendix at line 421 also records the historical 101/32 measurement. At minimum the two active invariant statements repeat the stale baseline, so the requested repository-wide correction is incomplete.

## Full contract comparison

### Version fields: consistent and separate

- Normalized trajectory events: writer `event_version:"1.1"`; reader accepts 1.0 and 1.1 and rejects 1.1-only occurrence fields on legacy 1.0 (`trajectory-gates.ts:5-7,618-624`).
- Principal assurance ledger/run state: `schema_version:"1.0"` (`assurance-state.mjs`; principal JSON schema const 1.0). The harness principal adapter requires exactly 1.0.
- Pi-daddy correlation metadata: optional `schema_version:"1.0"`, rejecting other values. It is correlation metadata, not a trajectory version.
- Qualification formats remain separate: config v1, runner v1, invocation request v1, terminal receipt v3, OAuth directory policies v1/v2.
- Qualification producer pin is pi-daddy `4a95243...`; the separate principal qualification product remains `a659695...` and predates `gate_evaluated`.

No version-domain leakage was found.

### Assurance source enum

Principal emits the closed workflow set:

```text
default, flag, alias, natural-language, policy, user, user-downgrade
```

The harness principal adapter accepts exactly that set. Pi-daddy carries `assurance_source` as a bounded identifier without interpreting the workflow enum. No principal member is missing downstream.

### Structured assurance scope

Principal emits only closed `{type,selectors}` objects:

```json
{"type":"entire-run","selectors":[]}
{"type":"selectors","selectors":["one-or-more unique safe task IDs/repo-relative patterns"]}
```

Both consumers accept every principal-produced scope and enforce the entire-run/empty versus selectors/nonempty cardinality. The harness also requires unique selectors. Pi-daddy is intentionally more permissive about selector grammar and does not reject duplicates, so it is a non-authoritative carrier, not an equivalent principal validator.

### Correlation and freshness

Pi-daddy and the harness v3 adapter carry `tree_sha`, `event_seq`, `last_change_seq`, and `last_authority_seq`. Principal maintains `current_tree_sha`, `last_change_seq`, and `last_authority_seq`; freshness takes the maximum applicable floor. The harness keeps caller correlation tree under `digests.correlation_tree` and promotes only measured receipt `treeSha` to `digests.tree`, avoiding evidence inflation.

The known upstream exception remains: pi-daddy persisted `ApprovalBinding` includes optional `tree_sha` and `last_change_seq`, but not `last_authority_seq`. Authority-only movement therefore does not narrow persisted approval reuse. This remains a pi-daddy design decision, not something the harness should synthesize.

### Event vocabulary

The pack asserts 24 unique names:

```text
assurance_downgraded, assurance_escalated, backfill_completed,
capability_granted, child_spawn_refused, child_started, code_changed,
design_approved, evidence_recorded, finalization_completed,
finding_adjudicated, finding_recorded, finish_selected, gate_evaluated,
phase_blocked, phase_completed, repair_completed, repair_started,
risk_classified, run_initialized, side_effect_approved,
task_packet_recorded, writer_lease_acquired, writer_lease_conflict
```

Every name is emitted by either the principal adapter preserving a real principal event or the pi-daddy v3 adapter normalizing a real v3 builder event. No synthetic event name remains in a ship-gating assertion.

Semantic exceptions remain: V3-05 checks a blocked code and nonzero count but cannot prove that prose “lists every missing control”; V3-07 does not prove overlap; V3-14's valid-producer forbid is vacuous until a deletion/release event exists; V3-15 proves approval/readiness, not performance; V3-13 does not objectively cover every identity/preservation word in its checklist.

### Refusal codes

Current pi-daddy runtime, vendored v3 refusal source, and v3 schema each contain the same 34 codes. Programmatic set differences in both directions were empty; all 34 runtime codes occurred in the schema. The historical v2 contract has 32 and correctly excludes v3 additions `MODEL_UNRESOLVED` and `GRANT_STORE_INVALID`.

## Approval boundary

Command:

```bash
git -C ../principal-pi-skills diff main...HEAD -- \
  '*/SKILL.md' 'agents/**' 'contracts/**' 'prompts/**'
```

Result:

```text
M decide/SKILL.md
```

The only diff is 22 inserted lines in `decide/SKILL.md`. No agent, contract, prompt, or other skill changed. **The approval boundary held.**

## Free/offline verification

Before every pi-daddy test/verifier tier, `pgrep -af '[n]ode.*test/workspace.test.ts'` reported `none`; it also reported none afterward.

| Repository/check | Result |
|---|---|
| skill-harness `npm run typecheck` | PASS |
| skill-harness `npm test` | Vitest PASS, 95 files passed / 1 skipped; 1,531 passed / **25 skipped** out of 1,556 |
| release-pack skip audit | **FAIL requirement** — all skips are in `packages/cli/test/release-pack.test.ts`, but there are 25, not exactly 23 |
| `lint principal-v3-pack --skills examples` | PASS — 1 skill, 0 findings |
| `mutation-test` | PASS — 21/21 detected; no model/judge calls |
| repaired assertion + v3 contract targeted tests | PASS — 22/22 |
| v3 vendor write/check at `4a95243...` | PASS — 8 artifacts; deterministic/current |
| direct v3 contract check | PASS — 5/5 fixtures; negative controls active |
| real-builder verifier from clean local clone at `4a95243...` | PASS — 57 positives, 8 fail-closed mutations; v3 occurrence/joins preserved |
| principal baseline with exact local `SKILL_HARNESS_CMD` | PASS — generated 13/13; unit 190 total, 189 pass, 1 skip; install 25/25; pack 28 files; lint 104 findings, all exempt, 0 blocking, 32 notes |
| pi-daddy `npm test` | PASS — 739/739 |
| pi-daddy typecheck | PASS |
| pi-daddy `test:integration:ci` | PASS — 36/36; model-driven tier remained opt-in and was not run |
| all three `git diff --check` | PASS |

The two newly skipped release-pack tests are “rejects a real tracked Git gitlink” and “keeps an adjacent CI dependency checkout outside package inventory and source identity,” both added inside the existing `describe.skipIf(!pinnedToolchain)`. Thus nothing outside the release-pack file became conditional, but the explicit exactly-23 requirement no longer holds. The exact pinned Node 20.20.2/npm 10.8.2 release run remains deferred.

## Remaining provisional and deferred work

### Conflicts to repair

1. Update `contracts/pi-daddy/ledger/v3/README.md` to the authoritative `4a95243...` identity and remove the stale provisional test comment; add coverage so consumer notes cannot drift from `PINNED.json`.
2. Replace the one-file provenance resolver with a check that enumerates every recorded provenance identity and resolves it in the named repository.
3. Remove/correct every remaining claim that `regate` is free or asks no judge; do not claim preflight until calls are actually authorized before execution.
4. Correct active 101/32 baseline statements.
5. Restore the promised exactly-23 release-pack skip contract, or explicitly obtain authority to change that expected count and all handoffs/tests that pin it.
6. Reconcile objective assertions with the stronger V3-05/V3-07/V3-13 checklist wording rather than presenting compatible field names as complete behavioral proof.

### Pending upstream / excluded from SHIP

- V3-14 needs a real principal `workspace_deleted` or `workspace_released` event.
- V3-15 needs a real principal `side_effect_performed` event.
- Principal has no `approval_granted` producer event; none should be invented downstream.
- Pi-daddy persisted approval freshness still omits `last_authority_seq` pending an explicit producer decision.

### Deferred, unchanged

- Principal qualification product pin `a659695...` predates `gate_evaluated`; it must not be claimed as exercising the new pack semantics.
- Pi-daddy ADR-0040 shared Git-common-directory lease coordination (R-148), ADR-0041 approve-before-exclusive-acquisition/revalidation (R-145), and ADR-0042 inherited destination pins (R-137) remain unimplemented.
- Named-check receipt durable persistence/recovery remains controller-owned.
- Principal abandoned `ppw-*` discovery/pruning and future Plan syntax/discovery/authority/event-log enforcement remain deferred.
- Two-model validation and live workflow/runtime evidence remain unrun.
- Exact-toolchain release-pack and packed-smoke evidence remain unrun.
- No release, publish, tag, push, qualification measurement, model run, or judge call was performed.
