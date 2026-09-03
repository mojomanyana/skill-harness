---
name: skill-harness
version: 0.10.0
description: >
  Use to test, grade, and optimize an agent skill against a spec. Triggers:
  "test the <skill> skill", "/skill-harness", "run the skill bench", "grade these
  scenarios", "did my SKILL.md edit help", "review the skill scorecard", "add a
  test case for <skill>". Drives the skill-harness CLI: discover → run scenarios
  on pi → LLM-judge grade → interactive review → re-run to measure an edit.
  NOT for running a skill in production, and NOT itself a shipped skill.
---

# skill-harness — the skill test/optimize loop

A spec'd skill is testable when `<skill>/tests/specification.yaml` exists. This
skill drives the `skill-harness` CLI (pi harness only). Run commands from the tool
repo with `npm run dev --` (dev) or the `skill-harness` bin (built).

## Core principle
**A skill ships only when its scenarios pass under a judge that is NOT the model
under test.** Subject ≠ judge — same-family grading inflates scores. Single runs
lie on weak/stochastic models; re-run before trusting a delta.

**Where an objective gate exists, prefer it to the judge.** `assert.trace` states
what the model DID — which tool it called, which path it touched. `assert.trajectory`
states whether a multi-phase workflow obeyed state, capability, workspace, authority,
freshness, and finalization contracts. Both read structured evidence, run BEFORE the
judge, and cost zero judge tokens when they fail. An objective FAIL or ERROR outranks
the judge's verdict; only an explicit author override beats it.

## The loop
1. **Discover.** `skill-harness list --skills <root>` → which skills have a spec.
   Default `<root>` is the current dir; ask if ambiguous.
2. **Confirm the run.** Ask the user: which skill (or `all`), which model(s) under
   test, and the judge. Offer the defaults:
   - subject model: `fireworks:accounts/fireworks/models/deepseek-v4-pro`
   - judge: `claude-code:claude-opus-4-8` (distinct from the subject; runs on the
     user's Claude subscription, not a metered key). A metered judge is **refused**
     unless the user opts in with `--allow-metered-judge` — never add that flag on
     their behalf; ask. `SKILL_HARNESS_JUDGE` sets the default once per repo/shell.
   - mode: `green` (the harness activates the skill) or `force` (SKILL.md as the
     system prompt) — **both are scored**; `red` = the unscored baseline contrast.
     Say this when it matters: green delivery depends on the harness version (pi ≥
     0.83.0 discloses only the skill's description and loads the body on demand, and
     accepts a bad `--skill` path silently), so `force` is the mode to use for
     results that will be published, and `--canary` (one extra call, green only)
     proves delivery per run and aborts if the skill never arrived.
   `--model` repeats for multi-model comparison (or `--models <file>`).
3. **Run + grade.** `skill-harness run <skill> --skills <root> --model <m> [--model <m2>]
   [--judge <prov:model>]`. This runs every scenario, grades each transcript, writes
   `results.yaml`, and prints a scorecard per model. Heed any judge≈subject warning.
3b. **Ask for a second opinion where it decides the ship.** Add `--auto-rejudge` to
   `run` or `grade` to re-judge cells that are ambiguous, self-contradictory,
   non-unanimous across reps, or ship-deciding. It discloses an exact ceiling on
   ADDITIONAL judge calls before spending one, and names any cell it cannot settle
   without `--tie-break-judge`. An unresolved disagreement blocks SHIP; it never
   resolves itself.
4. **Check what one run is worth.** `skill-harness stability <skill> --skills <root>`
   (free, offline) lists scenarios whose verdict flipped between runs of the same skill ×
   model × mode. `flakiness 0.00` cannot see this — it compares reps inside ONE run — so
   before you report a per-scenario delta, say whether that cell is a boundary cell. The
   fix is `--reps N` on it, never a spec edit; `lint` reports these as notes that do not
   fail the gate.
5. **Review.** `skill-harness review <skill> --skills <root>` opens an interactive
   matrix (model × scenario). Tell the user to click cells, read transcripts, flip
   verdicts, and add notes — saves persist to `results.yaml`. Ctrl-C to stop.
6. **Add a test.** `skill-harness add-test <skill> --skills <root> --id <ID> --title <T>
   --turn "<turn>" [--turn ...] --check "<item>" [--check ...] [--critical]
   [--mode seeded --fixture <path>]`. Gather the fields conversationally first.
7. **Compare a reference and candidate when isolation matters.** `skill-harness compare`
   uses the same spec/fixture/model/mode/judge/repetition plan on both snapshots. Confirm
   the spend first. It is paired setup, not seeded LLM sampling; partial/affected is
   branch feedback and never SHIP.
8. **Optimize.** The user edits `<skill>/SKILL.md` → re-run → compare the new
   scorecard to the old `results.yaml`. Report the per-scenario delta, not just the
   letter grade. Before spending a full wave on an edit, `skill-harness affected
   <skill> --skills <root> --base <ref>` names the scenarios that edit could touch
   (free, offline). An affected run is partial and never reports SHIP.

## Free, offline, and worth running first
None of these spend a model or judge token. Reach for them before anything paid:
`list`, `lint`, `stability`, `rescore`, `mutation-test`, and —
- `coverage <skill|all> --skills <root>` — which SKILL.md sections have a declared
  test. `covers` records that somebody LINKED a test to a section; it is not proof
  the behaviour is tested, and it is worth saying so when you report a percentage.
- `affected <skill> --skills <root> --base <ref>` — which scenarios a diff could
  touch. Resolves every ambiguity toward selecting more.

**Match the remedy to the drift; `lint` names it.** `stimulus:` → `run` (spends),
`rubric:` → `grade` (judge only), `policy:` → `rescore` (free), `gates:` → `regate`
(no subject call; one judge call for each fail→pass rep). Never reach for `run` when lint
asked for one of the other three. Confirm that possible judge spend before running `regate`.

## Capturing a real failure
`/skill-harness capture` (pi extension only — NOT a CLI command, and it refuses to
run headless) promotes turns from a live pi conversation into a regression case.
There is a preview step before anything is written; that preview is what keeps
secrets out of a committed file, which is why the command has no unattended mode.

## Tenets
1. **Judge ≠ subject.** Never let the judge model sit in the model set being tested.
2. **Critical + B-series gate the ship.** A critical-id fail or any under-pressure
   (B*) fail blocks SHIP even if the pass count clears the bar. Every clean critical
   repetition must pass; this includes over-refusal/right-sizing counterexamples.
2b. **Missing evidence is ERROR, never a pass.** A gate that could not be checked —
   no trace produced, a workspace never observed, an argument redaction destroyed —
   reports ERROR and blocks. A vacuous PASS is the one outcome the harness will not
   print, because it is indistinguishable from a real one.
3. **The author owns the verdict.** The judge proposes; overrides + notes in the
   review UI are the durable record. Commit `results.yaml`, not transcripts.
4. **Re-grade cheaply before re-running.** `skill-harness grade <run-dir> --judge <m>`
   re-scores saved transcripts with a different judge — no model re-runs. Use it to
   de-confound a suspicious result before spending tokens on a fresh run.
5. **Don't trust one run on a weak model.** Re-run noisy scenarios; a single pass/fail
   on a stochastic model is not a signal.

## Handoff
You drive the CLI and interpret scorecards; the human flips verdicts in the review
UI and edits the `SKILL.md` under test. You don't edit the skill being tested unless
asked — you measure it.
