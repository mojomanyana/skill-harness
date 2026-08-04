---
title: "Your eval was current. The thing it measured wasn't."
status: draft
audience: post / thread
feature: source_hashes over scenario definitions + fixture trees (item 4)
roadmap: Phase 1 — measurement integrity; extends the staleness lint
---

# Your eval was current. The thing it measured wasn't.

skill-harness has a staleness check whose whole job is to stop a published
scorecard from describing text that no longer exists. Every run records a sha256
of the sources it measured; `lint` compares them against what's on disk and tells
you to re-run if they've moved.

It hashed the `SKILL.md` and the agent files. It did not hash the spec, and it
did not hash the fixtures.

Which means it was checking the *instructions* and ignoring the *test*.

## How we found out

Someone working in our skills repo replaced `build/tests/fixtures/A2/ranges.ts`
and added an entire new `git-ops/tests/fixtures/A9/` tree. Both edits change what
those scenarios measure — different starting code, different bug, different
correct answer.

Then:

```
$ skill-harness lint all --skills ~/prepos/principal-pi-skills
7 skill(s), 0 finding(s)
```

Clean. Every committed result still looked current. The scorecard was measuring
one thing and reporting a number earned by measuring another, and the tool built
to catch exactly that said nothing.

Editing a checklist item was the same story. Change *"rejects overdrawing"* to
something stricter and every historical PASS is now a PASS against a different
question — with no signal that anything moved.

## The fix, and the design decision inside it

Hash the rest of it. Two new kinds of key in `source_hashes`:

- `fixture:<path>` — a stable digest over every file in the fixture tree: sorted
  relative paths *and* contents, so a rename counts as a change, and sorted so
  the digest doesn't depend on readdir order (an unsorted walk would produce
  different hashes for identical trees on different machines, and CI would cry
  staleness forever).
- `scenario:<id>` — a digest of one scenario's *definition*.

That second one is where the real decision was.

### Why not just hash specification.yaml?

It's one file. One `sha256`. Obvious.

And it would have been actively bad, because it can only answer "did this file
change?", and that is not the question. Add one new scenario to a spec — a purely
additive act that changes nothing about what the existing scenarios measured —
and a whole-file hash marks **every historical run of that skill stale**. Every
model tag. All of them. Re-run everything, for a change that invalidated nothing.

This project had already been bitten by that exact shape once: there's a check
in `lint` that deliberately skips runs whose scenario set doesn't match the
current spec, with a comment explaining that a spec reshape must not
consistency-flag every historical run. Whole-file hashing would have reintroduced
the same noise through a different door.

So the digest is per scenario, and it's built from the **parsed** scenario, not
its YAML text. The result behaves the way you'd want if you thought about it for
a while:

| you did this | what goes stale |
|---|---|
| edited A1's checklist | A1 |
| swapped a file in A2's fixture | A2 |
| added scenario D5 | nothing |
| reindented the YAML, requoted a string | nothing |
| deleted a scenario a run had measured | nothing — that's a reshape |

The findings carry the scenario id, so the output tells you *what to re-run*
rather than *that something is wrong somewhere in this skill*.

## The part that isn't fixed, and can't be

The runs already committed recorded only `SKILL.md`. They have no fixture hashes
in them, because fixture hashes didn't exist when they were written. There is
nothing to compare against, so `lint` stays quiet about them — deliberately, on
the same rule that has always applied: runs predating a field are never
retroactively flagged, or every upgrade would spray findings across history.

So this is a forward-looking fix. The scorecards sitting in the repo right now
still can't tell you whether their fixtures moved underneath them. The only way
to find out is to re-run them, at which point they start carrying the new hashes
and the question becomes answerable forever after.

That's an unsatisfying ending, and it's the honest one. A measurement you didn't
record is not a measurement you can recover.

## The generalizable bit

If you have a staleness or cache-invalidation check, write down the full list of
inputs your result actually depends on, and then check your check against it.
Ours had four inputs and was watching one and a half.

And when you add hashing to something, ask what the *unit* should be before you
ask what the algorithm should be. We got the algorithm right and nearly got the
unit wrong, and the unit is what decides whether the feature is useful or just
loud.
