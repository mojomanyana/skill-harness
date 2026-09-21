# Jev advisors for skill-harness — design

**Date:** 2026-09-21
**Status:** approved design, not yet planned or implemented
**Depends on:** pi-daddy ADR-0076 advisors layer (shared package), pi-daddy 0.30.0 re-pin,
Principal 4.0.0 release and the new Principal measurement repo. The implementation plan is
written once those land (see `docs/NEXT-SESSION.md`).

## Why

Judging is the harness's only recurring cost and its least trustworthy step: misfires are
caught by a heuristic, untrustworthy cells are found by fixed rules, and re-judging spends
the user's subscription on every cell the rules name. Jev (TypeSafe, `typesafe/jev-1.13` on
OpenRouter) is a non-generative decision model: a JSON `state` plus typed `questions`
returns typed answers (`choice`, `score`, `noul` probability) in 70–600 ms for roughly
$0.00003 a call, with a 32 KiB input cap. It cannot read a transcript, but it can grade a
judge's output, rank cells, and answer completion questions over the structured trace.

The harness is a measurement tool, so the first thing it does with Jev is measure Jev:
author overrides in `results.yaml` are ground-truth labels the repo already keeps.

## Decisions (recorded, closed)

| # | Decision | Chosen |
|---|---|---|
| 1 | Scope | One advisors feature with several decision points, each default off |
| 2 | Client owner | Small shared package extracted by pi-daddy from its ADR-0076 `advisors/` layer (`Decider` interface, null decider, Jev-over-OpenRouter adapter). Harness depends on it normally; no second client |
| 3 | Spend | Separate **advisor budget**, opt-in per run, hard per-run call cap, exact maximum cost printed before the first call. Metered-judge refusal untouched |
| 4 | Authority | Advice may **flag** (mark a cell `suspect`, which already blocks SHIP) and **steer spend** (rank cells for the second judge call). It never turns FAIL into PASS, clears a flag, passes a gate, or counts as a panel vote |
| 5 | Delivery | Staged: record and report first; inline hooks only after the agreement report exists |

## Fixed rules

- **Privacy.** Jev never receives a raw transcript, user prompt text, fixture contents or
  environment. Allowed inputs: a judge's own output; one criterion's text plus a bounded
  excerpt the judge quoted; the normalized execution record (`.trace.jsonl` events: tool
  names, paths, call counts, gate results). Inputs are truncated to fit 24 KiB with the
  truncation recorded. Secrets scrubbing reuses the capture redaction rules.
- **Spend is never implicit.** No advisor call happens unless `--advisors jev` (or
  `SKILL_HARNESS_ADVISORS=jev` for a repo/shell) is set **and** the run prints
  `advisors: jev, MAX N calls, ≤ $X` before the first call. The null decider is the default
  and produces byte-identical results to a build without the feature.
- **Every call is a record.** Each advice row stores question kind, input digest, answer,
  probabilities, model id, latency, and cost from the provider's `usage`. Rows are additive
  fields in results schema 3; schema-1/2 readers are unaffected.
- **Advice is not a verdict.** `rep_judgments[]` and criterion votes are untouched by
  advice. Only the existing `suspect` projection and the adjudication planner read it.

## Architecture

### Package boundary
`@mojomanyana/agent-advisors` (name to be fixed by pi-daddy): `Decider` with `choice`,
`score`, `noul`; `NullDecider`; `JevOpenRouterDecider({ apiKey, model, timeoutMs })`;
typed errors (`AdvisorUnavailable`, `AdvisorBudgetExceeded`, `AdvisorInputTooLarge`).
skill-harness adds nothing to the client; it adds the harness-specific **questions** and
the **budget**.

### Advisor budget (`packages/core/src/advisor-policy.ts`)
Mirrors `judge-policy.ts` and `adjudication.ts`: `planAdvice(...)` is pure and returns the
maximum call count and cost; `assertAdvisorsAllowed()` refuses unless the opt-in is present;
a per-run counter enforces the cap and turns overflow into `AdvisorBudgetExceeded`, which
downgrades the remaining decision points to the null decider and records that in the run
banner and `results.yaml`.

### Decision points

