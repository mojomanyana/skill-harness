# The demo

`demo.sh` is a tested, one-take ~30s script for the README's demo GIF. Run it while
screen-recording; it needs no editing and no retakes.

```bash
npm i -g skill-harness                       # or HARNESS=./node_modules/.bin/skill-harness
SKILLS=../principal-pi-skills ./assets/demo/demo.sh
```

Three beats: **discover** (`list` — 7 skills, 88 scenarios), **gate** (`lint` green, then
one dropped `t` in a fixture marker turns it into 4 findings and exit 1), **measure**
(`rescore` on two committed runs, 93% → 100%).

## Why it isn't the GIF the roadmap first described

Sprint 1.2 asked for "edit SKILL.md → re-run → grade C→A". A live re-run spends tokens on
both the subject model and the judge, and a 3-rep run of one skill takes minutes — too
slow for 30 seconds and not free. So this demo shows the same loop using only the
free/offline commands, and takes its grade movement from runs already committed:
`git-ops` really did go 93% → 100% when the A9 scenario was reseeded.

That trade buys something the original didn't have: **every frame is reproducible by a
viewer at zero cost**, against a public repo, with no API key. Nothing on screen depends
on a model reply that would differ on a second take.

The one thing it does not show is a skill *improving*, which is the emotional core of a
TDD-loop demo. If that matters more than reproducibility, record it after a real run —
`--reps 1` on a single small skill keeps the spend to a few dollars.

## Recording it

Any screen recorder over a terminal works; the script's `DEMO_DELAY` (default 1.2s) sets
the beat between steps, so no editing is needed.

For a headless render instead, `vhs` or `asciinema` + `agg` both work — but note that
neither installs on this machine as it stands: `cargo` is 1.75 (apt, no rustup) and the
current `asciinema` and `agg` both need `edition2024`, while `pip` is externally managed
per PEP 668. Either upgrade the Rust toolchain, or just screen-record it — the script
exists so that a manual take is a single pass.

Suggested terminal setup: 100×30, a dark theme, and a font large enough to read at GitHub's
README width (the four lint findings are long lines, so a smaller font is what usually
makes a demo GIF unreadable).
