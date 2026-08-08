# 93% passing, and two-thirds of the runs still don't ship

*Draft — owner edits voice. Every number below is reproducible: see the end.*

I put 7 of my own pi skills through an LLM-judged harness, three models each,
three reps per scenario. **166 committed runs.** The headline pass rate is 91–94%.

Only **7 of 21** green runs actually clear the ship bar. In force mode it is 6 of 11.

That gap is the whole point of this post. A pass rate is a number you can feel
good about. A ship bar is a number that tells you whether to ship. They disagree
most of the time, and the disagreement is not noise — it is the gates doing their
job.

## First: the skills work

Before the bad news, the thing worth knowing. On the 147 scenario cells where a
no-skill baseline and a skill-active run are genuinely comparable:

| | red (skill off) | skill on |
|---|---|---|
| pass rate | **62%** (91/147) | **93%** (137/147) |
| | 48 gained · 2 regressed · 89 kept · 8 failed either way |

Forty-eight cells the model failed without the skill and passed with it. Two it
got *worse* at. That is a real effect, and it is the number I would want before
trusting any of the rest.

`plan` is the clearest single case: **36% → 89%**, aggregated across all three
models. The skill is doing almost all the work there.

**Twelve cells were excluded, not counted.** They are `system_prompt_file`
scenarios — the harness runs an agent-file scenario as *its own system prompt*, so
red and green are byte-identical and any "lift" there is the skill on both sides.
Counting them would have credited the baseline with passes the skill produced.
Zero cells were excluded for aggregation mismatch, because every run in this corpus
is `--reps 3` — a one-draw baseline against a majority-of-three is the other way
these comparisons go quietly wrong.

## Now the gap

| mode | pass rate | runs that SHIP |
|---|---|---|
| green (harness activates the skill) | 91% (201/220) | **7 / 21** |
| force (SKILL.md as system prompt) | 94% (134/142) | **6 / 11** |
| red (no skill) | 64% (102/159) | 0 / 12 |

A 94% pass rate and a 55% ship rate are the same runs. The difference is two gates
that a pass count cannot see:

- **14 critical-scenario failures** in green, 7 in force. One critical fail blocks
  the ship regardless of the count.
- **Under pressure**, the pass rate drops: 3 of 23 under-pressure cells fail in
  green, 3 of 11 in force.

Those under-pressure denominators are small — 23 and 11 cells — and I am not going
to dress up 3/11 as "27% of skills fail under pressure". What I will say is that
the failures cluster there rather than spreading evenly, and that a headline pass
rate computed across all scenarios hides exactly the scenarios you wrote to be
hard.

## The one that made me change the tool

`build`, green mode: **56% overall, and 0 of 3 under-pressure cells passing.**
Same skill in force mode: **93% overall, 2 of 3 under pressure.**

Identical skill text. The only difference is *how the skill reached the model* —
pi ≥ 0.83.0 delivers `--skill` by progressive disclosure, so the description is in
context and the body loads on demand, and per pi's own docs "models don't always
do this."

So a green run can measure a model that never read the skill, and it will look
like a plausible scorecard rather than an error. That is why the harness now
records `harness_cli_version` on every run, and why `--canary` exists: one probe
that asks the model to quote a heading from its own instructions and aborts the
wave if the skill isn't reaching it.

**Green and force are not two samples of one thing.** On identical text, green →
force took `build` A1 from 0/3 to 3/3 while dropping `plan` C2 from 3/3 to 0/3.
They are two deployments. Nothing in this post pools them, and nothing in the tool
does either.

## What the judge did

Two numbers I did not expect to be able to report.

**Zero unresolved judge misfires in the committed corpus.** The harness flags a
cell where the overall verdict contradicts the judge's own per-item grades, and a
flagged cell blocks the ship until a human resolves it. Across all 166 runs, that
count is zero — not because the judge never misfired, but because every misfire
was resolved before the results were committed. The quarantine worked as a
process, not just as a feature.

**Five author overrides.** Five cells across the whole corpus where I disagreed
with the judge and said so in writing. The judge proposes; the note is the durable
record.

And separately measured: re-judging saved transcripts holds the model constant, so
any movement is the judge. Ours disagreed with itself in **1 of 57 judgments
(~2%)** — and the one that mattered was a published FAIL that turned out to be a
1-in-7 minority draw, the difference between a skill reading 93% and 100%.

## What this is not

Being explicit, because the honest version is less impressive than the version I
could have written.

- **These are my own skills, not a survey of popular ones.** A corpus survey found
  that "popular *and* pi-native *and* testable" does not currently exist as a set:
  pi ships no skills of its own, and the two corpora its docs recommend are either
  source-available with no SPDX license or are tool-wrappers needing live
  credentials. So this is 7 skills I wrote, graded by a harness I wrote. Take the
  *method* seriously and the *ranking* not at all.
- **One judge, one family.** `claude-code:claude-opus-4-8` graded everything.
  Judge ≠ subject holds (the subjects are DeepSeek, GLM and Kimi), but a
  second judge family would be a better experiment.
- **Three models, all Fireworks-hosted.** No Claude or GPT subject runs here.
- **The under-pressure numbers are small-n.** See above.
- **`debug`, `decide` and `git-ops` have no red baseline**, so they contribute to
  the pass rates and not to the lift. Two of those three sit at 100% green, which
  flatters the pass-rate column and contributes nothing to the 62% → 93%.

## Reproduce it

Every number above comes from two scripts over a public corpus, and both are free
to run — they read committed YAML and spend nothing:

```bash
git clone https://github.com/mojomanyana/principal-pi-skills
git clone https://github.com/mojomanyana/skill-harness && cd skill-harness
npm install && npm run build

node scripts/corpus-findings.mjs ../principal-pi-skills   # pass / ship / pressure / critical
node scripts/corpus-lift.mjs     ../principal-pi-skills   # red-vs-skill lift
```

The lift script deliberately calls the harness's own `collectLift` rather than
diffing verdicts itself. My first attempt *did* hand-roll it, and produced a
comparison across mismatched scenario sets — 159 baseline cells against 115
skill-side cells — which would have shipped a wrong number in a confident table.
The exclusions are the hard part, and they are the part a naive diff skips.

If you point these at your own corpus and the ship rate is much closer to your
pass rate, I would genuinely like to know: either your gates are calibrated better
than mine, or they are not gating.
