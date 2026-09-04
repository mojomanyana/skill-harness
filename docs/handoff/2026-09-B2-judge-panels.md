# B2 handoff — qualification judge panels

## Identity and scope

- Started from exact Wave 1 final pin `1e5dbc0beb17c1406edd588914cb9c026ac322aa`.
- Starting branch: `wave1/audit-followups`; the pin was **not** contained in local `main`.
- Work branch: `feat/qualification-judge-panels`.
- Calibration finding verified before implementation: SHA-256 `609d788a4e1f0bf436342fc5adb05c6c34a6d12f56bd35e8050584a0968ea1d3`.
- `/home/neman/Code/principal-v3-qualification-20260901` and the two excluded repositories were not modified.
- No subject, model, or judge calls were made.

## What existed

Skill-harness already had the correct semantic pieces: `parseVerdict`, the judge-misfire detector, clean-vote exclusion, `confirmed` / `tie_broken` / `unresolved` collapse, repetitions, Critical repetition tightening, suspect-blocks-SHIP, and the offline judge-agreement report. Qualification already had the stronger execution boundary: one invocation per call, OAuth-only readiness, sanitized environment, atomic launch claims, exact ceiling checks, process occurrence evidence, immutable terminal receipts, artifact/provider/model validation, and tamper-evident lifecycle/accounting chains.

The divergence was that ordinary adjudication applied those semantics selectively to a completed scenario cell, while qualification accepted one generic judge invocation per subject artifact and had no panel aggregate, no disagreement output, and no separate behavioral-failure versus collection-halt axis.

## What was built

- `packages/core/src/vote-panel.ts` is the shared, domain-neutral clean-vote collapse. Existing `collapseJudgments` now delegates to it; qualification does not carry a second majority implementation.
- Prospective `qualification-judge-panel-policy-v1` plus `qualification-board-v1` configuration. Omission preserves historical single-draw config/invocation behavior.
- `qualification-invocation-v4` binds judge panel ID, ordinal, subject invocation ID, and subject artifact SHA-256 under terminal-receipt-v3's immutable invocation digest.
- The approved board binds the complete measurement/scenario/stimulus/rubric/subject-input identity, subject arm, each ordinal's judge arm, exact panel/repetition membership, Criticality, and threshold.
- Judge input must structurally contain the exact bound subject-artifact digest. Panel members are read only through full terminal-receipt, accounting, OAuth, subject-artifact, and provider/model validation.
- `qualification panel` and `qualification cell` are offline derived-evidence commands. `qualification validate` is the canonical validator for both base spool evidence and complete approved-board panel/cell evidence.
- Public closed schemas were added for panel and cell outputs; the committed pi-extension bundle was rebuilt.

## Configured agreement rule

The configuration records, verbatim:

- `initial_judge_calls: 2`
- `agreement: two-matching-clean-votes`
- `split: one-conditional-tie-break`
- `max_judge_calls: 3`
- `error: record-as-non-vote`
- `unresolved: inconclusive-blocks-acceptance`
- `behavioral_failure: record-and-continue-read-only-board`
- `integrity_failure: halt`

Two matching clean PASS/FAIL votes confirm an artifact. Two opposing clean initial votes authorize exactly one third member. A clean 2-of-3 majority is `tie_broken`. ERROR, ambiguous, or suspect/misfired answers remain recorded but do not vote. Fewer than two matching clean votes is `inconclusive`, not behavioral FAIL. A two-member clean split cannot be persisted or validated as final evidence.

## Disagreement output

Each artifact panel records:

```json
"disagreement": {
  "initial_split": true,
  "minority_rate": 0.3333333333333333
}
```

Each scenario/subject-arm cell records:

```json
"disagreement": {
  "judge_calls": 7,
  "clean_votes": 7,
  "split_artifacts": 1,
  "artifacts_with_two_clean_initial_votes": 3,
  "unresolved_artifacts": 0,
  "judge_split_rate": 0.3333333333333333
}
```

The denominator is explicit. Final validation rebuilds these values from fully validated member receipts/artifacts and rejects missing, extra, duplicated, incomplete-split, reordered, identity-mismatched, or tampered derived evidence.

