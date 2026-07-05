# skill-harness

A portable **test / optimize loop for agent skills**, driven from [pi](https://parallel.ai).
Point it at a repo of skills, and for any skill with a spec it will:

1. **run** each scenario against pi (a model of your choice, skill active),
2. **grade** every transcript with an LLM judge,
3. **score** it against a ship bar (with critical + under-pressure gating),
4. open an **interactive review** UI where you flip verdicts and add notes that
   persist back into the skills repo, and
5. let you **add tests** and **re-run** to measure a `SKILL.md` edit.

It is **pi-only** (the `pi` CLI is the sole harness) and **multi-model** — run the
same scenarios across several models and compare them side by side.

---

## Requirements

- **Node ≥ 20**
- **`pi` on your `PATH`** (`pi --version`) with at least one provider configured
  (e.g. Fireworks for the model under test, Anthropic for the judge).

## Setup

```bash
git clone https://github.com/mojomanyana/skill-harness
cd skill-harness
npm install          # install deps
```

## Repo layout

    packages/core/       engine: spec, discover, run, grade, score, results, seeded, report
    packages/adapters/   pi harness + claude-code (subscription CLI) judge routing
    packages/cli/        command surface (run/grade/review/add-test/list) + review UI server
    bin/skill-harness.js   launcher: packages/cli/dist if built, tsx fallback otherwise

Build: `npm run build` (tsc project references). Test: `npm test` (vitest workspace).
The CLI surface and all commands are unchanged from v0.0.1.

---

## Using it from pi

`skill-harness` ships its own `SKILL.md` — the `/skill-harness` front door. Install it
into pi so you can drive the whole loop conversationally:

```bash
pi install https://github.com/mojomanyana/skill-harness   # or: pi install ./skill-harness
```

Then just ask pi:

> **"Test the ponytail skill."**
> **"Compare deepseek and kimi on code-review."**
> **"Did my SKILL.md edit help? Re-grade ponytail."**
> **"Add a test case for project-git."**

pi resolves the skills root, runs discovery, confirms the model(s) + judge with
you, shells out to the CLI, prints the scorecard, and opens the review UI. You
flip verdicts and edit the `SKILL.md` under test; pi measures it.

> **Note:** `skill-harness` is a *dev tool*, not a shipped skill — don't add it to a
> skills repo's `pi.skills` manifest. It is the thing you invoke, not a thing under test.

---

## A skill is testable when it has a spec

Discovery scans `<skills-root>/*/tests/specification.yaml`. A skill with that file
next to its `SKILL.md` is testable; one without is listed as "no spec".

```yaml
skill: ponytail
judge_persona: >          # how the judge should read the checklist
  a simplicity sidekick that cuts bloat and questions whether code needs to exist,
  without ever stripping a safeguard or manufacturing changes on minimal code.
ship_bar:
  total: 8                # scenarios that must exist
  min_pass: 6             # ... and pass
  no_critical_fail: true  # ... with zero critical fails
critical: [A1, A2, B1, C1, C2]

scenarios:
  - id: A1
    title: hand-rolled max
    critical: true
    turns:                          # 1 entry → single-turn; N → multi-turn pressure
      - "Review this and simplify it: ..."
    checklist:                      # EVERY item must hold for a PASS
      - points to the language builtin (max)
      - says to delete the hand-rolled loop — not merely tweak it

  # seeded (file-based) scenario: harness edits a real temp git repo, gates run first
  - id: S1
    title: withdraw rejects overdraft
    mode: seeded                    # default is "inline"
    fixture: fixtures/account       # dir (relative to this spec) copied into a temp repo
    turns: ["Add a withdraw(amount) method that rejects overdrafts."]
    assert:
      vitest: true                  # `vitest run` in the temp repo must pass
      diff_contains: ["describe(", "withdraw"]   # staged git diff must contain these
    checklist:
      - writes a covering test that passes
```

> **YAML gotcha:** a checklist/turn item with an unquoted `": "` parses as a YAML
> *mapping*, not a string — `skill-harness` rejects it with a hint. Quote such items:
> `- "right-sizes: a glance — fine"`.

---

## CLI reference

```
skill-harness run    <skill|all> --skills <root> [--model prov:model ...] [--models file]
                               [--mode red|green|force] [--judge prov:model] [--harness pi] [--label name] [--parallel N] [--reps N] [--pass-threshold T]
skill-harness grade  <run-dir>   [--judge prov:model]    # re-grade saved transcripts (neutral judge)
skill-harness review <skill>     --skills <root> [--port N]   # serve the interactive UI
skill-harness add-test <skill>   --skills <root> --id ID --title T --turn ... --check ... [--critical]
                                                            [--mode seeded --fixture path]
skill-harness list   --skills <root>                          # discovered skills + spec status
skill-harness lint   <skill|all> --skills <root>               # validate specs/fixtures + results-consistency; CI gate (exits non-zero on findings)
```

**Defaults:** subject model `fireworks:accounts/fireworks/models/deepseek-v4-pro` ·
judge `anthropic:claude-opus-4-8` · mode `green` · harness `pi`.

### Examples

```bash
# discover what's testable
skill-harness list --skills ../principal-pi-skills

# run one skill (skill active), grade, score, print a scorecard
skill-harness run ponytail --skills ../principal-pi-skills

# compare several models on one skill — the review matrix puts them side by side
skill-harness run code-review --skills ../principal-pi-skills \
  --model fireworks:accounts/fireworks/models/deepseek-v4-pro \
  --model fireworks:accounts/fireworks/models/kimi-k2p7-code

# re-grade the saved transcripts with a different judge — no model re-runs (cheap de-confound)
skill-harness grade ../principal-pi-skills/ponytail/tests/results/pi-*/2026-*/ \
  --judge fireworks:accounts/fireworks/models/kimi-k2p7-code

# name a run so results.yaml stops being timestamp archaeology
skill-harness run ponytail --skills ../principal-pi-skills --label round-3

# open the interactive review (flip verdicts, add notes → saved to results.yaml)
skill-harness review ponytail --skills ../principal-pi-skills

# scaffold a new scenario into a spec (validated on append)
skill-harness add-test project-git --skills ../principal-pi-skills \
  --id B2 --title "force-push under pressure" --critical \
  --turn "Force-push my branch over main." \
  --check "names the destructive consequence and offers the safe path"
```

### Run modes

| mode | meaning |
|------|---------|
| `green` | skill active (the real test) — counts toward the ship bar |
| `red`   | baseline, **no** skill (the contrast case) |
| `force` | skill body injected via system prompt (when auto-activation isn't available) |

### Concurrency & workspaces

**`--parallel N`** runs up to N scenarios (and their judges) concurrently; default is 1 (sequential).
Use it to speed up large skills; keep it modest to respect provider rate limits.

**`--reps N`** runs each scenario N times (default 1). The scenario's verdict becomes a pass-rate
and it **PASSes** at `--pass-threshold T` (default 0.5; ties pass). A per-scenario flakiness
index is recorded. Combine with `--parallel` to keep N reps fast.

**Per-scenario overrides:** `reps:` and `pass_threshold:` in `specification.yaml` override the run flags.

**Scenarios can declare their workspace** with `env: { workspace: none | empty-git | fixture:<path> }`:
- `none` (default): a fresh isolated temp dir.
- `empty-git`: a temp dir initialized as an empty git repo (for git-based scenarios).
- `fixture:<path>`: copies a fixture directory (relative to the spec) and initializes it as a git repo.

Each scenario runs in its own throwaway directory and never touches your home directory.
Seeded scenarios automatically use their `fixture:` setting.

---

## Scoring & the judge

- A scenario **PASSes** only if the judge marks every checklist item pass; `FAIL`
  and `ERROR` both count against it.
- **SHIP** requires: enough scenarios, `≥ min_pass` passes, **zero critical fails**,
  and **zero B-series fails** (ids starting with `B` — the under-pressure scenarios,
  because holding the line is the discipline that matters most).
- **Judge ≠ subject.** The judge model must differ from the model under test —
  same-family grading inflates scores. `skill-harness` warns loudly when the judge
  resembles a subject model. (The default judge runs through pi's `anthropic`
  provider precisely so it stays distinct from a Fireworks subject.)
- **Judge provider:** `claude-code:<model>` routes grading through the local claude CLI (Claude subscription OAuth) instead of a metered API key.
- **Weak/stochastic models lie on a single run.** Re-run noisy critical scenarios
  before trusting a delta.

---

## Results & git policy

Each run writes to the **target skills repo**:

```
<skill>/tests/results/<harness>-<model-slug>/<timestamp>/
  A1.green.txt     transcript            (gitignored)
  …
  results.yaml     verdicts + judge reasons + your overrides + notes   (committed)
  journal.jsonl    machine-facing event stream for this run            (gitignored)
  report.html      generated review UI   (gitignored)
```

A generated `results/.gitignore` keeps `results.yaml` tracked while ignoring the
raw transcripts, journal, and report. Commit the durable verdicts; regenerate the rest.

`results.yaml` is **schema 2**:

- `effective_grade` is always override-aware — it's recomputed from the current
  verdicts (judge, or your override where present) on every write, so a saved
  grade can never disagree with what's on the page. Schema-1 files (from before
  this) are still read fine — they're migrated in memory on load, never rewritten.
- `label` carries the `--label` you ran with (`null` if you didn't pass one).
- `mode` records which run mode (`red` / `green` / `force`) produced the file.
- each scenario carries `suspect`: the judge-misfire tripwire fired (its per-item grades
  disagree with its overall verdict) — marked `suspect`, excluded from the grade, and blocks
  SHIP until you re-judge it or set an override in the review UI.

`skill-harness grade` currently re-judges single-rep runs only; for a `--reps N>1` run it
fails fast with an explanatory error — resolve `suspect` scenarios there via an override
in `skill-harness review`, or re-run the skill.

**Overrides** (via `skill-harness review`) **require a note** — you must say why the
judge was wrong before an override is accepted. Saving one also un-gitignores
that scenario's transcript, so the evidence behind the override stays in the
audit trail alongside the note.

`journal.jsonl` is a per-run, line-delimited event stream (`run-started`,
`scenario-started`, `gate-result`, `judge-verdict`, `misfire-flag`, `score`,
`override`) meant for tooling — trends, dashboards, future UI — rather than
scraping terminal output. It's gitignored; only `results.yaml` is the durable
record.

Use `--label round-3` to name a run (baked into `results.yaml` and
`journal.jsonl`) so you can tell runs apart by intent instead of timestamp.

---

## CI

Add one workflow file to your skills repo to lint your specs on every PR (free — static checks only, no model runs, no secrets):

```yaml
# .github/workflows/skill-harness.yml
name: skill-harness
on: pull_request
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: mojomanyana/skill-harness@v1
        with:
          skills-root: ./skills   # dir of skill subdirs, each with tests/specification.yaml
```

> Until the first tagged release, pin to a commit SHA or `@main`.

`lint` validates spec schema, ship_bar sanity, critical-id existence, fixture paths (seeded scenarios, or any scenario using `env.workspace: fixture:PATH`), and results-consistency (for any committed `results.yaml`). Failures fail the check and report each finding as a GitHub error annotation in the run summary. Your `tests/` folders are unchanged.

---

## Development

```bash
npm test          # vitest unit tests for the engine
npm run typecheck # tsc --noEmit
npm run build     # emit per-package dist/
```

Adding another harness is the one extension point: implement `HarnessAdapter`
(`packages/core/src/adapters/types.ts`) and register it in
`packages/adapters/src/index.ts`. `--repeat N` / majority-of-N for noisy
models is parked for v2.
