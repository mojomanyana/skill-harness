---
title: "Two gates that turn 'trust the judge' into 'check the code': diff_excludes and post_test"
status: draft
audience: post / thread
feature: assert.diff_excludes + assert.post_test (item 3)
roadmap: Phase 1 — measurement integrity for "seeded objective gates"
---

# Two gates that turn "trust the judge" into "check the code"

A seeded scenario in skill-harness gives a model a real git repo and grades what
it does. Until now the objective part of that grade could say two things: *this
string appears in the diff* (`diff_contains`) and *the model's own tests pass*
(`vitest`). Everything else fell to the LLM judge reading the transcript.

Two checklist items kept escaping that net, and both are now mechanical.

## 1. `diff_excludes` — proving a negative

Scope discipline is a core skill behavior: fix what was asked, flag the rest.
Our `build` A2 scenario tests it — there is an off-by-one in `sliceRange`, and
two lines away sits `lastIndex`, also subtly wrong, uncovered by tests, with no
comment excusing it. The right move is to fix `sliceRange` and *mention*
`lastIndex` as a follow-up.

You cannot express "did not do X" with a positive needle. So that checklist item
was graded entirely from the model's prose, and the judge had to infer absence
from a description. `diff_excludes: ["lastIndex"]` states it directly: the staged
diff must not touch that symbol.

### The detail that decides whether it works

The obvious implementation — `diff.includes(needle)` — is wrong, and wrong in
the direction that quietly breaks the scenario.

A unified diff carries three lines of *context* around every hunk. `lastIndex`
sits two lines from the edit site. So the moment a model correctly fixes
`sliceRange`, `lastIndex` appears in the diff text as an unchanged context line —
and a naive substring test fails the model for doing exactly the right thing.

The gate would have been worse than the prose-dependent item it replaced: not
merely noisy, but *inverted*, punishing correct behavior on the scenario built to
reward it. A test now pins this: the fixture is arranged so the forbidden symbol
is definitely in the diff as context, and the gate must still pass.

`diff_excludes` therefore matches only added and removed lines, with `+++`/`---`
file headers dropped too — otherwise a needle matching the filename trips on
every hunk of the file being fixed.

The lesson generalizes past this feature: **a negative assertion needs a much
more precise definition of its search space than a positive one.** "The diff
mentions X" and "the model changed X" are different claims, and only one of them
is scope discipline.

## 2. `post_test` — a test the model never sees

`vitest: true` runs the model's own tests. That is worth something, but notice
what it is: the model writes the test, the model passes the test, and we record
the model's verdict on the model's work. A weak test, confidently green, is
indistinguishable from a strong one.

`post_test: <path>` points at a test file *you* wrote. It is copied into the
workspace **after** the agent is finished and run on its own. The model never saw
it, cannot shape its code to satisfy it, and cannot write around it. It answers
the question the whole `build` A1 mess was about — *does `withdraw` actually
reject an overdraft?* — with no judge involved at all.

Three things that mattered in the implementation:

- **It lands after the diff is captured**, under a harness-owned filename. If the
  hidden test appeared in the staged diff it would flow into the judged
  transcript and stop being hidden. The name is ours, not the author's basename,
  so a model cannot pre-create that path to shadow the check.
- **"Failed" and "never ran" are different verdicts.** vitest exits non-zero when
  it collects no test files, which looks identical to a failing test from the
  outside. Reporting that as a FAIL would blame the model for a fixture whose
  include patterns don't reach the workspace root — the most misleading verdict
  this gate could produce. It is reported as a spec/fixture error instead.
- **A missing `post_test` file is a spec error, said out loud.** It still fails
  the scenario, because a silently skipped gate is worse than a loud one, but the
  message names the spec. `lint` also catches it for free, offline, before you
  spend a model run finding out.

One implementation bug worth recording, because the test caught it and a human
review probably would not have: the copy originally used `extname()` of the
source to build the destination name. `extname("A2.test.ts")` is `.ts`, not
`.test.ts` — so the file landed as `skill-harness.post.ts`, which vitest does not
collect as a test at all. The gate would have run, collected nothing, and needed
the "never ran" detection above to avoid reporting a phantom failure. Two
independent mistakes, one of which was covering for the other.

## Both are additive

Existing specs parse unchanged and produce byte-identical assert objects; there
is a test asserting exactly that. No migration, nothing renamed — the schema only
grew, per the project's public-API rule.

## What they replace

Nothing, strictly. The judge still reads the transcript and still grades the
checklist. But two items that used to depend on how the model *described* its
work now depend on what its work *is* — and on the scenarios where those items
live, the judge's opinion stopped being load-bearing.

That is the whole direction of travel: every checklist item you can make
mechanical is one fewer place where a rephrasing changes a grade.
