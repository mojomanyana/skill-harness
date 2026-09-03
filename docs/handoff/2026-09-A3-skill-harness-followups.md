# A3 — skill-harness Wave 1 audit follow-ups

Date: 2026-09-03. Branch: `wave1/audit-followups`. Baseline: `main`/HEAD
`51f0f82`; `git log --oneline 51f0f82..HEAD` was empty before edits. No model,
judge, publish, tag, push, or qualification measurement call was made.

## Freshness audit

| Claim / requested premise | Status | Current evidence |
|---|---|---|
| Baseline is `51f0f82`, package 0.11.0, branch has no commits above baseline | CONFIRMED | initial `git status`; `package.json`; empty `git log 51f0f82..HEAD` |
| `.pi/` is unrelated generated config | CONFIRMED | untracked initially and left unmodified/uncommitted |
| Host is Node 26.7.0/npm 12.0.2; release pack requires 20.20.2/10.8.2 | CONFIRMED | version preflight and `scripts/release-pack.mjs` |
| Release-pack suite has about 19 environmental failures | CONFIRMED | measured 19 failed, 4 passed, 8.07 s before Task 5c |
| pre-Wave-1 v3 producer pin and strict consumer reject Wave 1 | CONFIRMED | the obsolete snapshot identity was removed during the A6 cleanup; initial real-builder path failed until the contract and vocabulary were re-vendored |
| pi-daddy Wave 1 merge head is `4a95243` with two added refusals and narrowed scope | CONFIRMED | commit `4a9524394ca995fd74ed9bbb836dc4e73cda3b8c`, tree `7c006b…`, 0.21.1; 34 refusal codes; scope is closed `{type,selectors}` |
| v2 must remain frozen | CONFIRMED | v3 verifier's legacy lane accepts frozen v2 and unversioned 0.17 |
| principal docs pin `961f8cc` while qualification code pins `a659695` | CONFIRMED | `docs/ASSURANCE-WORKFLOWS.md` vs `qualification-config.ts`; active docs now use `a659695` |
| principal `gate_evaluated` is now real | CONFIRMED | sibling commit `430af0f`; authoritative handoff and CLI contract |
| `critical_blocked`, `stale_evidence_rejected`, `workspace_deleted` are not real principal events | CONFIRMED | principal handoff; assertions mapped to gate outcomes/finish choice |
| V3-01's `side_effect_performed` forbid is vacuous | CONFIRMED | old spec and adapter vocabulary |
| V3-15 already had that same forbid | INVALID | old V3-15 required `side_effect_performed`; it did not forbid it. The authoritative handoff's interim positive assertion was applied instead. |
| event 1.0 added five fields while staying closed | CONFIRMED | interface/schema before this change |
| runtime reader rejected unknown additive fields | CHANGED | runtime already knew the five names, but the public closed 1.0 schema made old/new compatibility ambiguous; version 1.1 now resolves it explicitly |
| principal assurance source/scope were only sanitized | CONFIRMED | old `normalizePrincipalAssuranceLedger` pass-through |
| packed-artifact smoke was manual | CONFIRMED | no installed-tarball CI smoke existed |
| thinking suffix was unverified | CONFIRMED in docs / ALREADY-FIXED in Pi | runbook was stale; installed Pi 0.84.2 `parseModelPattern` lines 156–200 has exact-first/last-colon behavior |
| qualification tests leak temp roots | CONFIRMED | 5,768 old `qualification-runner-*` roots existed before cleanup work; the prompt's 193 count had CHANGED materially |
| checkpoint/NEXT-SESSION/PUBLISHING process text is stale | CONFIRMED | active “in progress”, open PR #65, and 0.10.0 title were present |
| zero subject cost lacks provenance | CONFIRMED | metrics had amount only |
| secondary judge cannot produce an all-cell agreement matrix | CONFIRMED | it remains adjudication-triggered; normal grade history and offline reporting were added |
| historical arm pins `PI_GRANTS_HERDR: "0"` | CONFIRMED | `git show 23d28f9:tests/arms.yaml` |

Sibling inputs actually read: principal-pi-skills branch commits
`430af0f`, `b6c306c`, `0474497`, `e438a60` (HEAD
`e438a605c2376d3b06132f3e2db21ae0706983d0`; active qualification product pin remains
merged `a6596950d64a3a525f95329d5dbd3e38948be408`); pi-daddy merge head
`4a9524394ca995fd74ed9bbb836dc4e73cda3b8c`. Neither sibling checkout was modified.

## Task 5c first — toolchain baseline

