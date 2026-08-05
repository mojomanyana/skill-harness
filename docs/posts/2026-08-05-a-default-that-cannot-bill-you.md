---
title: "My tool's default judge quietly billed an API, and a stale copy of it graded a corpus"
status: draft
audience: pi Discussions / X thread
feature: subscription-default judge, SKILL_HARNESS_JUDGE, --version, harness_version provenance (0.3.3)
---

# My tool's default judge quietly billed an API, and a stale copy of it graded a corpus

Two defects, one shape. Neither is in the measurement logic; both are in what the
tool does when you don't tell it something.

## 1. The default spent money

`skill-harness` grades every transcript with an LLM judge. The judge default was
`anthropic:claude-opus-4-8` — a metered API key. Forget `--judge` and you get the
strongest available judge and a bill, and nothing on screen distinguishes "the flag
I meant to pass" from "the flag I forgot". It billed a corpus once by accident,
which is how it got noticed.

The fix is a one-line change with an argument behind it: the default is now
`claude-code:claude-opus-4-8`, which shells out to `claude -p` and authenticates
with the user's Claude subscription. Same model, same judging quality, no metered
key. The API path is still there — `--judge anthropic:claude-opus-4-8` — because an
API key has rate limits a large `--reps` run actually needs. But it is now something
you *ask for*.

The principle I'd extract: **a default may not be able to spend money.** If the
convenient path costs, make the costing path explicit and leave the default on the
account the user already pays for.

There's a second layer, because the real user of this tool steers rather than types.
`SKILL_HARNESS_JUDGE` now sets judge policy once — per repo, per shell — so the
answer to "which judge" lives in configuration instead of in the muscle memory of
whoever typed the last command. `--judge` still beats it. And the judge default was
duplicated in three places (CLI, extension runner, extension commands), so two of
them could have disagreed about which provider your missing flag bills; it now
resolves in one function.

## 2. A stale copy of the tool graded a corpus, plausibly

This one is worse, and it was a near-miss rather than a hit. The corpus owner's
global `skill-harness` was a **0.1.0** install — from the first publish, weeks
stale. Running the current re-measurement instructions verbatim through it would
have spent ~102 rep-executions grading *without showing the judge the diff*, which
is the exact defect the re-measurement exists to correct. Every number would have
looked entirely reasonable. It also emitted 38 spurious `consistency` findings
against partial runs, which 0.3.x does not.

Nothing in the tool surface made that discoverable:

- `--version` was `unknown command`, exit 1;
- the run banner printed model, judge and mode — not the harness version;
- `results.yaml` recorded `schema: 2` and nothing else about provenance.

And `schema` is the wrong sentinel anyway. 0.2.1 → 0.3.0 kept `schema: 2` while
changing what a verdict *means*: the judge started seeing the staged diff, and
needle gates started matching changed lines instead of raw diff text. Two files can
both say `schema: 2` and be incomparable measurements.

So: `--version` exists (also `-v`, also `version`). The run banner names the
version. And `finalizeResults` — the single funnel every writer passes through —
stamps `harness_version` into every `results.yaml`, so `run`, `grade`, `rescore` and
a review-UI override all leave provenance behind. Older runs carry no version and
are never retro-labelled, because inventing provenance is worse than lacking it.

That last field is what makes the real fix possible, which is the next release: a
**downgrade tripwire**. `run`/`grade`/`lint` compare their own version against the
newest `harness_version` in the results tree they're touching. Older tool, newer
records ⇒ `run` refuses, `grade` and `lint` warn loudly. The failure announces
itself instead of producing plausible numbers.

## The pattern

Both defects live in the same place: not in what the tool computes, but in what it
assumes when you say nothing. A default judge is a spending decision. A binary on
`PATH` is a provenance decision. Neither had to be stated to be made, and neither
was visible after the fact.

The general form, which I now believe is the useful bit: **anything a tool decides
on your behalf should be printed where the results are read.** The judge is on the
banner. The version is on the banner and in the record. What is left implicit is
what bites, and it bites in a way that looks like a normal result.
