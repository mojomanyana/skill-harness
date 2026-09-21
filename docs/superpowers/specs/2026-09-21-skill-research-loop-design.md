# Skill research loop — design

**Date:** 2026-09-21
**Status:** approved design, not yet planned or implemented
**Companion:** `2026-09-21-jev-advisors-design.md` (advisor package, budget and authority rules
apply here unchanged)
**Depends on:** pi-daddy 0.30.0 (ADR-0076), pi-daddy work plans, context handoff (ADR-0078),
the shared advisors package (ADR-0077), Principal 4.0 and the new Principal measurement repo.
The implementation plan is written once those land (see `docs/NEXT-SESSION.md`).

## Goal

From inside pi, research a new skill or set of skills end to end: frame a hypothesis about
model behavior, gather evidence, write scenarios the naked model fails, draft candidate
`SKILL.md` texts, measure them, choose blind, improve within a budget, and ship the winner
with its regression spec. pi-daddy coordinates the stages as a work plan under grants;
skill-harness is the instrument; Jev advises and never decides.

## Decisions (recorded, closed)

| # | Decision | Chosen |
|---|---|---|
| 1 | Orchestrator | pi-daddy work plan from day one; the harness ships the plan template `skill-research-v1` |
| 2 | Red first | Scenarios are drafted and run in `red` mode before any skill text exists; scenarios the naked model already passes are dropped before green spend |
| 3 | Skill text | Drafting and `improve` are propose-only; a human applies text. Rule 6 of AGENTS.md holds |
| 4 | Choice | The human chooses between candidates blind, in the review UI; advisor recommendations are shown only after the choice is recorded |
| 5 | Experiment record | The existing learning lifecycle (case → hypothesis → comparison → blind choice → adoption) is renamed and trimmed into the experiment record; it stays in the harness |
| 6 | Runner | pi only in the first version |
| 7 | Spend | One printed plan before the first call: red runs, green runs per candidate, judge calls, advisor calls, USD ceiling for subject spend; refuse before spend; a ceiling stop leaves a partial, honest record |

## Stages

| # | Stage | Executor and grant | Harness contribution | Advisor (advice only) |
|---|---|---|---|---|
| 1 | Frame | user in pi | hypothesis form: target behavior, models, ship bar, budget | none |
| 2 | Research | child, read-only + web | research note format: claims with evidence excerpts and sources | `research` preset per claim; low support is flagged to the user, never dropped |
| 3 | Red first | harness `run --mode red` | `suggest --from <research note>`; discriminating-check report drops scenarios the naked model passes | `noul` per check "objective and discriminating?" orders scenarios under the budget |
| 4 | Draft | child, write grant limited to `candidates/` | two or three `SKILL.md` candidates stored by digest with lineage | none |
| 5 | Measure | harness `compare`, trigger suite, ablation arms | trigger suite; ablation arms; per-arm context cost in the scorecard | misfire screen, re-judge ranking (companion spec) |
| 6 | Choose | user in review UI | blind choice between candidates (existing) becomes the front door | `choice` over scorecards, revealed after the human choice |
| 7 | Improve | child, propose-only | `improve`: patch proposal from failed criteria, transcripts and reviewer notes | `completion` preset "hypothesis satisfied?" recorded, not gating |
| 8 | Ship | user | adoption record links winning digest, spec and runs; spec committed as regression suite | none |

Stages 5–7 loop until the ship bar is met, the budget is exhausted, or the user stops.

## Components

### Experiment record (harness, `packages/core`)
Rename and trim the learning lifecycle: `hypothesis` (falsifiable, human-authored), `candidates`
(digest, parent digest, author: human or `improve` proposal id), `comparison` (run dirs,
scorecards, arms), `choice` (blind, durable before reveal), `adoption` (winner, committed spec
path). Content-addressed and append-only as today. Trust cohorts, nomination predictions and
Pi-session retention are not part of the record; they move or are removed per the roast
follow-up.

### Research note format
Markdown with a fenced YAML block: `claims[]{ id, text, evidence[]{ excerpt, source } }`. The
harness validates it offline (`lint` knows the format); `suggest --from` reads claims into
scenario drafts; advisors read `claims[]` only, never the prose.

### `suggest --from <note>` and the discriminating-check report
`suggest` gains a research-note input beside the existing `SKILL.md` input. A new free
offline command reports, per scenario and check, the red pass rate; anything the naked model
passes at or above the ship threshold is marked non-discriminating and excluded from green
runs unless the author keeps it explicitly. The same report runs after green to flag checks
that pass in both arms.

### `improve <skill> --run <dir>` (propose-only)
One judge-provider call with failed criteria, the relevant transcript excerpts, reviewer notes
from `results.yaml`, and the current skill text. Output is a unified diff written beside the
candidate, never applied. Records the proposal in the experiment record. An iterating
GEPA-style variant is a later stage.

### Trigger suite and ablation arms
Trigger: should-fire and should-not-fire prompts, false-positive gate, collision detection
across the skills root; description-only calls. Ablation: an arm in `tests/arms.yaml` may
remove a named section and declare expected regressions; `coverage` maps sections to tests.

### pi-daddy work plan template `skill-research-v1`
Shipped by the harness. Eight tasks with the grants above; each task invokes harness commands
and passes the research note, candidate digests and run dirs by context handoff. pi-daddy's
ledger records every child; the harness joins ledger events to run dirs through the existing
ledger adapter after the 0.30.0 re-pin.

## Error handling
- A stage that exceeds its grant is refused by pi-daddy; the harness records the refusal in the
  experiment record and stops the loop.
- Budget ceiling reached: remaining stages are skipped, the record says so, nothing is judged
  or adopted automatically.
- Advisor unavailable: stage proceeds without advice, per the companion spec.
- A candidate whose digest already exists is not re-run; the record links the prior runs.

## Testing
- Unit: research note parser and lint; discriminating-check report on synthetic red/green
  results; `improve` prompt builder and diff writer with a fake judge; experiment record
  transitions (pure); trigger suite scoring; ablation arm parsing.
- Offline: whole loop over synthetic run dirs with a fake pi and fake advisors, asserting the
  record, the printed spend plan and the blind-choice reveal order.
- Integration (paid, opt-in, tiny): one red run of one scenario on one cheap model through the
  real template, then stop at the ceiling.

## Non-claims
No claim that the loop produces better skills until measured on the Principal measurement repo.
No automatic skill edits. No advisor authority. No runner other than pi.

## Out of scope
Multi-runner adapters. Auto-applying `improve` output. Trust-cohort and nomination machinery.
