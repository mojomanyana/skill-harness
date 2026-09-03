# A4 cross-repository consistency check

Date: 2026-09-03
Mode: read-only audit; no model/judge, publish, tag, push, or commit action was run. The only repository write is this report.

## Verdict

# CONFLICT

The repository identities and most wire fields agree, and the provisional pi-daddy bytes are identical to the merge-head bytes. However, six ship-gating assertions in `examples/principal-v3-pack` cannot be satisfied by the real producer/adapter field placement, one critical refusal assertion uses a nonexistent code, the principal fixture provenance records a nonexistent commit, and `regate` is still described unconditionally as free/offline although one path calls a judge. These are release blockers, not documentation-only exceptions.

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
15514c5
?? .pi/
```

All three identities passed the gate. No other path under `/home/neman/Code` was inspected or modified, and no outside-repository activity was observed.

## SHA, version, and worktree table

| Repository | Branch | HEAD | Tree | Package version | Uncommitted state | `.pi/` ignored? |
|---|---|---|---|---:|---|---|
| principal-pi-skills | `wave1/audit-followups` | `e438a605c2376d3b06132f3e2db21ae0706983d0` | `375ce63f27da64ba5e9eba9eabab31efbd0efd8d` | 3.0.1 | clean | yes, `.gitignore:46` |
| pi-daddy | `wave1/audit-followups` | `4a9524394ca995fd74ed9bbb836dc4e73cda3b8c` | `7c006bff213142634f0f911ba9bd6add363ecaae` | 0.21.1 | untracked `.pi/` only | **no — flag before release; left alone** |
| skill-harness | `wave1/audit-followups` | `15514c5a82e2761b6131f84c3e2bf229ec4a3594` | `fee6ba907d60d52b3e8839b9daa209d1c4d9e89c` | 0.11.0 | untracked `.pi/` only | **no — flag before release; left alone** |

Post-test status was unchanged. `git diff --check` passed in all three repositories.

## Provisional pi-daddy pin equivalence

The former snapshot pin and authoritative merge head
`4a9524394ca995fd74ed9bbb836dc4e73cda3b8c` both resolve to tree
`7c006bff213142634f0f911ba9bd6add363ecaae`.

The content is exactly equivalent. The pin **still must move to `4a95243...` before release**: the authoritative merged/current producer identity is the merge-head commit, while the existing pin names a snapshot/mutation-audit identity. Preserve the identical tree, version, schema digest, and artifact digests.

Running the vendor check against current HEAD correctly exposed the missing repin:

```text
no authoritative ledger-v3 producer metadata recorded for 4a9524394ca995fd74ed9bbb836dc4e73cda3b8c
exit=2
```

The existing provisional snapshot check passed, and the direct contract checker accepted 5/5 canonical fixtures.

## Field-by-field contract comparison

### Version fields — separate domains, no leakage

| Field | Owner | Value | Consumer result |
|---|---|---:|---|
| normalized trajectory `event_version` | skill-harness | writer 1.1 | Reader accepts 1.0 and 1.1; 1.0 rejects 1.1-only occurrence fields (`trajectory-gates.ts:618-624`). |
| assurance event/run-state `schema_version` | principal-pi-skills | `"1.0"` | Unchanged snapshot shape (`assurance-state.mjs:25,471`; schema const at `schemas/assurance-run-state-v1.schema.json:39`). Harness requires exactly 1.0 (`trajectory.ts:179-180`). |
| pi-daddy correlation `schema_version` | pi-daddy | optional `"1.0"` | Runtime rejects any other value (`correlation.ts:181-184`); generated v3 schema agrees. This is correlation metadata, not trajectory version. |
| qualification formats | skill-harness | config v1; runner v1; request v1; terminal receipt v3; OAuth directory policy v1/v2 | Distinct constants in `qualification-config.ts:6-15`; none is substituted for a trajectory, principal, or correlation version. |
| qualification product pins | skill-harness | principal `a659695...`; pi-daddy provisional snapshot | Internally schema/runtime-consistent, but the pi-daddy commit must become `4a95243...`. The principal pin predates `gate_evaluated`; it cannot support a claim that production qualification exercises the new pack semantics without a later explicit product repin. |

### Assurance source

Principal owns the workflow meaning and emits exactly:

```text
default | flag | alias | natural-language | policy | user | user-downgrade
```

This is enforced by `ASSURANCE_SOURCES` in `principal-pi-skills/scripts/assurance-state.mjs:60`, and skill-harness independently accepts the identical closed set in `packages/adapters/src/trajectory.ts:147-149`. Pi-daddy carries `assurance_source` as a bounded ASCII correlation identifier but deliberately does not interpret its workflow meaning. No enum member is missing or added downstream.

### Structured scope

Principal produces only:

```json
{"type":"entire-run","selectors":[]}
{"type":"selectors","selectors":["one-or-more unique safe task IDs or repo-relative patterns"]}
```

Principal closes the object, validates safe selectors, uniqueness, and the empty/non-empty invariant (`assurance-state.mjs:323-356`). Pi-daddy accepts the same two-key union and matching cardinality rules (`correlation.ts:101-123`). Skill-harness accepts the same union, also requiring unique nonempty selectors (`trajectory.ts:151-171`). Therefore **every scope principal can produce is accepted by both consumers**. Pi-daddy is somewhat more permissive about selector string grammar and duplicates than principal/harness, but that does not reject a principal-produced scope; it is a non-authoritative carrier.

### Correlation and freshness fields

The shared closed correlation set includes `tree_sha`, `event_seq`, `last_change_seq`, and `last_authority_seq` in pi-daddy (`correlation.ts:71-78`) and the harness v3 adapter (`trajectory.ts:788-813`). Principal run state owns and advances `current_tree_sha`, `last_change_seq`, and `last_authority_seq`; freshness uses the maximum of the two sequence floors (`assurance-state.mjs:708-709,771`). Harness preserves pi-daddy's correlation tree separately as `digests.correlation_tree` and promotes only a measured top-level receipt `treeSha` to `digests.tree`, which correctly avoids treating caller metadata as evidence.

One approval-boundary exception remains: pi-daddy's additive persisted approval binding includes optional `tree_sha` and `last_change_seq`, but not `last_authority_seq` (`correlation.ts:211-288`). That matches ADR-0039 as implemented, but it means an authority-only transition does not itself invalidate an otherwise equal persisted approval. Ownership: **pi-daddy**. Smallest decision: explicitly decide whether authority freshness must narrow approval reuse; if yes, add optional `last_authority_seq` with legacy-serialization preservation and equality/digest tests. Do not compensate in the harness.

## Event vocabulary and assertion audit

### Producer/adapter vocabulary

Principal's authoritative event contract is `principal-pi-skills/scripts/assurance-state.mjs:74-105`, plus `run_initialized`; the principal adapter preserves real `record.type` values. Pi-daddy v3 normalizes its five wire kinds into capability/approval/refusal, workspace lease, child lifecycle, check receipt, and `workflow_fact` events (`skill-harness/packages/adapters/src/trajectory.ts:815-1025`).

The pack references these unique event names:

```text
assurance_downgraded, assurance_escalated, backfill_completed,
capability_granted, child_spawn_refused, child_started, code_changed,
design_approved, evidence_recorded, finalization_completed,
finding_adjudicated, finding_recorded, finish_selected, gate_evaluated,
phase_blocked, phase_completed, repair_completed, repair_started,
risk_classified, run_initialized, side_effect_approved,
task_packet_recorded, writer_lease_acquired, writer_lease_conflict
```

**No assertion names an event absent from all adapters.** The original event-*name* defect is closed: synthetic `critical_blocked`, `stale_evidence_rejected`, `side_effect_performed`, `workspace_deleted`, and `approval_granted` are no longer asserted. However, event existence alone is insufficient: the following field predicates are incompatible with real producer output.

### Ship-gating assertion conflicts

| Scenario | Conflict | Owner and smallest compatibility decision |
|---|---|---|
| V3-02 | `task_packet_recorded.attributes.assurance` and `finalization_completed.attributes.assurance` cannot exist. Task packets have no assurance field, and finalization carries final branch/head/tree only (`assurance-state.mjs:85,103,358-426,1565-1589`). | **skill-harness assertion**, after principal confirms the intended observable. Assert effective assurance on `run_initialized`/real assurance transitions, not invented per-event fields. If every phase truly needs an assurance snapshot, principal must version and emit it first. |
| V3-06 | `backfill_completed` has tree/head only inside `receipts[]`; the principal adapter promotes only top-level SHAs, so correlation on `digests.head/tree` cannot pass (`assurance-state.mjs:1525-1556`; `trajectory.ts:186-217`). | **skill-harness assertion**: correlate through a real normalized receipt identity/field, or ask principal to version a top-level frozen identity. Do not fabricate promotion from nested data. |
| V3-07 | `child_started` lifecycle events do not carry `effective_capabilities`; those occur on capability decision events (`trajectory.ts:878-934,977-1003`). | **skill-harness assertion**: require two `child_started` occurrences and separately correlate each execution with prior `capability_granted capability=tool:read`; keep the write-grant forbid. |
| V3-08 | `WRITER_LEASE_CONFLICT` is not a refusal code. Producer emits `WORKSPACE_WRITE_CONFLICT`; adapter maps that to event type `writer_lease_conflict` while preserving the producer code (`trajectory.ts:957-975`). | **skill-harness assertion**: change only `refusal_code` to `WORKSPACE_WRITE_CONFLICT`; add pack-level fixture regression. |
| V3-10 | `finding_adjudicated.attributes.evidence` is not produced; the event has finding ID, disposition, and reason (`assurance-state.mjs:94,1427-1440`). | **principal owns the meaning**: decide whether a nonempty reason is the required evidence. If yes, harness asserts `attributes.reason`; if structured evidence is required, principal versions/adds it before downstream changes. |
| V3-13 | `gate_evaluated` carries gate/code/count, not tree identity, so correlating its `digests.tree` with finalization cannot pass (`assurance-state.mjs:104,1599-1610`). | **skill-harness assertion**: retain ordered successful finalize gate + finalization, and bind final tree through a real preceding evidence/review receipt, or first add a principal field. |

Additional integrity conflicts:

- `examples/principal-v3-pack/tests/protocol-fixtures/finalization.good.jsonl` and `.bad.jsonl` still encode `gate_evaluated.attributes.result="pass"`; the real event uses `code="OK"` and `missing_count=0`. The passing fixture test therefore protects an obsolete synthetic shape.
- V3-14 is correctly excluded from SHIP, but its forbid is vacuous: principal rejects a discard event with `explicit_request:false` before it can enter a real ledger. It does not prove that workspace deletion did not occur.
- V3-15 is correctly excluded pending a real performed event; its current assertions establish approval/gate readiness only, not execution.

## Refusal vocabulary

Pi-daddy defines 34 codes; the two branch additions are `MODEL_UNRESOLVED` and `GRANT_STORE_INVALID`:

```text
CAPABILITY_ESCALATION
GRANT_ID_MALFORMED
DEFINITION_NOT_AUTHORIZED
UNDECLARED_TOOLS
UNKNOWN_TOOL
GATED_UNAPPROVED
APPROVAL_EXPIRED
APPROVAL_SCOPE_MISMATCH
APPROVAL_FLOW_FAILED
DEPTH_EXCEEDED
FANOUT_EXCEEDED
EXECUTOR_UNAVAILABLE
MODEL_UNRESOLVED
GRANT_STORE_INVALID
CHILD_TIMED_OUT
CHILD_CANCELLED
CHILD_EXIT_NONZERO
TASK_MISSING
UNKNOWN_DEFINITION
CEILING_PATTERNS_UNRESOLVED
NARROWING_VIOLATED
DEFINITION_UNREADABLE
CORRELATION_TOO_LARGE
CORRELATION_INVALID
LEDGER_WRITE_FAILED
FANOUT_FAILED
WORKSPACE_NOT_REGISTERED
WORKSPACE_NOT_AUTHORIZED
WORKSPACE_WRITE_CONFLICT
WORKSPACE_LEASE_STALE
CHECK_NOT_CONFIGURED
CHECK_CONFIGURATION_INVALID
CHECK_IDENTITY_UNAVAILABLE
CHECK_IDENTITY_MISMATCH
```

Producer schema enum: 34. Harness vendored schema enum / `V3_REFUSAL_CODES`: 34. Set differences in either direction: none.

The real-builder verifier counts the producer's runtime `REFUSAL_CODES` imported from `pi-daddy/dist/refusals.js`, not a harness hard-coded list (`verify-pi-daddy-v3-builders.mjs:42,96`). Its reported 57 positives match the current producer: 5 canonical fixtures + 34 refusals + 9 lease outcomes + 4 lifecycle states + 3 workflow facts + 2 non-vacuous identity-change positives. Thus the count is based on the actual enum. A worthwhile hardening remains: explicitly assert producer runtime sets equal the pinned schema sets so a future exported enum omission cannot merely reduce the printed count.

## Approval boundary diff

Command scope:

```text
git diff main...HEAD -- '*/SKILL.md' 'agents/**' 'contracts/**' 'prompts/**'
```

Result:

```text
M decide/SKILL.md
```

`decide/SKILL.md` has 22 insertions; the count of unexpected paths is zero. **The approval boundary held.** No agent, generated contract, prompt, or other skill file differs from `main`.

## Free/offline command audit

- **principal-pi-skills:** normal unit/install/generate/pack commands contain no model or judge path. The live E2E path can call a model, but `--self-test` exits before that loop. Exception: default `npm test` invokes `scripts/lint-skills.mjs`, which defaults to moving `npx -y skill-harness@latest` and interpolates `SKILL_HARNESS_CMD` into a shell (`lint-skills.mjs:42,57`). It is zero-model on its normal `lint` path, but is not strictly offline/reproducible and the override is not command-structured. Smallest fix: use `execFileSync`/argument arrays and an audited pinned/local harness for an offline baseline.
- **pi-daddy:** `npm test`, typecheck, and `test:integration:ci` are model-free. `test:integration` needs Herdr but not a model. Only the explicitly gated `PI_GRANTS_IT_MODEL=1` integration tier spends model tokens. No free command was found to call a model/judge.
- **skill-harness:** list/lint/stability/rescore/restamp/coverage/affected/mutation-test/judge-agreement are offline paths. **Conflict:** `SKILL.md:80-91` includes `regate` in an unconditional free/offline list, while `regateRun` calls `judgeOneRep` when a gate flips fail→pass (`packages/core/src/regate.ts:329-336`). The CLI reports the count only after `regateRun` has already made those calls (`packages/cli/src/cli.ts:486-530`). This contradicts the stronger warning in `AGENTS.md`. Smallest fix, owned by skill-harness: preflight/count before calls and require explicit authorization, or stop describing `regate` unconditionally as free/offline.

No real model or judge call was made during this audit.

## Free command and baseline results

Before any pi-daddy test, `pgrep -af 'test/workspace.test.ts'` returned only the `pgrep` command itself; there was no stale workspace-test process. The same was true after the suite.

| Repository/check | Result |
|---|---|
| skill-harness `lint principal-v3-pack --skills examples` | PASS — 1 skill, 0 findings |
| skill-harness `mutation-test` | PASS — 21/21 mutations detected; no model/judge calls |
| v3 vendor snapshot `--check` | PASS — deterministic/current at provisional pin |
| v3 vendor current HEAD `4a95243... --check` | EXPECTED RELEASE-BLOCKING FAIL — current authoritative metadata not recorded |
| v3 direct contract check | PASS — 5/5 canonical fixtures and negative control |
| principal `npm test` with exact local harness substituted for moving `@latest` | PASS — generated 13/13; unit 190 total, 189 pass, 1 skip; install 25/25; pack 28 required files; lint 104 findings, all 104 exempt, 0 blocking, 32 notes |
| pi-daddy `npm test` | PASS — 739/739 |
| pi-daddy `npm run typecheck` | PASS |
| pi-daddy `npm run test:integration:ci` | PASS — 36/36, real pi, no Herdr/model |
| skill-harness `npm test` | PASS — 94 files passed, 1 skipped; 1,521 tests passed, 23 skipped |
| skill-harness `npm run typecheck` | PASS |

On Node 26.7.0/npm 12.0.2 the skill-harness skips were exactly `packages/cli/test/release-pack.test.ts`: one `describe.skipIf(!pinnedToolchain)` enclosing exactly 23 `it(...)` declarations. No other test file or test was skipped. The suite printed the explicit required toolchain (Node 20.20.2/npm 10.8.2).

The principal baseline's current lint count is 104 rather than older reports' 101. Because all 104 are explicitly exempt it exits successfully, but any handoff claiming the old current count is stale.

## Provenance conflict

`examples/principal-v3-pack/tests/fixtures/principal-native/PROVENANCE.md` and `docs/handoff/2026-09-A3-skill-harness-followups.md` claim source commit:

The previously recorded 40-character value did not resolve. Actual principal HEAD is:

```text
e438a605c2376d3b06132f3e2db21ae0706983d0
```

The fixture ledger digest still matches its recorded SHA-256 (`5297f64e...fc542`), and all six copied agent files are byte-identical to current principal HEAD, but the immutable provenance claim is not reproducible. Ownership: **skill-harness**. Smallest fix: correct the commit identity and regenerate/re-hash only if reproduction shows bytes differ.

## Provisional and deferred release blockers

1. **Mandatory producer repin:** replace every skill-harness v3/qualification/CI/doc snapshot pin with authoritative `4a95243...`, retaining tree `7c006b...` and unchanged bytes/digests.
2. **Pack assertion conflicts:** repair V3-02, V3-06, V3-07, V3-08, V3-10, and V3-13 against fields real producers emit. These are critical/ship-bar cells.
3. **Protocol fixture drift:** replace synthetic gate `result:"pass"` with real `code:"OK", missing_count:0` and ensure tests fail on the old shape.
4. **Broken principal provenance SHA:** correct/reproduce the fixture source identity.
5. **Pending upstream, explicitly excluded from SHIP:** V3-14 needs real `workspace_deleted`/`workspace_released`; V3-15 needs real `side_effect_performed`; principal `approval_granted` has no producer and must not be invented.
6. **Principal qualification product pin:** remains merged `a659695...`, which predates `gate_evaluated`. Keep it only if qualification intentionally targets that older product; otherwise repin after the principal branch merges and package bytes are rebuilt.
7. **Pi-daddy decisions not implemented:** ADR-0040 shared Git-common-directory lease coordination (R-148), ADR-0041 approve-before-exclusive-acquisition/revalidation (R-145), and ADR-0042 inherited destination pins (R-137). Do not describe them as shipped.
8. **Pi-daddy documented gap:** named-check receipt durable persistence/recovery remains controller-owned.
9. **Principal deferred behavior:** abandoned `ppw-*` directory discovery/pruning is characterized but not implemented; Plan syntax/discovery/authority/event-log enforcement remains a future runtime contract; two-model validation and live workflow/runtime evidence remain unrun.
10. **Skill-harness free-command wording/control:** resolve the `regate` judge-call contradiction before claiming every listed free command is token-free.
11. **Toolchain release evidence:** the 23 release-pack tests and packed smoke must run on the pinned Node 20.20.2/npm 10.8.2 CI/release host; their intentional Node 26 skip is not release evidence.
12. **No release actions yet:** proposed skill-harness 0.12.0 remains unbumped/unpublished; no qualification measurement, model wave, judge-agreement pair, publish, tag, push, or commit was performed here.
