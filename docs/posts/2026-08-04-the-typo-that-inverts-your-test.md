---
title: "The one-letter typo that silently inverts a test fixture"
status: draft
audience: short post / thread
feature: lint finding for mistyped fixture markers (item 5)
roadmap: Phase 1 — measurement integrity
---

# The one-letter typo that silently inverts a test fixture

skill-harness runs some scenarios against a real git repo. A fixture directory
gets copied into a temp workspace, committed as a baseline, and then the agent
edits it — so the staged diff at the end is exactly what the model did.

Some scenarios need to start from a *dirty* tree. "I fixed the typo, commit it"
requires the fix present but uncommitted. So a fixture can carry two special
top-level directories, applied after the baseline commit rather than in it:

```
fixtures/typo-fix/
  README.md                  # -> the baseline commit
  _uncommitted/README.md     # -> applied after, left unstaged
  _staged/CHANGELOG.md       # -> applied after, then `git add`ed
```

Now spell it `_uncommited/`. One `t`.

The directory doesn't match a known marker, so nothing special happens to it. It
gets copied in with everything else, committed into the baseline, and the
workspace comes up **clean** — the exact opposite of the dirty tree the scenario
was built to test. The scenario then measures a different situation than the one
its checklist describes, and reports a perfectly ordinary PASS or FAIL about it.

No error. No warning. A green-looking wrong answer, which is the worst failure
shape a measurement tool has.

## Two halves of a fix, three months apart

The runtime half landed in July: any top-level `_name/` is now treated as a
*marker claim* and must be a real one. `createWorkspace` throws, naming the
fixture, the offending directory, and the known markers.

Two carve-outs keep it from being obnoxious, because a blanket `^_` rule would
reject perfectly ordinary fixture content:

- only a **single** leading underscore counts, so `__tests__/` and `__pycache__/`
  copy normally
- markers are **top-level only**, so a nested `pkg/_staged/` is ordinary content

That fixed the silence. It did not fix the *timing*. Throwing at run time means
you find out once you've already started a run — with provider credentials
configured, other scenarios burning tokens around it — and the broken scenario
surfaces as a FAIL sitting in a column of real results.

The free, offline, no-credentials-required command that exists to catch spec and
fixture defects in CI said nothing at all.

So `lint` now reports it too:

```
✗ build/A2: fixture-marker — fixture fixtures/A2 has unknown top-level marker
  directory `_uncommited/` — did you mean `_uncommitted/`? Known markers are
  `_staged/` and `_uncommitted/`; rename it, or move it deeper if it is ordinary
  content.
```

## The bit worth stealing

The two checks share **one implementation**. `lint` calls the same function
`createWorkspace` calls to decide what counts as a bad marker.

That's not tidiness, it's the actual requirement. If lint were more lenient than
the runtime, it would hand out a clean bill of health for a fixture that then
explodes mid-run — which is worse than not checking, because now you've been told
it's fine. If it were stricter, it would block fixtures that work. There's a test
asserting both fire on the same input, for exactly this reason.

Any time you add a "check it early" pass in front of a "check it properly" pass,
they have to be the same check, or the early one is just a second opinion you
didn't ask for.

## And the suggestion is allowed to say nothing

`_uncommited` → *did you mean `_uncommitted`?* Useful. `_Staged` → *did you mean
`_staged`?* Useful.

`_helpers` → **no suggestion.** Just the name and the rule.

A confident wrong guess ("did you mean `_staged/`?" for a directory called
`_helpers/`) would send someone off to rename a legitimate directory, or worse,
teach them the tool's advice isn't worth reading. The distance cutoff is two
edits, case-insensitive: close enough to catch the typos people actually make,
far enough to stay quiet when it doesn't know.
