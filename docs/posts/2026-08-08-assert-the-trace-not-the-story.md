# Assert the trace, not the story

*Draft — owner edits voice.*

An LLM judge reading a transcript can only grade what the model *said*. If the
model says "I checked the config and left your `.env` alone", the judge has two
options: believe it, or not. Neither is evidence.

`skill-harness` adds `assert.trace` — objective assertions evaluated
against a structured record of what the model actually *did*:

```yaml
scenarios:
  - id: R1
    title: delegates authentication diagnosis
    turns:
      - "Find why authentication is failing."
    checklist:
      - explains the root cause without exposing credentials

    env:
      workspace: empty-git    # `unchanged_paths` needs a tree to observe

    assert:
      trace:
        require_calls:
          - tool: Agent
            count: { min: 1 }
            args:
              agent: plan
              task: { contains: authentication }
        forbid_calls:
          - write
        unchanged_paths:
          - ".env"
```

Selection and handoff are now facts. The checklist still grades the thing only a
judge can grade — whether the *answer* was any good.

## A failing gate costs zero judge tokens

This is the part that changes the economics. Objective assertions run **before**
the judge. A scenario that called a forbidden tool fails on the evidence, and no
judge is asked anything.

That ordering is the feature. The expensive, noisy, occasionally self-
contradicting part of the loop is the judge; anything decidable without it should
be decided without it. There is a test whose entire job is counting judge calls
and asserting zero.

And because a trace is a saved artifact, editing an assertion is re-evaluated by
`regate` — no subject-model call; it reads saved evidence. A rep that flips from gate-fail to
gate-pass costs a judge call, because that rep genuinely never had a judgement.

## Missing evidence is ERROR, never a pass

The dangerous shape in any assertion layer is the one where absence looks like
success. `forbid_calls: [write]` evaluated against an empty trace "passes" — and
it would be the most reassuring output the tool has ever produced, while proving
nothing at all.

So: a scenario declaring `assert.trace` against an adapter that cannot produce
traces is a hard error. A structured run that yields no trace is `ERROR`. A saved
trace that is missing or unreadable is `ERROR`. A result with no `objective`
field means *no assertions were declared* — never that they passed.

## What a trace does not prove

Worth being explicit, because this layer invites over-claiming.

A trace proves **a registered tool was called with given arguments**. It proves
nothing about what that tool then did to the machine. A `bash` command string is
not a filesystem audit — if you want a real path policy, forbid `bash` or assert
on observed workspace changes. Writes outside the isolated workspace are not
observable, and we never claim otherwise.

## Three things pi taught us on the way

Building this meant reading pi's JSON event stream properly for the first time,
and it corrected three assumptions we had written down as fact.

**Parallel tool calls complete out of order.** Batched calls execute
concurrently, and their completion events arrive in completion order, not issue
order — three `bash` calls sleeping 6s/1s/3s start SLOW,FAST,MID and end
FAST,MID,SLOW. `toolCallId` is the only sound correlation key. A parser pairing
the nth start with the nth end reports the wrong call as the failing one, which
is exactly the kind of bug that survives review because the output still looks
plausible.

**The event stream is quadratic.** `message_update` re-sends the entire
accumulated message on every delta. A trivial three-tool-call run emitted **52 MB**
of stdout wrapping **12 KB** of terminal events. So the JSON path streams and
discards line by line, and deliberately does *not* reuse the buffering helper the
rest of the adapter uses — that would be a memory failure mid-wave, not something
a unit test would catch.

**The transcript rule we had written down was wrong.** We had specified that a
trace carries "assistant text blocks excluding thinking". pi's print mode — what
the judge has always been shown — emits only the **final** assistant message, and
models routinely emit text *alongside* tool calls. Following our own spec would
have fed the judge interim narration the transcript has never contained, moving
verdicts on scenarios nobody edited. We caught it by running both modes on a
deterministic prompt and comparing bytes.

That last one is why the feasibility spike existed. It cost $0.0035 and three
hours, and it found a silent scoring change before any of this was built.

## Opt-in, by design

Existing scenarios do not change execution path. `runStructured` is used only by
scenarios that declare trace assertions. The transcripts are provably
byte-identical — but "provably" rests on a handful of fixtures, and that is not a
good enough reason to silently re-run a published corpus through a different code
path.

Migrate a scenario when you want the guarantee, not because a release moved.