## Exactly-once accounting under panels

A panel is never an accounting unit. Every member remains a distinct ordinary qualification invocation with its own OAuth check, launch authority, atomic claim, accounting event, process receipt, artifact, and terminal receipt. The third member is rejected before OAuth readiness and before the launch claim unless members 1 and 2 are terminal clean opposing votes. No automatic retry was added.

The prospective accounting maximums are Wave A subject 54 / judge 162 and complete program subject 642 / judge 1926, with hard ceilings 700 / 2100. The panel policy separately records minimums 108 and 1284. Realized judge count is exactly two events per artifact plus one event per clean initial split. Historical 54/54, 642/642, 700/700 policy bytes remain accepted only when panel policy is omitted.

## Failure versus halt

Critical aggregation retains skill-harness's stronger rule: every clean Critical repetition must pass, regardless of a looser requested threshold. A settled Critical FAIL records:

```json
{
  "verdict": "FAIL",
  "critical_failure": true,
  "acceptance": "fail",
  "collection": "continue"
}
```

Thus a predetermined read-only board completes without order-dependent behavioral abort. Authorization, identity, accounting, corruption, receipt/artifact, and launch-integrity failures remain operational failures; unresolved panels block acceptance as `inconclusive` rather than becoming behavioral FAIL.

## Tests and mutation checks

Added/extended coverage includes:

- agreeing two-vote panel;
- clean split plus exactly one tie-break;
- premature/non-split tie-break rejected before accounting;
- attempted judge failure retained as ERROR/non-vote;
- per-artifact and per-cell disagreement fields;
- independent accounting events for every member;
- v4 panel/subject artifact/input bindings;
- approved-board identity and call-budget parsing;
- canonical derived-output completeness and tamper rejection;
- incomplete clean split rejection;
- Critical FAIL records without halting;
- public schema/runtime parity.

Every new behavior test was exercised against a temporary mutated implementation and observed red before restoration. Detected mutations included: disabling clean-vote filtering; undercounting panel calls; counting ERROR as clean; weakening Critical threshold; changing read-only collection to halt; erasing split rate; bypassing policy/board/measurement joins; accepting ordinal 4; downgrading v4; removing structural subject-artifact input binding; reverting panel accounting to legacy; discarding validated judge text; bypassing preclaim tie-break authorization; relabeling judge error as FAIL; omitting derived evidence from canonical validation; accepting an incomplete split; bypassing cell tamper comparison; and removing the public panel schema. Evidence was retained during the task at `/tmp/qualification-panel-mutation-evidence-final.txt` and all mutations were restored.

## Exact free/offline verification

- `npm run typecheck` — PASS.
- `npm test` — **100 files passed, 1 skipped; 1,554 tests passed, 25 skipped (1,579 total)**. All 25 skips were confined to `packages/cli/test/release-pack.test.ts`, which requires pinned Node 20.20.2/npm 10.8.2; this run used Node 26.7.0/npm 12.0.2.
- `node bin/skill-harness.js mutation-test` — baseline PASS; **21/21 mutations detected; no model or judge calls**.
- `node bin/skill-harness.js lint principal-v3-pack --skills examples` — **1 skill, 0 findings**.
- `node scripts/vendor-pi-daddy-ledger-v3-contract.mjs /home/neman/Code/pi-daddy 4a9524394ca995fd74ed9bbb836dc4e73cda3b8c --check` — deterministic/current PASS.
- `node scripts/check-pi-daddy-v3-contract.mjs` — **5/5** canonical fixtures accepted; occurrence/refusal/closed-schema controls active; no model or judge calls.
- `npm run build:ext` — PASS; committed extension bundle regenerated.
- `git diff --check` — PASS.
- Temp cleanup: an initial **8,875** stale `/tmp/qualification-*` and `/tmp/pi-daddy-v3-selector-*` directories were removed; final matching count was zero.

## Follow-ups

Part B must update the private qualification packet/config/request generation to select this prospective policy and approved-board shape. No private packet or historical Wave A evidence was rewritten here.
