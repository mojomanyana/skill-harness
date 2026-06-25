# skill-check

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
git clone https://github.com/mojomanyana/skill-check
cd skill-check
npm install          # install deps
npm run build        # optional: emit dist/ (otherwise it runs via tsx in dev)
```

Run the CLI either way:

```bash
npm run dev -- list --skills ../principal-pi-skills   # dev (tsx, no build)
./bin/skill-check    list --skills ../principal-pi-skills   # built (uses dist/)
```

The launcher (`bin/skill-check`) uses `dist/` when present and falls back to `tsx`.
The examples below use `skill-check` — substitute `npm run dev --` if you haven't built.

---

## Using it from pi

`skill-check` ships its own `SKILL.md` — the `/skill-check` front door. Install it
into pi so you can drive the whole loop conversationally:

```bash
pi install https://github.com/mojomanyana/skill-check   # or: pi install ./skill-check
```

Then just ask pi:

> **"Test the ponytail skill."**
> **"Compare deepseek and kimi on code-review."**
> **"Did my SKILL.md edit help? Re-grade ponytail."**
> **"Add a test case for project-git."**

pi resolves the skills root, runs discovery, confirms the model(s) + judge with
you, shells out to the CLI, prints the scorecard, and opens the review UI. You
flip verdicts and edit the `SKILL.md` under test; pi measures it.

> **Note:** `skill-check` is a *dev tool*, not a shipped skill — don't add it to a
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
> *mapping*, not a string — `skill-check` rejects it with a hint. Quote such items:
> `- "right-sizes: a glance — fine"`.

---

## CLI reference

```
skill-check run    <skill|all> --skills <root> [--model prov:model ...] [--models file]
                               [--mode red|green|force] [--judge prov:model] [--harness pi]
skill-check grade  <run-dir>   [--judge prov:model]    # re-grade saved transcripts (neutral judge)
skill-check review <skill>     --skills <root> [--port N]   # serve the interactive UI
skill-check add-test <skill>   --skills <root> --id ID --title T --turn ... --check ... [--critical]
                                                            [--mode seeded --fixture path]
skill-check list   --skills <root>                          # discovered skills + spec status
```

**Defaults:** subject model `fireworks:accounts/fireworks/models/deepseek-v4-pro` ·
judge `anthropic:claude-opus-4-8` · mode `green` · harness `pi`.

### Examples

```bash
# discover what's testable
skill-check list --skills ../principal-pi-skills

# run one skill (skill active), grade, score, print a scorecard
skill-check run ponytail --skills ../principal-pi-skills

# compare several models on one skill — the review matrix puts them side by side
skill-check run code-review --skills ../principal-pi-skills \
  --model fireworks:accounts/fireworks/models/deepseek-v4-pro \
  --model fireworks:accounts/fireworks/models/kimi-k2p7-code

# re-grade the saved transcripts with a different judge — no model re-runs (cheap de-confound)
skill-check grade ../principal-pi-skills/ponytail/tests/results/pi-*/2026-*/ \
  --judge fireworks:accounts/fireworks/models/kimi-k2p7-code

# open the interactive review (flip verdicts, add notes → saved to results.yaml)
skill-check review ponytail --skills ../principal-pi-skills

# scaffold a new scenario into a spec (validated on append)
skill-check add-test project-git --skills ../principal-pi-skills \
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

---

## Scoring & the judge

- A scenario **PASSes** only if the judge marks every checklist item pass; `FAIL`
  and `ERROR` both count against it.
- **SHIP** requires: enough scenarios, `≥ min_pass` passes, **zero critical fails**,
  and **zero B-series fails** (ids starting with `B` — the under-pressure scenarios,
  because holding the line is the discipline that matters most).
- **Judge ≠ subject.** The judge model must differ from the model under test —
  same-family grading inflates scores. `skill-check` warns loudly when the judge
  resembles a subject model. (The default judge runs through pi's `anthropic`
  provider precisely so it stays distinct from a Fireworks subject.)
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
  report.html      generated review UI   (gitignored)
```

A generated `results/.gitignore` keeps `results.yaml` tracked while ignoring the
raw transcripts and report. Commit the durable verdicts; regenerate the rest.

---

## Development

```bash
npm test          # vitest unit tests for the engine
npm run typecheck # tsc --noEmit
npm run build     # emit dist/
```

Adding another harness is the one extension point: implement `HarnessAdapter`
(`src/adapters/types.ts`) and register it in `src/adapters/index.ts`. `--repeat N`
/ majority-of-N for noisy models is parked for v2.
