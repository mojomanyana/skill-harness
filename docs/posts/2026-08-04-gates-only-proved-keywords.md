---
title: "Our objective gates only proved keywords — so the judge graded the model's self-description"
status: draft
audience: long-form post / HN / r/LocalLLaMA
feature: staged diff shown to the judge + saved as a run artifact (item 2)
roadmap: Phase 1 — measurement integrity for the "seeded objective gates" differentiator
---

# Our objective gates only proved keywords

The pitch for seeded scenarios is that they escape the judge. You give the model
a real git repo, let it edit the code, and then check something *objective*: did
the staged diff contain what it should, do the tests pass? No LLM opinion
involved. That is the part of the harness I would have defended hardest.

It was measuring less than I thought, and one of our own judges told us so before
we noticed.

## The number

Release 1, scenario `build` A1: *"add a `withdraw` method, reject overdrawing."*
Six reps across two models. Every single one of them:

```
diff_contains "withdraw": OK
diff_contains "expect(":  OK
vitest run: PASS
```

Identical objective results, six for six. The verdicts were not identical. They
split — and they split on **wording**:

- DeepSeek rep2 wrote *"Throws `Insufficient funds` if the withdrawal exceeds the
  balance"* → **PASS**
- DeepSeek rep0 and rep1 wrote *"subtracts `amount` from `balance`"* → **FAIL**

Same gates, same green tests, opposite grades. The checklist item was *"rejects
an overdraft"*, and nothing in the transcript could answer that question, so the
judge answered a different one: did the model *say* it rejects overdrafts?

One judge diagnosed the instrument directly, in its own reason field:

> No observable evidence overdraft is tested or rejected; gates only prove
> keywords.

That is the finding. `diff_contains "withdraw"` proves the string `withdraw`
appears somewhere in the diff. It cannot distinguish a correct implementation
from a stub with a good name. `vitest: true` runs *the model's own tests* — a
model that writes a weak test and passes it gets a green check. Neither gate has
any opinion about behavior, which is fine, because that was never the claim. The
bug was what happened next.

## The actual defect: we computed the diff and threw it away

`runSeeded` staged the workspace, computed `git diff --cached`, tested it against
the needles, appended `diff_contains "x": OK` lines to the transcript — and
dropped the diff on the floor. The transcript that went to the judge held the
model's prose, a handful of OK/MISSING lines, and vitest output. Never the code.

So on every seeded scenario, for every checklist item about what the code *does*,
the judge was grading a self-report. We had built the elaborate apparatus —
isolated git workspace, real fixture, staged diff, test run — and then shown the
judge everything except the thing the apparatus produced.

Worse, it was unauditable. The workspace is torn down after each rep. Those six
verdicts could not be re-examined afterwards, because the code they were
disagreeing about no longer existed anywhere. We could re-judge the transcripts
all day and never do better than the transcripts allowed.

## The fix is boring, which is the point

Two changes, no new concepts:

**Save the diff.** Every seeded rep now writes
`<id>.<mode>[.rep<k>].diff.txt` beside its transcript — uncapped, for every rep,
whether the gates passed or failed (a gate failure is exactly when you want to
read the code). It is gitignored like transcripts, and un-gitignored by the same
mechanism that preserves evidence when you record an override, because on a
seeded scenario the diff *is* the evidence your override rests on.

**Show it to the judge.** The transcript now ends with a `=== STAGED DIFF ===`
section, and the seeded judge prompt says what to do with it: grade what the diff
shows the code does, not what the prose claims; the gate lines above are keyword
checks and do not establish that the required behavior exists.

Two details that matter more than they look:

- The copy in the transcript is **capped** (64 KB, tunable). An unbounded diff — a
  regenerated lockfile, a fixture-wide refactor — could overflow the judge's
  context and turn a gradeable run into an ERROR.
- The truncation is **marked**, and the marker explicitly tells the judge not to
  infer that cut-off code is missing. A silently truncated diff would manufacture
  exactly the false FAIL this whole change exists to remove. The full diff is
  always on disk.

Inline scenarios have no diff, so their judge prompt is byte-identical to before.
That is deliberate: every inline verdict already published stays comparable with
new ones. There is a test asserting the exact prompt string, because "we only
changed it a little" is how a benchmark quietly stops being a benchmark.

## What this cost us

Every seeded verdict measured before this change was graded without the judge
seeing the code. They are not *wrong*, exactly — the gates did pass — but they
carry less information than their PASS/FAIL implies, and the A1 cells above are
the proof: the spread is phrasing, not behavior.

You cannot fix that by re-grading, either. The saved transcripts don't contain
the diff, so re-judging them reproduces the same blind spot at a lower price. It
needs a re-run.

That is an annoying thing to write in a release note. It is a much better thing
than continuing to publish a number whose disagreements were about adjectives.

## The generalizable version

If you have an "objective gate" in an eval harness, ask what it actually proves.
Ours proved that a string appeared and that the model's own tests were green.
Both true, both useful, neither one evidence of behavior.

And then ask the sharper question, which is the one that caught us: **does the
artifact your gate examined ever reach your judge?** If you compute something
rigorous and then grade a summary of it, you have paid for rigor and shipped
vibes. The gate result and the gate's *input* are different pieces of evidence,
and the expensive one was the one we were throwing away.

---

*(TODO for the owner: re-run `build` A1 across both models post-change and put the
new verdict spread next to the old one. If the split collapses, that number is the
headline and should move to the top of the post.)*
