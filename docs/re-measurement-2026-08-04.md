# Re-measurement handoff — which committed cells 0.3.0 invalidated

Written 2026-08-04 by the skill-harness agent, for the owner of
`principal-pi-skills`. That repo is read-only from here, so this is a note rather
than a set of commits.

**Short version:** 4 of the 14 **current** scorecard cells have verdicts that
0.3.0 invalidated — `build` and `debug`, both models. The other 10 do not need a
re-run for correctness. Earlier guidance in `docs/ROADMAP.md` said all committed
scorecards were invalid; that was written before anyone checked which specs
actually contain seeded scenarios, and it is broader than the evidence supports.

## Why these four and not the rest

Three 0.3.0 changes can move a *verdict*:

| Commit | Time (UTC) | Change |
|---|---|---|
| `f6a5f6c` | 2026-08-04 11:36Z | seeded runs show the judge the staged diff |
| `d4fa526` | 2026-08-04 11:54Z | `assert.diff_excludes` + `assert.post_test` (additive) |
| `3b10473` | 2026-08-04 12:49Z | `assert.diff_contains` matches changed lines, not context |

All three touch **seeded scenarios only**. A scenario is seeded if its spec entry
has `mode: seeded` (+ `fixture:`). Counted across the seven specs:

| Skill | Scenarios | `mode: seeded` | Current cells ran at | Verdicts affected? |
|---|---|---|---|---|
| `build` | 9 | **8** | ds 08-03 15:08Z · glm 08-04 08:25Z | **yes** — both pre-11:36Z |
| `debug` | 8 | **5** | ds 08-03 14:55Z · glm 08-04 08:08Z | **yes** — both pre-11:36Z |
| `architect` | 14 | 0 | release-1 | no |
| `decide` | 12 | 0 | release-1 | no |
| `plan` | 12 | 0 | release-1 | no |
| `review` | 18 | 0 | release-1 | no |
| `git-ops` | 15 | 0 | ds 08-04 15:14Z · glm 15:38Z | already re-measured post-fix |

`git-ops` uses the other fixture mechanism — `workspace: "fixture:..."` on 6
scenarios — which seeds a workspace but is not `mode: seeded`, so the diff-to-judge
change does not apply to it. Its `release-2-gitops` runs postdate all three commits
anyway.

Already covered by the partials you ran this afternoon, so they need no repeat:
`build` A2 and A4 (`post-diff-remeasure` 13:55Z/13:57Z, `a2-gate-fixed`
14:04Z/14:06Z) and `git-ops` A9. That leaves **6 of build's 8** seeded scenarios
and **all 5 of debug's** still carrying pre-fix verdicts.

## The 10 cells that do not need a re-run — and what they still lack

`architect`, `decide`, `plan`, `review` × both models have **zero** seeded
scenarios, so no seeded gate and no diff-to-judge change can have altered their
verdicts. Their numbers stand.

What they do lack is **staleness coverage**. `source_hashes` gained `scenario:` and
`fixture:` key kinds in `40c207c` (PR #29, 12:02Z); a run recorded before that
carries none, and `lint` can only flag drift it has a hash for. Measured across the
current cells:

```
skill      model  round              scen#  fixt#
architect  ds     release-1              0      0
architect  glm    release-1              0      0
build      ds     release-1              0      0
build      glm    release-1              0      0
debug      ds     release-1              0      0
debug      glm    release-1              0      0
decide     ds     release-1              0      0
decide     glm    release-1              0      0
plan       ds     release-1              0      0
plan       glm    release-1              0      0
review     ds     release-1              0      0
review     glm    release-1              0      0
git-ops    ds     release-2-gitops      15      6
git-ops    glm    release-2-gitops      15      6
```

This is why `skill-harness lint all --skills .` reports **0 findings** against your
tree today: silence there means "nothing provably stale", not "everything fresh".
The 12 zero-hash cells are invisible to the gate. Re-running them converts silence
into a real check — worth doing eventually, but it is hygiene, not a correction, and
it is your call whether it is worth ~500 rep-executions.

For contrast, the post-fix runs record hashes proportional to the spec, confirming
the mechanism works rather than merely not erroring: `build`/kimi-k3 → 9 scenario +
8 fixture hashes for a 9-scenario/8-fixture spec; `debug`/kimi-k3 → 8 + 6.

## Commands

`principal-pi-skills` pins the harness — `.github/workflows/ci.yml` checks out
`ref: v0.3.0` — so nothing below changes under it until that pin is bumped. (An
earlier version of this note said the repo tracks `@latest`; it does not, on either
surface. Corrected 2026-08-05.) npm and the git `latest` tag both serve **0.3.2** as
of 2026-08-05. Any of the three is new enough for everything below: 0.3.1 and 0.3.2
only touch `lift`, which plays no part in these runs. Run from the repo root:

```bash
DS=fireworks:accounts/fireworks/models/deepseek-v4-pro
GLM=fireworks:accounts/fireworks/models/glm-5p2

skill-harness run build --skills . --model "$DS"  --reps 3 --label post-diff-remeasure-full
skill-harness run build --skills . --model "$GLM" --reps 3 --label post-diff-remeasure-full
skill-harness run debug --skills . --model "$DS"  --reps 3 --label post-diff-remeasure-full
skill-harness run debug --skills . --model "$GLM" --reps 3 --label post-diff-remeasure-full
```

Full runs rather than `--only`, deliberately: a `--only` run is a partial and by
your own manifest policy can never be a **current** scorecard cell or count as
staleness coverage. Since the point is to replace the current cell, it has to be
the whole skill.

Notes:

- These spend tokens on both the subject and the judge (judge defaults to
  `anthropic:claude-opus-4-8`).
- `pi -p` needs stdin from `/dev/null` or it hangs — relevant if you wrap these.
- Expect verdicts to move in **both** directions. The judge now sees the code
  instead of the model's description of the code, which catches models that
  described work they did not do, and also vindicates ones whose correct work read
  badly in prose.
- `grade` cannot substitute for these. Saved transcripts from before `f6a5f6c` do
  not contain the diff, so re-judging them re-runs the same diff-less judgement.
- After the runs land, update `RESULTS-MANIFEST.md`: the release-1 `build`/`debug`
  rows become `superseded`, and README's scorecard picks up the new cells.

## What this does not cover

The third-model `kimi-k3` probes for `build` (16:59Z) and `debug` (19:46Z) already
postdate all three commits and carry full hash coverage, so they are 0.3.0-era
measurements. They are marked `probe` and are not part of the two-model scorecard —
flagging it only so they are not mistaken for cells needing a repeat.
