# Run-over-run stability is measurable now — 0.6.0

Written 2026-08-06 by the skill-harness agent, for the owner of `principal-pi-skills`.
That repo is read-only from here, so this is a note rather than a set of commits.

**Released in `skill-harness` 0.6.0** (npm: `skill-harness@0.6.0`; tag `v0.6.0`). Your
A5/D1 finding, turned into a derivation.

## The command

```bash
npx skill-harness@0.6.0 stability all --skills . [--window N] [--all]
```

Free, offline, exits 0 whatever it finds. No new runs — it reads the `results.yaml` files
you already committed, so it works on all of your history, including the pre-0.4.0 parts
(with the caveat below).

## What it says about your corpus right now

I ran it read-only against your tree: **6 boundary cells across 7 skills.** Three of them
are in `plan`:

| cell | path | reading |
|---|---|---|
| DS · force · **A5** | `PASS!→FAIL!` | your finding. Both runs unanimous; A5's own stimulus + rubric byte-identical; `SKILL.md` changed across the step |
| glm · force · **C2** | `FAIL!→PASS→FAIL` | **2 flips in 2 steps** — the least stable cell in the corpus, and I don't think anyone had noticed |
| glm · green · **D1** | `FAIL⋯PASS→FAIL!⋯FAIL⋯PASS!` | one flip on unchanged skill text |

`→` a step that counted · `⋯` a step that didn't · `!` that run's reps were unanimous.

**Your D1/DS case is not instability, and the tool says why.** Its 1/3 → 3/3 came with a
changed `../../agents/plan.md` — the agent file that scenario tests — so the step is
excluded and reported as an edit:

```
D1 has no comparable run-to-run step: 1 step(s) where the scenario's own sources changed
  (../../agents/plan.md changed — an edit, not a flip)
```

That is the half of your finding that turns out to have an explanation on the record.

## The rule it applies, so you can argue with it

A step between two adjacent runs (same skill × model tag × **mode** — green and force are
never pooled) is counted only when:

1. both verdicts are conclusive (no ERROR, no unresolved misfire — override-aware, so an
   override *is* the verdict);
2. both runs aggregated the same way (same reps, same pass threshold);
3. the recorded `source_hashes` show this scenario's **own** stimulus, rubric, gates,
   fixture and the judge persona identical.

Everything else is reported with its reason instead of being dropped.

**`SKILL.md` is deliberately not in that list.** Gating on it would have hidden your A5
case, since that flip happened across an edit aimed at C2. Such a flip is reported with
both readings named — side effect of the edit, or boundary cell — because the record
cannot settle it. If you want it settled, the cheap move is `--reps` on A5 against the
current text; two more unanimous runs on the same side would point at the edit.

Two consequences for your history worth knowing:

- **release-1 (0.3.x) runs cannot be compared to 0.4.0+ runs.** They recorded one combined
  `scenario:<id>` digest; newer runs record split facet keys. Different byte layouts, so
  equality across them would be meaningless — those steps come back `unverified` rather
  than assumed-unchanged. Your green series is mostly that, which is why it reports so
  many "no comparable step".
- **A cell with one run is `unmeasured`, never `stable`.** kimi-k3 has one force run, so
  nothing there is claimed either way.

## Where it shows up without being asked

- a `⇄` line under a fresh run's scorecard (for that run's tag + mode only);
- a `⇄ n/m` marker on the review-matrix cell, note as tooltip, plus a line in the panel —
  worth a look before you decide an override;
- **a `lint` note.** New: `lint` findings now carry a severity. Stability findings are
  `info` — they print `ℹ`, annotate `::notice` in Actions, keep the skill's `✓`, and do
  **not** change the exit code (which now counts only gate-failing findings). Your CI will
  start showing three notes in `plan` and stay green. Do not "fix" them; the remedy is
  `--reps N` on the cell, or an override with a note once you've picked a side.

## One naming decision to reject or accept consciously

The order suggested a `stability` field. I named it **`volatility`** (0 = never flipped,
1 = flipped at every opportunity) because it prints next to `flakiness`, where 0 is also
the quiet end — `stability: 0.00` would have had to mean "perfectly stable", and mixed
polarity in one line of output is a footgun. The word "stability" is still what the
feature and the command are called.

## Verification

662 tests pass, typecheck clean, `lint all` on the golden fixture reports 0 findings and
exits 0. New suites: `packages/core/test/stability.test.ts` (22) and
`packages/cli/test/stability-cmd.test.ts` (8). The numbers quoted above came from running
the published 0.6.0 tarball against your tree from a clean temp dir. Full detail in
`PUBLISHING.md`'s 0.6.0 section; the post draft is
`docs/posts/2026-08-06-flakiness-zero-is-not-stability.md`.
