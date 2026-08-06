---
title: "flakiness 0.00 is not stability"
status: draft
audience: pi Discussions / X thread / HN candidate
feature: run-over-run verdict stability, derived on read (0.6.0)
---

# flakiness 0.00 is not stability

I run each scenario three times and record how much the reps disagreed. A scenario that
passes 3/3 gets `flakiness 0.00`, and I had been reading that as *settled*.

Then two consecutive full runs of the same skill, same model, same delivery mode produced
this:

| scenario | run of 08-05 | run of 08-06 | flakiness |
|---|---|---|---|
| `A5` | **3/3 PASS** | **0/3 FAIL** | `0.00` in **both** runs |
| `D1` | 1/3 FAIL | **3/3 PASS** | `0.00` in the second |

Six reps of A5. Unanimous twice. Opposite answers.

Nothing was flaky. Every number in every file was internally consistent. The problem is
that the number answers a different question from the one I was asking it.

## Within-run and run-over-run are different measurements

`flakiness` compares reps **inside one run**. That catches a scenario whose outcome is a
coin flip per attempt — the reps disagree, the aggregate says so, and you know not to
trust the cell.

It cannot catch a scenario whose outcome is a coin flip **per run**: something in the
setup — the sampling seed, a slightly different context, the model's mood on a boundary
case — settles early, and then all three reps go the same way. Every rep agrees. The next
run agrees with itself too, on the other side.

Those cells are exactly the interesting ones. A scenario that always passes tells you
nothing new; a scenario that always fails tells you what to fix. A scenario that lands
unanimously on either side depending on the run is sitting on a behavioural boundary — and
it is the one where a single run's `✓` is worth the least, while looking like it is worth
the most.

The evidence was always on disk. It just wasn't in any one file: run-over-run is a fact
about a **set** of runs, and every view I had — the scorecard, the results file, the
per-cell flakiness — reads one run at a time.

## Deriving it, and the two mistakes worth avoiding

The whole thing is a read over committed history: group the scored runs per skill × model
× delivery mode, take the last N, and count how often each scenario's verdict changed
between adjacent runs. No new measurement, nothing new persisted (a number about a set of
runs, cached inside one of them, is wrong the moment the next run lands).

Two things nearly made it useless.

**Mistake one: reporting edits as instability.** Half the reason to have a skills corpus
is that you *edit* the skill and re-run. If every verdict that moved across an edit counted
as a flip, the feature would report your own work back to you as noise. I already record
`source_hashes` — a digest per scenario of its stimulus, its rubric, its gates, its
fixture, plus the judge persona — so a step between two runs is only counted when those
digests match. When they don't, the step is reported *with its reason* instead of being
silently dropped:

```
D1 has no comparable run-to-run step: 1 step(s) where the scenario's own sources changed
  (../../agents/plan.md changed — an edit, not a flip)
```

That line is more useful than a flip count would have been. D1's 1/3 → 3/3 wasn't
instability at all: the agent file that scenario tests had been edited between the runs. My
first instinct — "D1 is unstable" — was wrong, and the hashes said so for free.

**Mistake two: gating on the skill text.** My first cut also required `SKILL.md` to be
identical. That would have hidden the headline finding entirely, because A5's flip happened
across a skill edit — one aimed at a *different* scenario, leaving A5's own stimulus and
rubric byte-identical.

There is no honest way to resolve that pair from the record. Either the edit had a side
effect on A5, or A5 is a boundary cell and the edit is a coincidence. So the tool says
exactly that, and stops:

```
⇄ CRITICAL A5 flipped its verdict in 1 of 1 comparable run-to-run step(s) (PASS!→FAIL!);
  each flip was between runs that were INTERNALLY UNANIMOUS (flakiness 0.00) — within-run
  reps cannot see this; SKILL.md changed across that step, while this scenario's own
  stimulus and rubric did not — so it is either a side effect of that edit or a boundary
  cell, and the record cannot say which
```

Naming both readings is the feature. A number — `volatility 1.00` — would have left the
reader precisely where one run left them.

## Three states, and the third is the one people skip

- **boundary** — flipped across a comparable step. One run of this cell is one draw.
- **stable** — held its verdict across every comparable step in the window.
- **unmeasured** — one run, or no comparable step.

That third state is load-bearing, and the temptation to collapse it into "stable" is
strong, because it makes the output tidier. It also makes it a lie: a scenario with one run
has not been *shown* to be stable. Same reason a missing baseline reports "no baseline"
rather than "no effect" — absence of evidence isn't evidence.

## It must not fail the build

The finding lands in three places: a `⇄` line under a fresh run's scorecard, a marker on
the review-matrix cell, and a `lint` note. That last one needed a new idea — severity.

A boundary cell is not a defect. The spec is fine, the fixtures are fine, the results are
fine. What's true is that one run of that cell is worth less than it looks. If `lint` turned
CI red for it, one of two things would happen: people would "fix" it by deleting the
scenario, or they would stop reading lint output. So stability findings print as `ℹ`
(`::notice` in GitHub Actions), the skill keeps its `✓`, and the exit code counts only
gate-failing findings.

The remedy isn't a code change anyway. It's `--reps` on that scenario, or an override with
a note once you have decided which side is right — and the override *stabilises the record*
honestly, because a human took responsibility for the verdict.

## The general lesson

I had a number that measured variance, and I used it as a proxy for confidence. It is a
proxy for confidence *at one scale*, and I never wrote down which scale. If you aggregate
anything — reps, samples, trials, CI runs — check what your variance number is quantified
over, and then ask what happens at the next level up. Mine had a whole level of variance
above it that nothing was watching, and the symptom was the most confident-looking output
the tool produces.

`skill-harness stability <skill> --skills <root>` — free, offline, and it works
retroactively on history any earlier version recorded. Shipped in 0.6.0.
