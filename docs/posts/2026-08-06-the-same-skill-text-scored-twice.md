---
title: "My harness upgraded itself and quietly started measuring nothing"
status: draft
audience: pi Discussions / X thread / HN candidate
feature: force mode is scored + delivery tripwire + harness_cli_version + --canary (0.5.0)
---

# My harness upgraded itself and quietly started measuring nothing

A skill scored 7/14. Which is exactly what that skill's model scores with **no skill at
all**.

That number sat in a committed scorecard, looking like a regression to investigate. It
wasn't a regression. The skill had never reached the model. Two full measurement waves —
every scenario, every rep, every judge call — measured a naked model and reported it as a
result.

Here is what it took to notice, what actually happened, and the three things I changed so
that a harness which stops delivering a skill has to say so.

## The tell was a contradiction, not a number

The failing scenarios didn't fit together. The skill in question is an architecture
skill; it failed simultaneously on:

- **over-ceremony** — producing heavyweight process where the task was small;
- **capitulation** — folding immediately when the user pushed back.

No single edit to a skill produces both at once. Those failures are pulled by opposite
governors: the part of the text that says "don't over-build" and the part that says "hold
the line". A skill that got worse moves one of them. A skill that isn't there moves both,
because what you are looking at is the base model.

The confirming evidence was cheaper than any re-run: the passing transcripts had **no
skill voice**. An earlier release's transcript for the same scenario quotes the skill's
own tenets almost verbatim. The new one is generic tables. Same scenario, same model,
same prompt — and no trace of the instructions that were supposedly in front of it.

## What actually happened

The harness under this is `pi`, driven with `--skill <dir>`. It was upgraded 0.80.x →
0.83.0 mid-corpus.

- **0.80.x** delivered `--skill` by *wrapping the prompt with the skill body*. The
  instructions were unconditionally in context.
- **0.83.0** delivers it by *progressive disclosure*: the skill's **description** is in
  context, and the full instructions load **on demand**. pi's own docs say the quiet
  part out loud — "models don't always do this."

Nothing failed. No flag was rejected, no warning printed, no exit code changed. The mode
kept its name and lost its meaning.

And while establishing that, I found the sharper edge of the same class:

```
$ pi --skill /nonexistent/skilldir --provider … -p "hi"
(a completely normal answer)
$ echo $?
0
```

A path that doesn't exist is accepted silently. Which means a typo, or a relative path
resolved in a child process's different cwd — my own `discover()` was handing out
`join(root, name)`, relative whenever you passed `--skills .` — degrades a measurement
run into a baseline run with no signal at all.

## Delivery has to be verifiable, or it isn't a measurement

I had been treating "the skill was in front of the model" as an axiom of the run. It's a
claim, and it belongs on the record like every other claim. Three changes:

**1. The adapter refuses what pi swallows.** Before exec, stat the skill dir and its
`SKILL.md`, resolve the path to absolute, and fail loudly if it isn't there. Free,
deterministic, and it kills the entire typo/relative-path half of the class:

```
mode=green needs a skill directory with a SKILL.md, but /home/me/skills/architect has
none — pi accepts `--skill <nonexistent>` silently (exit 0, a normal answer, no skill in
context), so this run would measure a model with no skill and report it as a result.
```

**2. Every run records the harness CLI's version.** `results.yaml` already carried
`harness_version` (the tool). It now also carries `harness_cli_version` — `pi --version`,
asked once per run. The reason this incident was so hard to bound afterwards is that
*nothing on the artifacts said which pi produced them*. One line of code; it makes the
question answerable forever. It is written by `run` only: a later `grade` or `rescore`
re-decides verdicts, it doesn't re-deliver a skill, so stamping today's version onto old
transcripts would be a lie of exactly the kind this field exists to prevent.

**3. `--canary`: one probe, before the wave.** Optional, green-only, one extra model call.
The model is asked to list the `## ` headings inside its own loaded instructions. The
probe anchors on the **longest** heading — never on anything in the frontmatter, because
the description is always in context under progressive disclosure and a check that the
description arrived proves nothing. Miss, and the run aborts before spending anything
else:

