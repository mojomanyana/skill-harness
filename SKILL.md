---
name: skill-check
version: 0.1.0
description: >
  Use to test, grade, and optimize an agent skill against a spec. Triggers:
  "test the <skill> skill", "/skill-check", "run the skill bench", "grade these
  scenarios", "did my SKILL.md edit help", "review the skill scorecard", "add a
  test case for <skill>". Drives the skill-check CLI: discover → run scenarios
  on pi → LLM-judge grade → interactive review → re-run to measure an edit.
  NOT for running a skill in production, and NOT itself a shipped skill.
---

# skill-check — the skill test/optimize loop

A spec'd skill is testable when `<skill>/tests/specification.yaml` exists. This
skill drives the `skill-check` CLI (pi harness only). Run commands from the tool
repo with `npm run dev --` (dev) or the `skill-check` bin (built).

## Core principle
**A skill ships only when its scenarios pass under a judge that is NOT the model
under test.** Subject ≠ judge — same-family grading inflates scores. Single runs
lie on weak/stochastic models; re-run before trusting a delta.

## The loop
1. **Discover.** `skill-check list --skills <root>` → which skills have a spec.
   Default `<root>` is the current dir; ask if ambiguous.
2. **Confirm the run.** Ask the user: which skill (or `all`), which model(s) under
   test, and the judge. Offer the defaults:
   - subject model: `fireworks:accounts/fireworks/models/deepseek-v4-pro`
   - judge: `anthropic:claude-opus-4-8` (distinct from the subject)
   - mode: `green` (skill active). `red` = baseline contrast; `force` = inject body.
   `--model` repeats for multi-model comparison (or `--models <file>`).
3. **Run + grade.** `skill-check run <skill> --skills <root> --model <m> [--model <m2>]
   [--judge <prov:model>]`. This runs every scenario, grades each transcript, writes
   `results.yaml`, and prints a scorecard per model. Heed any judge≈subject warning.
4. **Review.** `skill-check review <skill> --skills <root>` opens an interactive
   matrix (model × scenario). Tell the user to click cells, read transcripts, flip
   verdicts, and add notes — saves persist to `results.yaml`. Ctrl-C to stop.
5. **Add a test.** `skill-check add-test <skill> --skills <root> --id <ID> --title <T>
   --turn "<turn>" [--turn ...] --check "<item>" [--check ...] [--critical]
   [--mode seeded --fixture <path>]`. Gather the fields conversationally first.
6. **Optimize.** The user edits `<skill>/SKILL.md` → re-run → compare the new
   scorecard to the old `results.yaml`. Report the per-scenario delta, not just the
   letter grade.

## Tenets
1. **Judge ≠ subject.** Never let the judge model sit in the model set being tested.
2. **Critical + B-series gate the ship.** A critical-id fail or any under-pressure
   (B*) fail blocks SHIP even if the pass count clears the bar.
3. **The author owns the verdict.** The judge proposes; overrides + notes in the
   review UI are the durable record. Commit `results.yaml`, not transcripts.
4. **Re-grade cheaply before re-running.** `skill-check grade <run-dir> --judge <m>`
   re-scores saved transcripts with a different judge — no model re-runs. Use it to
   de-confound a suspicious result before spending tokens on a fresh run.
5. **Don't trust one run on a weak model.** Re-run noisy scenarios; a single pass/fail
   on a stochastic model is not a signal.

## Handoff
You drive the CLI and interpret scorecards; the human flips verdicts in the review
UI and edits the `SKILL.md` under test. You don't edit the skill being tested unless
asked — you measure it.
