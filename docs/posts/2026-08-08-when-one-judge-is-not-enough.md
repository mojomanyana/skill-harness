# When one judge is not enough

*Draft — owner edits voice.*

We measured our own judge last year. Re-judging saved transcripts holds the model
constant, so any movement is the judge — and across 57 judgments of the same 12
rep-cells, it disagreed with itself **once**. About 2%.

Two percent sounds like noise you can ignore. It isn't, and the reason is where
that 2% lands. One of those disagreements was `git-ops` A9: a published FAIL that
turned out to be a 1-in-7 minority judge draw. It was the difference between that
skill reading **93%** and **100%**.

The practice that follows is obvious once you've seen it: *judge a non-unanimous
cell twice before publishing.* 0.11.0 makes that mechanical.

```bash
skill-harness grade <run-dir> --auto-rejudge \
  --secondary-judge claude-code:claude-opus-4-8 \
  --tie-break-judge claude-code:claude-opus-4-8
```

## Which cells get asked again

Four triggers, computed from the **complete** first wave — never incrementally,
because the fourth one can't be known until every other cell's verdict is in:

- **`ambiguous`** — the judge's verdict blocks disagree, or nothing parseable came back.
- **`contradictory`** — the overall verdict disagrees with the AND of its own per-item grades. This is the misfire quarantine, now with something to *do* about it.
- **`non_unanimous`** — the reps split. PASS twice and FAIL once is not a settled result.
- **`ship_deciding`** — flipping this one cell would change SHIP to NOT READY, or back.

That last one is a counterfactual against the **real scorer**, not a
reimplementation of the ship rules. min-pass, critical and B-series all move the
answer, and a second copy of that logic is a copy that drifts.

## Nothing spends without you saying so

Adjudication is off by default. A spec may declare triggers; **spec configuration
alone never authorizes a judge call.** The only switch is `--auto-rejudge`, and
there is a test whose whole job is asserting that a misfired cell costs exactly
zero extra calls without it.

When it is on, the preflight prints the ceiling before the first extra call:

```
adjudication: 1 cell(s) triggered — up to 1 additional judge call(s)
  secondary judge: claude-code:claude-opus-4-8
  no tie-break judge — a disagreement stays unresolved and blocks SHIP
  A4: contradictory
```

**That's a call count, not a dollar figure — on purpose.** The default judge runs
on a Claude subscription and reports no per-call usage back to the harness. A
dollar estimate there would be invented, and this tool's whole argument is that
invented numbers are worse than absent ones. Count is the only honest unit. (For
what it's worth on a metered judge: measured against our real corpus, a judge call
averages ~760 input and ~130 output tokens, so ~$0.008 at Opus rates. The whole
674-cell corpus, worst case, is about $11.)

Every configured judge passes the same two gates the primary does — the metered
refusal and judge≠subject. A feature that multiplies judge calls is the last place
to let one slip past the policy that exists because a default once billed a corpus
by accident.

## Three ways it can end, and only one is silence

- **confirmed** — two clean votes agree. Suspect cleared.
- **tie_broken** — a clean two-of-three majority. Suspect cleared.
- **unresolved** — anything else. `suspect: true`, which **blocks SHIP**.

`unresolved` reuses the existing suspect gate rather than adding a second ship
rule. Two rules can drift apart; one cannot. And a disagreement that quietly
became a PASS is precisely the failure this feature exists to prevent.

**A malformed answer is not a vote.** Ambiguous, suspect and unreadable judgments
are recorded in full and never counted. This has a consequence worth stating
plainly: when the *first* wave misfired, judgment 1 isn't a clean vote either — so
a contradictory cell needs **two** fresh judgments to agree on anything. A misfire
cannot confirm itself. That fell out of the rule rather than being designed, and it
is the right answer.

Every judgment is kept verbatim on the result, whatever the collapse decided. An
author resolving an unresolved cell needs to see what each judge actually said, not
the tidy summary. And a **human override survives adjudication untouched** — a
judge panel does not outvote the author.

## What it does not do

It does not selectively rejudge the rep that would change the headline. A
multi-rep cell is adjudicated on its first rep's transcript under one documented
policy. Picking the convenient rep is how a "second opinion" becomes a way to get
the answer you wanted, which would make the feature worse than not having it.

It caps at **three** judgments per cell. Not configurable. If three judges can't
agree, the honest output is "unresolved, a human should look" — not a fourth
opinion until one side wins.

And it re-judges saved transcripts only. No subject re-run, so the model is held
fixed and any movement is the judge. That's what makes this a measurement of judge
reliability rather than another sample of the model.
