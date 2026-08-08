# The bug you already found, as a test you keep

*Draft — owner edits voice.*

The most valuable regression test you will ever write is one you have already
lived through. You asked the agent something, it did the wrong thing, you
noticed. That is the whole expensive part of testing — *finding* the failure.
What usually happens next is that you fix the skill, the conversation scrolls
away, and nothing stops the failure coming back.

`skill-harness` adds one command to close that gap:

```
/skill-harness capture
```

It turns the conversation you are currently in into a regression scenario.

## What it actually does

It reads the active branch of your session, groups it into logical turns, and
asks you to pick a contiguous range. Then it asks four questions:

- which instructions were responsible — your `SKILL.md`, or a subagent prompt;
- was this a **failure** or a **good example** worth keeping working;
- in your own words, what *should* it have done;
- and it opens an editor on a draft checklist derived from that answer.

Then it shows you the entire case — every field, exactly as it will land on disk
— and only then offers to save it. You can save it as a pending capture, promote
it straight into `specification.yaml`, or cancel and write nothing.

It makes **zero model calls**. The checklist draft is a sentence splitter, not a
model. The only thing that can spend tokens is the optional "run just this
scenario now?" at the very end, and it names the cost before it asks.

## Three decisions worth explaining

**A pending capture is not in your spec.** It lives in
`<skill>/tests/captures/`, not `specification.yaml`. The tempting alternative —
a `draft: true` flag on a normal scenario — means every runner, scorer, linter,
staleness check, lift computation and stability walker has to remember to honor
it. That only has to be forgotten once, in either direction: an unfinished draft
silently dragging down a ship grade, or a real scenario silently dropped from a
release run. So an unpromoted capture is simply not a test yet, and nothing has
to know about it.

**The assistant's reply is evidence, never an oracle.** The captured case stores
only your *user* turns — the stimulus, the part that can actually be replayed —
plus the expectation you wrote. What the model said last time goes into a
git-ignored sidecar for your review and never into the committed file. Snapshot
-testing agent prose produces a test that fails on rewording and passes on
regression, which is precisely backwards.

**The tool does not guess what was responsible.** It offers candidates and makes
you choose. A session records what was *loaded*, not what *caused* the behavior,
and a confident wrong attribution is worse than a question.

## The part that took the most care

A capture gets committed. So the thing it must never do is write your secrets
into your repo.

Hidden thinking is dropped unconditionally — and pi puts it in three separate
places, so that is three explicit filters, not one convenient field read. Tool
*results* are never persisted at all: only the tool name, whether it errored, a
byte count and a hash. That is not squeamishness — a failing `read` returns
`ENOENT: ... access '/home/you/…'`, so result bodies leak absolute paths even
when the arguments were relative. Home directories become `~`. Bearer tokens,
API keys, JWTs, and private-key blocks are redacted by shape, and any argument
under a name like `password` or `api_key` is dropped whatever it contains.

And the session path itself is hashed rather than stored, because an absolute
path names a machine and a person as surely as a token names an account.

None of that is trustworthy because it is written down. It is trustworthy
because you can see it: the preview step is not a courtesy, it is the control.

## One bug this found on the way in

The promotion path takes a hash of your spec before appending, so a capture
cannot clobber an edit someone else made meanwhile. The first version took that
hash immediately before writing — which makes the check meaningless, since the
window it guards is the several minutes you spend choosing turns and writing a
checklist, not the microseconds around the write.

A test that edited the spec during turn selection caught it. The baseline is now
taken before the first question.

## Trying it

```
/skill-harness capture
```

Or from the CLI, if you already know the scenario you want:

```
skill-harness add-test <skill> --skills <root> --id R1 --title "…" --turn "…" --check "…"
```

Both paths now go through the same validated, atomic writer, so they cannot
disagree about what a legal spec write is.