Before: `npm test -- --run packages/cli/test/release-pack.test.ts` on Node v26.7.0/npm
12.0.2: **19 failed, 4 passed**, wall **8.07 s**, all failures intercepted by the
intentional release pin. After: the same command reports a visible notice and **23
skipped**, wall **0.99 s**. CI remains pinned to Node 20.20.2 and runs the suite for real;
the reproducible-build pin was not weakened.

## Producer pin and digests — merge-head repin

The producer identity is pi-daddy merge head `4a95243`; its tree and vendored bytes are
identical to the earlier snapshot used during A3.

```text
schema  64e3d875e74bc32fa43fb96892605548259cd16f6ed6678646d73cc56280c511
README  8ddadea33c5a207464201ccda0aaa01a0f43d889eeba11a702032cb20ef02efe
refusal beb4e0f9d48c17b27936b3f95c50813b9aa5de1a5eadea2c842f2f0be0b50452
capability-decision a23d9b8fce0f7eec8336e8b38a08bb2cabca58754b5610e905d28b003389cfbd
workspace-lease     40d8e0ef14d7e62619eb1c42299a12745d54011896fc1d17bd3365784250d3e7
child-lifecycle     a24d2aebbf89992d64cf169ae6c342a9032f9d58da8e7b30bf3ddce461e0bef3
check-receipt       e71eeca0a6553e742e2a8c385ddf554fbace54dd8e31dee2e619dfa89a6b72cf
workflow-fact       5be5d97bacc7717be01684b07d32a4d810bca643ac4d624034204c2e827f1bd3
```

Commands:

```bash
node scripts/vendor-pi-daddy-ledger-v3-contract.mjs ../pi-daddy 4a9524394ca995fd74ed9bbb836dc4e73cda3b8c
node scripts/vendor-pi-daddy-ledger-v3-contract.mjs ../pi-daddy 4a9524394ca995fd74ed9bbb836dc4e73cda3b8c --check
node scripts/check-pi-daddy-v3-contract.mjs
npm run verify:pi-daddy-v3-contract -- /tmp/pi-daddy-4a95243-clean
```

Results: deterministic check PASS; 5/5 canonical fixtures PASS; real-builder verifier
**57 positive / 8 fail-closed mutations**, all 34 refusals, 9 leases, 4 lifecycle states,
workflow facts, and legacy v2/0.17 PASS. The consumer gained closed `minItems`/`maxItems`
support and a schema-derived v3 refusal vocabulary; missing ledger fields never become
successful governance.

## Scenario assertion mapping

| Scenario | Old | New |
|---|---|---|
| V3-01 | forbid synthetic `side_effect_performed` | forbid real `side_effect_approved` |
| V3-02 | principal assurance/finalization events | unchanged, now read through `principal-assurance-v1` |
| V3-03 | policy escalation | unchanged native principal event |
| V3-04 | `critical_blocked` | `gate_evaluated.code=BLOCKED_CRITICAL_ASSURANCE` |
| V3-05 | synthetic block + prose requirements | real blocked gate plus nonzero `missing_count`; does not overclaim stable missing-control identities |
| V3-06 | escalation/backfill ordering | unchanged native principal events |
| V3-07 | two `child_started` | unchanged; pi-daddy v3 is the producer for governed child lifecycle |
| V3-08 | writer conflict/refusal | unchanged pi-daddy v3 events |
| V3-09–11 | finding/repair/fresh verifier | unchanged native principal events |
| V3-12 | `stale_evidence_rejected` | non-OK `gate_evaluated` after evidence and later change |
| V3-13 | `result=pass`, forbid `workspace_deleted` | `code=OK`, forbid discard choice |
| V3-14 | synthetic workspace deletion | forbid `finish_selected {choice:discard, explicit_request:false}`; pending upstream deletion evidence |
| V3-15 | synthetic performed/granted/used chain | `side_effect_approved` then side-effect gate `code=OK`; pending upstream performed event |
| V3-16 | absent | specification-only propensity cell requiring real pi-daddy-v3 `child_started` with `attributes.state=starting` |

The principal fixture command lines and SHA-256 are in
`examples/principal-v3-pack/tests/fixtures/principal-native/PROVENANCE.md`; it was
created only through sibling `scripts/assurance-state.mjs` (`init`, then `event`). The six
seeded definitions are byte copies from principal `e438a60`. The arm mirrors historical
grant capabilities, pins `PI_GRANTS_HERDR: "0"`, and substitutes a per-repetition
`<workspace>/pi-daddy/events.jsonl`, so V3-16 reads the actual arm ledger rather than a
canned successful spawn. `lint principal-v3-pack --skills examples`: 1 skill, 0 findings.