| Point | Stage | Input (≤ 24 KiB) | Question | Effect when on |
|---|---|---|---|---|
| **Judge misfire screen** | grade | judge output + verdict | `noul`: "does this reasoning evaluate the listed criteria and support the stated verdict?" | probability below `advisors.misfire_threshold` (default 0.5) marks the rep `suspect` |
| **Re-judge ranking** | adjudication plan | per-cell summary: votes, verdict, misfire probability | `score`: trust level per cell | orders which cells receive the authorized second judge call; never adds calls beyond the printed cap |
| **Trace completion** | regate / run | normalized trace events + scenario objective text | `noul` (Jev `completion` preset semantics): "was the objective achieved?" | recorded beside objective gates as advice; disagreement with a PASS gate marks `suspect` |

### Recording (results schema 3, additive)
```yaml
rep_judgments[].advice:
  - point: misfire_screen | rejudge_rank | trace_completion
    kind: noul | score | choice
    input_sha256: …
    input_truncated: false
    answer: 0.83            # noul probability, score level or choice key
    probabilities: {…}      # when the kind returns them
    model: typesafe/jev-1.13
    provider: openrouter
    latency_ms: 214
    usage: { input_tokens: 812, cost: 0.000034 }
```
`lint` validates the block offline; a row without `input_sha256` or `model` is ERROR.

### Agreement report (`advisor-agreement <run-dir>...`, free, offline)
For every retained advice row: agreement with the recorded judge verdict, agreement with
the **author override** where one exists, calibration buckets (predicted probability vs
observed override rate), and per-point counts. Prints the same boundary caveats as
`stability`: never pool green and force runs; a cell with fewer than `--min N` labels is
reported as insufficient. This is the command that decides whether stage two is trusted.

## Stages

1. **Record and report.** Shared package dependency; advisor budget; `--advisors jev`
   flag and env; the three decision points run but only **record** advice (no `suspect`
   effect); `advisor-agreement` command; schema and lint updates; docs. Every stage-one
   run prints the maximum cost first.
2. **Misfire flag.** Enable the `suspect` effect of the misfire screen behind
   `advisors.effects: [misfire_suspect]` in the spec or a run flag. The `detectMisfire`
   heuristic stays as the fallback when advisors are off.
3. **Re-judge ranking.** The adjudication planner consumes the trust score to order cells
   within the existing `MAX_JUDGMENTS` cap. Rule kept: planning is pure; ranking changes
   order, never count.
4. **Trace completion flag.** Enable the `suspect` effect of trace completion, only for
   scenarios whose spec declares `advisors.trace_completion: true`.

Each stage ships with its post draft and a `docs/NEXT-SESSION.md` entry, per ROADMAP rules.

## Error handling

- Provider errors, timeouts (default 5 s) and `AdvisorInputTooLarge` never fail a run:
  the point records `advice.error` and falls back to the null decider for that call.
- `AdvisorBudgetExceeded` disables further calls for the run and is reported in the banner
  and results; verdicts are unaffected because advice can only add flags.
- A missing OpenRouter key with `--advisors jev` set is a fast, pre-subject-call refusal,
  like the metered-judge refusal, naming the env var to set.
- Jev unavailable at package level (peer not installed) is a clear message at flag parse.

## Testing

- Unit: budget planner (pure), input builder truncation and redaction, each decision
  point with a fake `Decider`, `suspect` projection unchanged when advisors off
  (byte-identical results fixture), schema validation of advice rows, `lint` ERROR rules.
- Offline: `advisor-agreement` over a synthetic results corpus with known overrides,
  including the insufficient-labels path and the green/force non-pooling guard.
- Integration (one, paid, tiny): a single real `noul` call through the shared package
  against a saved judge output, asserting the recorded row shape and that cost is under
  the printed maximum. Gated behind an explicit env flag like the existing live smokes.
- Regression: a run without the flag produces results byte-identical to today's fixtures.

## Sequencing with the other repos

1. pi-daddy lands ADR-0076 PRs 1–3 and publishes the shared advisors package (its PR 6).
2. skill-harness performs the one-time 0.30.0 re-pin (ledger contract, bridge version
   negotiation, exports) and repoints Principal docs to the new measurement repo.
3. Stage one of this design, measured on the new Principal measurement repo's corpus.
4. Stages two to four only after `advisor-agreement` shows calibrated agreement with
   author overrides on that corpus.

## Non-claims

No claim that Jev's probabilities are calibrated for this corpus until measured. No change
to what a verdict means, to the ship bar, to objective gates, or to the author's ownership
of the verdict. No OpenRouter spend without the printed opt-in. No harness-specific Jev
client.

## Out of scope

Routing `/skill-harness` commands with Jev (pi-daddy's job). Using Jev as a panel voter.
Porting Principal's assurance ledger. Any change to the qualification runner.
