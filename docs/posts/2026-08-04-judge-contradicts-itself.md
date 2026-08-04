---
title: "Your LLM judge contradicts itself, and you'd never know"
status: draft
audience: long-form post / HN / r/LocalLLaMA
feature: verdict-parser fix + JUDGE-AMBIGUOUS + misfire quarantine + empty→ERROR (0.2.0)
roadmap: Sprint 2.3 "judge-reliability essay" — this is the draft for it
---

# Your LLM judge contradicts itself, and you'd never know

If you grade agent behavior with an LLM judge, you are running a measuring
instrument you have never calibrated. Here are four ways ours was quietly wrong,
all found and fixed in one release, all of which would have looked like clean
data.

## 1. The judge said PASS and FAIL in the same breath

Ask a judge to grade a checklist and emit a verdict, and sometimes it emits
*two* — reasoning aloud to `VERDICT: FAIL`, reconsidering, and closing with
`VERDICT: PASS`. Or the reverse.

The naive parser takes the first match. The slightly-less-naive one takes the
last. Both are inventing a grade the judge did not give, and both are
deterministic about it, so you will never see a warning — just a number.

Now every `VERDICT:` block in the output is read. If they agree, fine. If they
disagree, the result is `JUDGE-AMBIGUOUS`, which is never a pass, carries both
verdicts in its reason, and marks the scenario for a re-judge. The judge failed
to have an opinion; that is a fact about the run, and it belongs in the output.

## 2. The reason was a sentence from the middle of the judge's thinking

A subtler one. The reason field was extracted by pattern, and any prose
containing the word "reason" could win — so the recorded justification for a
verdict was sometimes a line of the judge's reasoning rather than its actual
`REASON:` conclusion.

This is the worst class of bug in an eval tool, because the verdict stays
correct. You review a FAIL, read a plausible-but-wrong explanation of it, and
either trust it (and fix the wrong thing in your `SKILL.md`) or override it (and
now your audit trail records a human disagreeing with a sentence the judge never
offered as its conclusion). The data looks fine. Only the meaning is broken.

## 3. A FAIL whose own reason said everything passed

The flagship tripwire: the verdict is cross-checked against the judge's own
per-item grades. If every item is marked pass and the overall verdict is FAIL,
that is not a judgment, it's a **misfire**.

Misfires are not silently corrected — correcting them would mean guessing which
half the judge meant. They're quarantined: excluded from both the numerator and
the denominator of the score, and they **block SHIP** until a human re-judges or
overrides with a written note. An unreliable measurement is not a bad score; it
is the absence of a score, and the two must not be averaged together.

Getting the sensitivity right took a revision. An earlier version fired on terse
genuine FAILs, so it now demands an explicitly *total* claim ("all items pass",
"every item satisfied") with no negation anywhere in the reason. A tripwire that
cries wolf gets disabled, which is worse than not having it.

## 4. The judge confidently graded an empty transcript

A harness timeout leaves a well-formed transcript with a blank assistant turn.
Send that to a judge and it does not error — it reads an empty reply, notes that
the agent did nothing the checklist asked for, and returns a confident,
well-reasoned FAIL about behavior that never happened. We lost two scenarios to
this in one round before spotting it.

A blank assistant turn is now detected before grading. It retries once, and if
it's still empty the scenario is an `ERROR` — never a judged FAIL. An `ERROR`
means "we failed to measure this", which is true, and is different from "the
agent failed", which is a claim about the agent.

## The pattern

Every one of these produced plausible output. None threw. None looked like a
bug from the outside — the scores were numbers, the reasons were prose, the
report rendered. That is what makes judge reliability different from ordinary
correctness work: **the failure mode of an eval tool is confident wrongness**,
and confident wrongness is invisible unless you build something that
specifically hunts for it.

So the rule we ended up with: never let the tool report a number it cannot
defend. An unparseable verdict is an ERROR. A self-contradicting verdict is
AMBIGUOUS. A verdict contradicted by its own item grades is suspect and blocks
the ship gate. A missing measurement is missing, not zero.

You should assume your own judge is doing at least one of these right now.

<!-- Owner notes:
     - ROADMAP Sprint 2.3 wants "real numbers from our runs" in this essay. The
       528 rep-executions of release-1 are the obvious source: pull the actual
       misfire/ambiguous/ERROR counts out of those journals before publishing,
       and lead with the rate. Without numbers this is an argument; with them
       it's a finding (rule 3).
     - Consider pairing with a screenshot of the misfire queue in the review UI.
-->