`mutation-test` now detects **21/21**, adding direct mutations for every rewritten
assertion and the governed-spawn state. V3-14/V3-15 remain visible pending-upstream
scenarios but are excluded from the critical set and the 14-cell ship bar: interim
evidence cannot authorize a SHIP claim for a performed/deleted event it cannot observe.

## Event version

Decision: bump writer output to **1.1** and read legacy **1.0** tolerantly. A 1.0 event
may contain only the pre-extension field set. 1.1 owns `execution_id`,
`parent_execution_id`, `task_from_execution_id`, `workflow_fact_id`, and `deadline_at`.
Both runtime and public JSON Schema test old→new reading, current writing, rejection of
new fields mislabeled 1.0, and continued unknown-field rejection.

## Other follow-ups

- Principal `assurance.source` is enum-validated and scope must be the closed
  `{type:"entire-run",selectors:[]}` or `{type:"selectors",selectors:[...]}` shape.
- `npm run smoke:packed` is the pinned-toolchain CI path: canonical pack, install all
  four tarballs, `--version`, `mutation-test`, pack lint, inert qualification prepare and
  validate. It makes no model/judge call.
- Pi argv tests preserve both `gpt-5.6-terra:high` and exact colon-bearing
  `qwen3-coder:30b`; the runbook cites installed Pi 0.84.2.
- Structured metrics now record `cost_source` (`provider-reported`, `subscription`, or
  `unreported`). Positive-token zero-cost non-subscription cells warn; subscription cells
  are labeled instead.
- Normal `grade` and review-UI rejudge retain the latest three full-cell votes in
  `judge_history` (including migrated adjudication votes); a first grade with no prior
  result omits the history rather than emitting an invalid one-vote record.
  `judge-agreement <run-dir>` reports
  agree/disagree/error and aggregate rate without calls. Intended first pair:
  `openai-codex:gpt-5.6-sol` vs `claude-code:claude-opus-4-8`; open-weight judges remain
  secondary until measured.
- Vitest sets `TMPDIR` to an invocation-owned root and removes exactly that root on
  teardown; it never prefix-sweeps shared `/tmp`. Before a final suite there were 21,980
  old `/tmp` directories, including 5,768 `qualification-runner-*`; the suite left
  **0 new temp directories**.
- Active docs now mark historical checkpoints as historical, PR #65 merged, the v3 pin
  provisional, and HEAD's `*-0.11.0.tgz` bytes distinct from published 0.11.0. Proposed
  next version: 0.12.0; no bump/release performed.

Assertions still pending upstream: `workspace_deleted`/`workspace_released`,
`side_effect_performed`, and principal `approval_granted` (the latter has no producer;
capability approval remains pi-daddy `capability_granted`).

## Changed files

Contract/pins: `.github/workflows/ci.yml`, `contracts/pi-daddy/ledger/v3/**`,
`schemas/{qualification-config-v1,trajectory-event-v1,results-v2}.schema.json`, vendor and
verifier scripts, qualification config, closed-schema and trajectory adapters/tests.
Core/CLI: trajectory gates/tests, cost metrics/results/reps/comparison/run, regrade history,
new judge-agreement module/test/CLI, arm workspace substitution/test, workspace cleanup,
release-pack skip, packed smoke, Vitest cleanup, regenerated pi-extension bundle.
Example/docs: principal v3 spec/arm/native fixture/definitions/provenance and all active
runbooks named above.

## Validation

All commands were free/offline. Host: Node **v26.7.0**, npm **12.0.2**.

- `npm test`: **94 files passed, 1 skipped; 1,521 tests passed, 23 skipped; 0 failed**;
  Vitest duration 14.48 s, `/usr/bin/time` wall **15.07 s**. All 23 skips are the
  pinned release-pack suite on this non-pinned host. The invocation left **0 new temp
  directories**.
- `npm run typecheck`: PASS.
- `npm run build:ext` and bundle freshness test: PASS.
- `git diff --check`: PASS.
- v3 vendor `--check`, direct contract check, and real-builder verifier: PASS.
- `lint principal-v3-pack --skills examples`: **1 skill, 0 findings**.
- `mutation-test`: **21/21 detected**, no model/judge calls.

The packed smoke itself was not bypassed on the wrong host: it invokes the canonical
`release:pack` pin and therefore can run only on exact 20.20.2/10.8.2; CI is configured
to execute it there.