```
delivery canary FAILED for architect: the model could not quote its own skill
instructions (looked for the heading `Refuse a metered judge, whatever chose it`).
  The skill is not reaching the model, so every scenario in this run would measure a
  naked model and score like a result. Nothing has been spent beyond this one probe.
  harness CLI: 0.83.0. On pi ≥ 0.83.0 `--skill` is progressive disclosure …
```

Two waves of garbage, or one rep. That is the whole argument for it.

Be honest about its limit, though: a passing canary proves the body is **reachable**. It
cannot prove the model chose to load it on every later turn, because under progressive
disclosure that is the model's choice, not the harness's. Which leads to the part I
didn't expect to be writing.

## The mode that can't degrade — and the epoch it creates

`--append-system-prompt` — put `SKILL.md` in the system prompt — has never been
conditional in any pi version. It isn't subject to disclosure, and it isn't subject to
pi's project-trust gate either. My harness had it as `--mode force`, framed as an escape
hatch "when auto-activation isn't available".

It is not an escape hatch. For a corpus whose scorecards are published, it is the
deployment: the one delivery whose meaning a dependency upgrade cannot change.

So force is now a **scored mode**, alongside green. Red — no skill — stays the unscored
control. That sounds like a one-line policy change, and the code was roughly that: the
"is this run scored?" ternary had been open-coded in seven places, which is precisely how
force came to be unscored in all seven at once. It's now one predicate.

But it is not a cosmetic change, because **placement moves verdicts**. On *identical
skill text*, moving from green to force:

| scenario | green | force | what it measures |
|---|---|---|---|
| `build` A1 | 0/3 | **3/3** | a discipline scenario — do the required step |
| `plan` C2 | 3/3 | **0/3** | a right-sizing scenario — don't over-build |

Both directions, at once, from the same words. Stronger adherence makes a skill better at
the things it insists on and worse at the governors that tell it when to stop. A skill
that reads as balanced when it arrives as a suggestion reads as overbearing when it
arrives as a system prompt.

Which means the two modes are not two measurements of one thing. They are two
deployments, and a number from one does not transfer to the other. Consequences I had to
ship along with the scoring change:

- **trend lines never pool them.** A model tag with green history and force history gets
  two series, labelled, not one sparkline with a mysterious step in it. Drawing an epoch
  change as skill progress is the one thing a trend must not invent.
- **lift follows the newest delivery**, and says which one it measured. A red baseline is
  `--no-skills` either way, so red-vs-force is exactly as valid as red-vs-green — and a
  corpus that switched deliveries would otherwise silently lose its lift story.
- **runs recorded before this change are re-scorable for free.** Ten committed force runs
  read `effective_grade: not scored`; the rep data was always on disk. `rescore` — no
  model, no judge — writes the real grade, and `lint` names that remedy in the finding
  rather than saying "re-run" like it used to.

## What I'd take from this if I ran evals

1. **A mode's name is not its behavior.** If your harness has a "with the thing" and a
   "without the thing" mode, something must verify the thing arrived. Ours agreed to a
   nonexistent path with exit 0 for two weeks.
2. **Record the version of every layer that touches a measurement** — not just your own.
   `schema: 2` didn't change. My tool's version didn't change. The layer that changed was
   the one nobody wrote down.
3. **Contradictory failures are a signal about your harness, not your subject.** When a
   result fails in two mutually exclusive ways, stop reading it as a regression.
4. **Prefer the delivery that can't be renegotiated.** Progressive disclosure is a
   sensible product decision for an agent CLI and a terrible substrate for a measurement.
   If you can pin the thing into the system prompt, pin it.

`skill-harness` 0.5.0 is on npm. The corpus it was built for is public
([`principal-pi-skills`](https://github.com/mojomanyana/principal-pi-skills)), and it has
adopted force as its measured deployment.

One last thing worth saying plainly: the fix for a bad measurement is not deleting it. A
run that measured nothing should stay on the record, labelled, with the version that
produced it — that is the whole reason to write the version down.
