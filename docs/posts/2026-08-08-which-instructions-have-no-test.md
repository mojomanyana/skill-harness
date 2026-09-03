# Which instructions have no test?

*Draft — owner edits voice.*

You have a `SKILL.md` with fourteen sections and a spec with nine scenarios.
Which sections does nothing test?

Nobody knows. That's the honest answer for every skills repo I've seen, including
this one. And it matters in a specific way: the sections nobody tested are exactly
where a well-meaning edit will quietly break behaviour, because nothing will go
red.

This release adds two free, offline commands.

## `coverage` — declared linkage

```
$ skill-harness coverage demo --skills ./skills
demo: 2/3 sections have a declared test (67%)

  no test declares coverage of:
    ../SKILL.md#demo  (Demo)

  `covers` records a declared link, not proof the behaviour is tested.
```

You opt in per scenario:

```yaml
scenarios:
  - id: A1
    title: politeness
    covers: ["../SKILL.md#core-principle"]
```

The unit is a Markdown heading section, because that's the unit skill authors
already write in. No new syntax, no annotation pass that gets skipped.

**That last line of output is the whole design constraint.** `covers` records that
*somebody associated a test with a section* — not that the behaviour is tested,
still less tested well. A coverage number that gets read as proof is worse than no
number at all, because an author who believes 100% means done stops looking. So
every surface says "declared", and `--strict` (the CI gate) is opt-in: an
uncovered section is information, not a defect, and a linter that reddens CI for
it just teaches people to add a token `covers:` to shut it up.

A *broken* reference does fail, `--strict` or not — a `covers` pointing at a
heading that no longer exists is a wrong statement in the spec, not a gap. Renaming
a heading is the usual cause, so the finding names the near-misses:

```
A1: covers reference `../SKILL.md#core-principles` is broken (section-missing) — did you mean #core-principle?
```

## `affected` — which tests could this change have broken?

```
$ skill-harness affected demo --skills ./skills --base HEAD
selected 2/3 scenario(s):
  A2  covers skills/demo/SKILL.md#edge-cases
  B1  B-series (always run)

an affected run is partial and never reports SHIP — a full run still gates a release
```

It reads `git diff --unified=0`, maps changed line ranges to heading sections,
reverses the `covers` map, and prints a reason for every scenario it picked. Then
`run --affected --base <ref>` runs exactly that set.

Every scenario gets a reason. That isn't decoration — a selection you can't
interrogate is a selection you'll stop trusting the first time it surprises you.

## The asymmetry that decides every judgement call

**An under-inclusive set is dangerous. An over-inclusive one is merely
expensive.** Missing a regression means shipping it. Running extra scenarios costs
tokens.

So everything resolves toward selecting more:

- **Every critical and every B-series scenario runs, always**, whatever the diff
  said. Those decide releases. If the mapping is wrong — and a mapping built from
  author-written labels can be — those are the worst possible ones to skip.
- **A scenario with no `covers` is always selected.** There's nothing to consult,
  so it can't be ruled out.
- **A changed fixture, post-test, agent file or extension selects its scenario**
  regardless of instruction text — that changes what the scenario *runs*.
- **A referenced file that's gone selects everything.** A rename defeats line
  mapping, and guessing would be worse than admitting it.
- **A wholesale rewrite selects everything.** When every line changed, the sections
  that "match" are an artefact of the rewrite's shape, not evidence.

And an affected run reuses the existing `--only` machinery, so it inherits the
same guarantee: partial, never SHIP. It's an iteration tool. A full run still
clears a skill for publishing.

## `covers` costs nothing to change

There are four staleness facets in this tool, each naming the cheapest honest
remedy: `stimulus:` → re-run (tokens), `rubric:` → re-grade (judge only),
`policy:` → re-score (free), `gates:` → regate (no subject call; fail→pass reps may need a judge).

`covers` is in **none** of them. It's metadata. Editing it changes which tests
`--affected` selects *next time* — not what any past run measured. Charging a
re-run for editing a label is exactly the trap the facet split was built to
remove, and the exhaustive-destructure guard in `sources.ts` made us write that
decision down rather than let it default.

## One bug worth the anecdote

The unit tests passed. Then I ran `coverage` against a real skill and every skill
had a phantom section named after its own `description:` line.

YAML frontmatter closes with `---`. The line above a `---` is, per CommonMark, a
Setext h2 underline. So `description: Use when…` was a heading — sitting at the
top of the file, where a careless whole-file `covers` would happily mark it
covered.

Nine unit tests on heading extraction didn't catch it, because I'd written them
about headings rather than about the files this actually reads. Running the
command on real input took ten seconds.
