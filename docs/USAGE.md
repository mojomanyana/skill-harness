# skill-check — step-by-step usage

A verified walkthrough of setting up and using `skill-check` locally. `skill-check` runs a spec'd agent skill's scenarios on the `pi` harness, LLM-judges each transcript, scores it against a ship bar, and lets you review + re-run to measure a `SKILL.md` edit.

> Agents: see [`AGENTS.md`](../AGENTS.md) for the condensed, rules-first version. pi users: `pi install` the repo and drive it conversationally via [`SKILL.md`](../SKILL.md).

## 0. Requirements

- **Node ≥ 20.**
- For **`run`** only: **`pi` on your `PATH`** (`pi --version`) with a provider configured for the model under test (e.g. Fireworks), and a judge — either an Anthropic API key or the Claude CLI (`claude`) for `claude-code:<model>` (judges on the Claude subscription, no metered key).
- **`lint` and `list` need neither `pi` nor any API key** — they are pure static checks.

## 1. Set up (one time)

```bash
git clone https://github.com/mojomanyana/skill-check
cd skill-check
npm install
npm run build        # tsc — produces packages/*/dist
```

Invoke the CLI three ways:
- `node bin/skill-check.js <cmd>` — the launcher (uses the built `dist`, else falls back to `npx tsx`).
- `npm run dev -- <cmd>` — dev, straight from source via tsx.
- `npm link` once, then `skill-check <cmd>` — a global command.

Examples below use `node bin/skill-check.js` against the bundled fixture skill (`packages/core/test/fixtures/golden-skill`) so you can reproduce them with no external skills repo.

## 2. Discover testable skills

A skill is testable when `<skill>/tests/specification.yaml` exists next to its `SKILL.md`. Discovery scans `<root>/*/tests/specification.yaml`.

```
$ node bin/skill-check.js list --skills packages/core/test/fixtures
skills under packages/core/test/fixtures:
  ● golden-skill  (2 scenarios)

● = testable · ○ = no spec yet · ✗ = spec present but invalid
```

## 3. Lint — the free CI gate (no models, no keys)

Validates spec schema, ship-bar sanity, critical-id existence, fixture paths, and results-consistency (for any committed `results.yaml`). **Exits non-zero on any finding** — this is what CI gates on.

```
$ node bin/skill-check.js lint all --skills packages/core/test/fixtures
✓ packages/core/test/fixtures/golden-skill

1 skill(s), 0 finding(s)          # exit code 0
```

A failing skill prints `✗ <dir>[/<scenario>]: <code> — <message>` and exits 1 (and emits `::error` GitHub annotations under `GITHUB_ACTIONS`).

## 4. Run + grade — the core loop (spends model tokens)

Runs every scenario on `pi` (skill active in `green` mode), grades each transcript with the judge, writes `results.yaml`, and prints a scorecard.

```bash
node bin/skill-check.js run golden-skill --skills packages/core/test/fixtures \
  --model fireworks:accounts/fireworks/models/deepseek-v4-pro \
  --judge claude-code:opus            # judge on the Claude subscription (no metered key)
```

- `--model prov:model` repeats for multi-model comparison (or `--models <file>`).
- `--mode green` (default; skill active) · `red` (baseline, skill off) · `force` (inject SKILL.md body).
- `--reps N` runs each scenario N times (flakiness); `--pass-threshold T` sets the pass-rate bar.
- **Judge ≠ subject** — never put the judge model in the set under test; heed any judge≈subject warning.

The scorecard shows each scenario's verdict, the letter grade + %, and **SHIP / NOT READY**. A critical-id fail or any under-pressure (`B*`) fail blocks SHIP even if the pass count clears the bar.

## 5. Review — flip verdicts, read transcripts

```bash
node bin/skill-check.js review golden-skill --skills packages/core/test/fixtures [--port N]
```

Opens a local matrix UI (model × scenario). Click cells to read transcripts + raw judge output, flip verdicts, add notes, inspect the misfire queue, view trends across runs, and one-click re-judge. Saves persist to `results.yaml`. Ctrl-C to stop. **The author owns the verdict** — the judge proposes; your overrides + notes are the durable record. Commit `results.yaml`, not transcripts.

## 6. Re-grade cheaply — before spending tokens on a re-run

```bash
node bin/skill-check.js grade <run-dir> --judge claude-code:opus
```

Re-scores the **saved transcripts** of a prior run with a (possibly different) judge — no model re-runs. Use it to de-confound a suspicious result before a fresh `run`.

## 7. Add a test case

```bash
node bin/skill-check.js add-test golden-skill --skills packages/core/test/fixtures \
  --id C1 --title "handles empty input" \
  --turn "do the thing with no args" \
  --check "asks a clarifying question" --check "does not crash" \
  [--critical] [--mode seeded --fixture path/to/repo]
```

Appends a scenario to the skill's `specification.yaml`. Gather the fields conversationally first.

## 8. The optimize loop

Edit the `SKILL.md` under test → re-`run` → compare the new scorecard to the old `results.yaml`. Report the **per-scenario delta**, not just the letter grade. Don't trust one run on a weak/stochastic model — re-run noisy scenarios (`--reps`).

## CI (consumer repos)

Add one workflow file to a skills repo to lint specs on every PR (free, static):

```yaml
name: skill-check
on: pull_request
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: mojomanyana/skill-check@v1   # until the first tagged release, pin to @main or a commit SHA
        with:
          skills-root: ./skills            # dir of skill subdirs, each with tests/specification.yaml
```

Their `tests/` folders are unchanged; the check is free/static (no `pi`, no secrets). Metered model runs in CI (manual trigger) are a separate, later tier.
