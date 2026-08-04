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

`./assets/demo/record.sh` rebuilds `assets/demo.gif` headlessly in about a minute — no
display, no screen capture, no interactive terminal:

```
script(1)          runs demo.sh under a real pty, logging output + real inter-write delays
script2cast.mjs    converts that pair to asciicast v2
agg                renders the cast to GIF
```

Nothing about the timing is synthesised — the delays are what the commands actually took,
which is why it needs a pty rather than a pipe. `COLS`/`ROWS` (default 110×24) set the
frame; `DEMO_DELAY` (default 1.2s) sets the beat between steps.

`agg` is fetched as a prebuilt release binary rather than built, deliberately: building
`agg`, `asciinema` or `vhs` from source needs a Rust toolchain with `edition2024`, and this
machine has cargo 1.75 from apt with no rustup (and `pip` is PEP-668 managed, so the Python
route is closed too). The prebuilt binary sidesteps all of that. Pass `AGG=/path/to/agg` to
use your own.

Two details worth keeping if you change the pipeline:

- **`stty` inside the pty**, not `COLUMNS`/`LINES` — the programs ask the tty, so a
  non-interactive parent otherwise leaves it at 80×24 and wraps differently than the cast
  header claims.
- **The final frame is held by a write, not a sleep.** `script`'s timing log records
  writes only, so a silent `sleep` adds nothing to the cast; the pause ends with
  `printf '\033[?25l'`, which costs no visible output and stops the cursor blinking over
  the last frame.

To record by hand instead, any screen recorder over a terminal works — the script is
built so a manual take is a single pass with no editing.
