---
title: "Your A/B test is comparing one coin flip against best-of-three"
status: draft
audience: pi Discussions / X thread
feature: lift aggregation-mismatch exclusion, shipped 2026-08-05
---

# Your A/B test is comparing one coin flip against best-of-three

`skill-harness` has a flag for flaky judges and flaky models: `--reps 3` runs each
scenario three times and takes the majority. It also has **lift**: run the
scenarios with the skill off, compare against the run with it on, and find out
whether the skill did anything.

Use both and you can produce a number that is pure artifact.

## The setup that does it

```bash
skill-harness run my-skill --mode red                # baseline. reps defaults to 1
skill-harness run my-skill --mode green --reps 3     # the real test, majority of 3
```

Nothing here looks wrong. The baseline is cheap, so you ran it cheap — it is only
the control. The green run is the one you're going to publish, so you paid for
three reps to stop a flaky judge from picking your verdict for you.

Now lift compares them. Red `FAIL` → green `PASS` is a **gain**: the skill did
this. Except red's `FAIL` is one draw, and green's `PASS` is the best of three. For
a scenario the model passes half the time, red fails on 1 in 2 draws and green's
majority-of-3 passes on 1 in 2, so that pairing manufactures a gain a quarter of the
time — sampling alone, with the skill contributing nothing.

The asymmetry runs the other way too. A scenario the model usually passes but
occasionally muffs can land red `PASS` on a lucky single draw and green `FAIL` on a
2-of-3 minority, and lift calls it a **regression** in a skill that is fine.

Both directions were live in the shipped code. `computeLift` compared verdicts and
never looked at how either verdict was produced.

## Why this class of bug keeps happening here

This is the second hole in lift in two days. Yesterday's was scenarios the harness
ran *identically* in red and green — an agent-file scenario is its own system
prompt, so the skill was loaded on both sides, and those cells landed in `kept`,
dragging the number down. Same shape: the classification logic was right, and the
inputs were not the two things it thought it was comparing.

A comparison has an assumption its own code cannot see — *these two verdicts mean
the same kind of thing*. Verdicts are `PASS`/`FAIL` either way, so nothing at the
type level, and nothing in the tests, was ever going to object.

## The fix

Read the aggregation shape off both sides, and refuse the pair when they differ:

```ts
function aggregationShape(s: ScenarioResult): AggregationShape {
  const reps = s.reps ?? 1;
  // At one rep the single judge verdict is kept as-is and aggregateReps is never
  // called, so a pass_threshold sitting beside it was applied to nothing.
  return { reps, threshold: reps > 1 ? s.pass_threshold ?? null : null };
}

function comparableAggregation(red: AggregationShape, green: AggregationShape): boolean {
  return red.reps === green.reps && red.threshold === green.threshold;
}
```

The threshold is in there deliberately. Three reps against three reps is still not
like-for-like if one side passed at 1-of-3 and the other needed 3-of-3 — that's a
different majority policy, so it's a different measurement at the same N.

Excluded, not reclassified — the same call as yesterday. There is no honest bucket
for two verdicts that were not measured the same way, and a fourth class would be a
wrong answer with a nicer label. The headline names the count, the mismatch, and
the one command that fixes it:

```
LIFT:  +2 net (2 gained, 0 regressed) · 3 not comparable (red 1 rep vs 3 reps)
```

And when *nothing* survives — the common case, because `--reps` is a per-run flag,
so a mismatch usually hits every scenario at once:

```
LIFT:  nothing comparable (5 shared, red 1 rep vs 3 reps — re-run the baseline with --reps 3)
```

That line is the whole point. The old code would have printed a confident `+4 net`
off the same two runs.

## The bit I nearly shipped anyway

Fixing the number exposed a second lie one layer up. The review UI's per-column
badge fell through to **"no red baseline"** whenever nothing was comparable — which
is false, and the worst possible thing to tell someone whose baseline is sitting
right there at the wrong rep count. It now says `lift not comparable` and puts the
headline, remedy included, in the tooltip.

Three states, not two: not measured, measured-and-no-effect, and measured-but-not
comparably. Collapsing the third into the first sends you off to re-run the one
thing you already have.

## What I'd take from this

Both lift bugs were found by re-reading a feature I had already tested, documented
and announced — not by a failing test. A metric that compares two things has a
premise underneath it that the comparison itself cannot check, and the way you find
those is to go back and ask what each side actually is.

Also: `--reps` and lift were built weeks apart, and each is careful on its own. The
defect lived in the space between them, which is where the interesting ones usually
are.
