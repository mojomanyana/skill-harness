---
title: "My skill-value metric was quietly comparing a run against itself"
status: draft
audience: pi Discussions / X thread
feature: lift mode-insensitive exclusion, fixed 2026-08-05
---

# My skill-value metric was quietly comparing a run against itself

Last week I shipped **lift**: run your scenarios with the skill switched off,
compare against the run with it on, and you find out whether the skill did
anything or whether the model would have passed regardless. The pitch was that a
grade without a baseline measures *model plus skill*, and those are different
things.

The metric had a hole in it. On some scenarios, the baseline was not a baseline —
it was the same run, with the skill loaded on both sides.

## The mechanism

`skill-harness` runs scenarios through `pi`, and the run mode picks the
skill-activation flags:

| mode | flags |
|---|---|
| `green` | `--skill <dir>` |
| `red` | `--no-skills` |
| `force` | `--no-skills --append-system-prompt <SKILL.md>` |

Straightforward. But a scenario can also declare `system_prompt_file`, for
testing a skill that doubles as a subagent definition — the file *is* the system
prompt, so it gets passed with `--no-skills` to stop the skill loading twice.
Here is the adapter:

```ts
// An agent-file run IS the system prompt: no skill activation, whatever the mode.
const flags = req.systemPromptFile
  ? ["--no-skills", "--append-system-prompt", readFileSync(req.systemPromptFile, "utf8")]
  : skillFlags(req.mode, req.skillDir);
```

Read the comment again: **whatever the mode**. For those scenarios `red` and
`green` produce byte-identical invocations. The skill is in the system prompt both
times.

## Why that understates the thing it measures

`computeLift` compares the two runs scenario by scenario and buckets each into
`gained` (fail → pass), `regressed` (pass → fail), `kept` (pass both ways) or
`both-fail`. `kept` means *the model never needed the skill here* — it's the
bucket that stops lift from being a number that only goes up.

A mode-insensitive scenario lands in `kept` and looks like evidence against the
skill. It is the opposite: the skill was loaded on the red side and produced that
pass. So every agent-file scenario silently moved lift **down**, and the more of
them a spec had, the more it looked like the skill wasn't pulling its weight.

In the corpus I test against, 6 of 88 scenarios are agent-file. Seven percent of a
headline number, pointing the wrong way, in the metric whose entire job is to stop
people over-claiming what their skill does.

## The fix

`computeLift` takes the ids it must not compare, drops them from `cells` before
classification, and reports them separately — the same way it already reports
scenarios only one side ran:

```
LIFT:  +3 net (3 gained, 0 regressed) · 1 inconclusive · 2 not comparable (same run in both modes)
```

Excluded, not reclassified. There is no honest bucket for "we ran the same thing
twice"; a fourth class would just be a wrong answer with a nicer label.

The ids come from the spec rather than from `results.yaml`, because lift is derived
on read — it has to work on runs recorded before anyone thought about this,
including the ones already published.

One case needed its own answer. If *every* shared scenario is mode-insensitive,
the old code said "no shared scenarios to compare", which is false: the runs share
plenty, none of it comparable. It now says which, because "not measured" and
"measured no effect" are different claims and this tool exists to keep them apart.

## What I'd take from this

The bug was not in the metric's logic — the classification is right, the
`inconclusive` handling was careful, the tests passed. It was that two correct
components disagreed about what a mode *means*, and nothing forced them to
reconcile. The adapter's own comment described the behavior accurately, in the
file where it was true.

The reason it was still an open hole when I found it: lift has barely been run.
It has had exactly one red baseline against a real model — a two-scenario test
fixture, which passed both ways and produced a correct `no measured effect`.
Neither scenario used `system_prompt_file`, so the bug sat one spec feature away
from the only place the metric had ever pointed. In the skills repo I actually
care about, all 82 committed results are `mode: green`: no red baseline at all,
so no lift, so nothing to be wrong about yet.

Which is its own lesson, and a less comfortable one than the fix. A feature with
tests, docs and a post announcing it is not a feature that has been *used* — and
"the tests pass" says nothing about the paths the tests were never pointed at.
