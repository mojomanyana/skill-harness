---
title: "My staleness gate worked, and that was the problem"
status: draft
audience: pi Discussions / X thread / HN candidate
feature: stimulus/rubric/policy/gates split + regate + downgrade tripwire (0.4.0)
---

# My staleness gate worked, and that was the problem

Two releases ago I shipped a staleness gate for graded skill results. Every run records
a sha256 of everything it measured — the skill text, the scenario definition, the fixture
tree — and `lint` compares those against the current sources. Edit a checklist item and
your published `A (100%) SHIP` scorecard is correctly reported as describing inputs that
no longer exist.

It worked. Then it produced this:

| branch | change | new information about the models | what the gate demanded |
|---|---|---|---|
| `fix-c2-needle` | one needle: `["spike"]` → `["localhost:8080"]` | **zero** — 9 saved diffs already answer it | full re-run × 3 models = **81 rep-executions** |
| `review-s6-decidable` | checklist rewrite, turns untouched | **zero** — 18/18 saved judgments agree | re-run on one model = **54 rep-executions** |

135 rep-executions to restore freshness while learning nothing. Both branches sat parked
for days, because the honest options were "spend that" or "publish a scorecard the gate
says is stale". A gate strict enough to be worth having had become expensive enough to
route around — and routing around it means leaving a rubric you *know* is bad in place.

## The actual defect

One key:

```
scenario:A1 → sha256(id, title, critical, mode, turns, checklist, fixture, assert, …)
```

Everything about a scenario in a single hash. So lint had exactly one remedy for any
drift — "re-run before publishing" — because it genuinely could not tell whether the
turns had changed (transcripts invalid, re-run required) or a checklist word had
(transcripts perfectly fine).

The information was there. The digest threw it away.

## The split

Four digests, each mapped to the cheapest tool that can honestly restore freshness:

| key | contents | drift means | remedy | cost |
|---|---|---|---|---|
| `stimulus:<id>` | mode, turns, workspace, fixture path, `assert.vitest` | transcripts answer a different question | `run` | model + judge |
| `rubric:<id>` | title, checklist | transcripts fine, verdicts wrong | `grade` | judge only |
| `policy:<id>` | critical, reps, pass_threshold | only the scoring moved | `rescore` | free |
| `gates:<id>` | `diff_contains`, `diff_excludes` | needle wrong, behavior fine | `regate` | free + judge on flip |

And the lint message names it, because the message is the feature:

```
✗ review/S6: stale — the rubric for `S6` changed since the newest pi-kimi-k3 run
  — re-grade from the saved transcripts (`grade <run-dir>`) — judge-only, no model spend
```

Nothing about the gate's strictness changed. Every edit still marks something stale.
What changed is that three of the four ways back are now free.

## `regate`, or: the artifact was already on disk

`diff_contains` and `diff_excludes` are pure functions of the staged diff. Since an
earlier fix, every seeded rep *persists* its diff as a run artifact. So a wrong needle
never needed a re-run at all — the evidence was sitting in the run directory the whole
time.

The interesting part is the four-way case analysis per rep, because only one case costs
anything:

- gate still fails → `FAIL`, corrected reason. Free.
- gate now fails where it passed → `FAIL`, no judge call. The gate is objective; it says
  no; the judge's opinion is irrelevant.
- gate passed before and still passes → **re-read the rep's saved judge output** and
  re-parse it. Free, and exact — it does not re-ask a question that has an answer on disk.
- gate blocked the rep before and now passes → judge it now. One call, because a
  gate-blocked rep is an auto-FAIL that never reached the judge, so no judgement of it
  exists anywhere.

That third case is what keeps this cheap without guessing. My first sketch re-judged
every rep of a regated scenario; the judge-raw artifacts make that unnecessary.

Measured on the C2 needle fix: **9 judge calls instead of 81 rep-executions.** And the
command prints the judge-call count, because "free" is a claim, and a claim that spends
silently is a lie.

Limits, stated rather than papered over: `assert.vitest` and `assert.post_test` need the
workspace and cannot be re-evaluated from any artifact, so a scenario carrying either
gets refused, not half-regated. And the diff artifacts are gitignored, so this works
wherever the run dirs live — which is exactly where you are when you need it.

## The bit I was least comfortable with

`regate` regenerates the `=== SEEDED GATES ===` trailer inside a saved transcript. That
felt wrong until I could say precisely why it isn't: the trailer is *harness-generated
annotation*, appended after the model's turns. Regenerating it corrects my own note about
the model's work, not the work. The model's output and the embedded diff are copied
through byte-for-byte.

I still keep the old file as `….pre-regate.txt`. Not because the argument is weak, but
because an audit trail shouldn't require the auditor to accept my argument.

## One more, since it is the same shape

A stale global install of this tool nearly graded a whole corpus. A **0.1.0** binary,
weeks old, would have run the re-measurement instructions verbatim and spent ~102
rep-executions grading *without showing the judge the diff* — the exact defect being
re-measured. Every number would have looked reasonable. `--version` didn't exist, the run
banner didn't say, and `results.yaml` recorded only `schema: 2` — which is the wrong
sentinel, since one release kept `schema: 2` while changing what a verdict *means*.

Every `results.yaml` now records `harness_version`, and `run` **refuses** when the tree
holds records from a newer harness than the one running. `grade` and `lint` warn instead
of refusing, because they are how you diagnose the situation and blocking the diagnosis
is a bad trade.

## What I'd take from this

The thing I got wrong was not the gate. It was assuming that "correct" was the whole job.
A check that reports a real problem, and whose only suggested fix costs more than the
problem, gets disabled — if not in the code then in the user's head. **The remedy is part
of the check.**

Corollary, which is the part I'd bet is generalisable: before making a check cheaper to
satisfy, look at what you already store. Three of these four remedies were possible only
because a previous fix had persisted an artifact "for auditability" and nothing had ever
read it back.
