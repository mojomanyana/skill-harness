---
title: "That badge says your skill scores an A. It's describing a file you deleted."
status: draft
audience: post / X thread
feature: source_hashes + lint `stale` (0.2.0)
---

# That badge says your skill scores an A. It's describing a file you deleted.

Here's the lifecycle of every committed eval result, in every repo, eventually:

1. You run your scenarios. Your skill scores an A. You commit `results.yaml`.
2. You keep editing the `SKILL.md`. Because that's the point — the whole reason the harness exists is to support editing the skill.
3. You don't re-run, because you only changed a paragraph.
4. Six weeks later, that A is being read as a current claim about a file that no longer contains the text it graded.

Nobody lied. There is no bug. The number was true when written and is false now,
and nothing in the system knows the difference. A scorecard has no expiry date,
so it doesn't have one.

## Make the result carry its own evidence

Every run now records the sha256 of every source file it actually measured — the
`SKILL.md`, plus each distinct `system_prompt_file` for agent-definition
scenarios:

```yaml
source_hashes:
  SKILL.md: 9f2c1a…
  agents/reviewer.md: 4b77e0…
```

And `lint` — free, static, no models, no API keys, the thing you already run in
CI — checks the newest run's hashes against the files on disk:

```
✗ skills/ponytail: stale — SKILL.md changed since the newest pi-deepseek run
  (2026-06-25T12-00-00Z) — results are stale; re-run before publishing
```

A published result must describe text that still exists. If it doesn't, that's a
finding, and CI fails on it like any other.

Deleted file? Also a finding, with different wording — `SKILL.md no longer exists
but the newest run measured it`. The two cases fail for different reasons and a
message that blurs them wastes the reader's time.

## The part I'd argue about

The interesting design question isn't the hashing, it's **what counts as stale**.

An early version flagged the whole history: reshape a spec and every historical
run suddenly disagreed with the current one, so `lint` produced a wall of
findings for runs that were perfectly honest about the state of the world when
they were written. A linter that emits fifty findings for one intentional change
is a linter you learn to ignore, and an ignored gate is worse than no gate,
because it comes with a false sense of coverage.

So only the **newest** run per model tag is checked against current source.
That's the one being read as a live claim. Older runs are history — they describe
a `SKILL.md` that has legitimately moved on, and saying so repeatedly isn't
information.

Two rules I'd generalize from this:

- **A result should carry enough evidence to invalidate itself.** Not a timestamp — a timestamp only tells you *when*, and you still have to reconstruct what changed. A content hash tells you *whether*.
- **Only gate on the claim that's live.** Flagging everything technically-inconsistent is how a gate becomes noise.

If you publish eval numbers for anything — skills, prompts, agents, models — go
check whether your newest committed result still describes the file it graded.
The answer is uncomfortable more often than you'd like.

<!-- Owner notes:
     - Short and mechanical; good X-thread material and a natural pairing with
       the CI/Action story in Phase 4.
     - If the flagship examples land first, screenshot a real `lint` stale
       finding from one of them instead of the invented ponytail one.
-->
