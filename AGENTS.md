# AGENTS.md — skill-harness

Guidance for any coding agent (Claude Code, Codex, Cursor, pi, …) working in or with this repo.

**What this is:** `skill-harness` is a **test/optimize loop for agent skills**. Point it at a repo of skills; for any skill with a spec (`<skill>/tests/specification.yaml`) it runs each scenario on the `pi` harness, LLM-judges every transcript, scores it against a ship bar, opens an interactive review UI, and lets you re-run to measure a `SKILL.md` edit. It is **pi-only** (the `pi` CLI is the sole harness) and **multi-model**.

**When to use it:** the user asks to test / grade / benchmark a skill, compare models on a skill, check whether a `SKILL.md` edit helped, review a scorecard, or add a test case. It is a **dev tool for measuring skills — not a shipped skill, and not for running a skill in production.**

## Setup

```bash
npm install && npm run build      # Node ≥ 20; build produces packages/*/dist
```

Invoke the CLI as `node bin/skill-harness.js <cmd>`, `npm run dev -- <cmd>`, or (after `npm link`) `skill-harness <cmd>`. The launcher runs the built `dist` if present, else falls back to `npx tsx`.

**Requirements for `run`:** `pi` on `PATH` with a provider configured for the subject model (e.g. Fireworks), and a judge (Anthropic API, or `claude-code:<model>` to judge on the Claude subscription with no metered key). `lint` and `list` need **none** of this.

## Commands

```
list  <--skills root>                     which skills have a spec (● testable · ○ no spec · ✗ invalid)
lint  <skill|all> --skills root           validate specs/fixtures + results-consistency — CI gate, no models, no keys; exits non-zero on findings
run   <skill|all> --skills root [--model prov:model ...] [--mode red|green|force] [--judge prov:model] [--reps N] [--pass-threshold T] [--label name] [--parallel N]
grade <run-dir> [--judge prov:model]      re-score saved transcripts with a (different) judge — no model re-run
review <skill> --skills root [--port N]   interactive matrix UI; flip verdicts + notes persist to results.yaml
add-test <skill> --skills root --id ID --title T --turn "…" [--turn …] --check "…" [--check …] [--critical] [--mode seeded --fixture path]
```

Defaults: subject `fireworks:accounts/fireworks/models/deepseek-v4-pro` · judge `anthropic:claude-opus-4-8` · mode `green` · harness `pi`.

**Cost split an agent must respect:** `lint`/`list` are free static checks (safe to run anytime, ideal for CI). `run` spends model tokens and needs provider creds — **confirm the skill, model(s), and judge with the user before running it.**

## Rules (do not violate)

1. **Judge ≠ subject.** Never put the judge model in the set being tested — same-family grading inflates scores. Heed any judge≈subject warning.
2. **Critical + B-series gate the ship.** A critical-id fail or any under-pressure (`B*`) fail blocks SHIP even if the pass count clears the bar.
3. **The author owns the verdict.** The judge proposes; the human's overrides + notes in the review UI are the durable record. Commit `results.yaml`, not transcripts.
4. **Re-grade cheaply before re-running.** `grade <run-dir> --judge <m>` re-scores existing transcripts — de-confound a suspicious result before spending tokens on a fresh `run`.
5. **Don't trust one run on a weak/stochastic model.** Re-run noisy scenarios (`--reps N`); a single pass/fail is not a signal.
6. **You measure the skill; you don't edit it** unless asked. The human edits the `SKILL.md` under test; you re-run and report the per-scenario delta.

## CI

A consumer skills-repo adds one workflow file to lint specs on every PR (free, static — no models/secrets):

```yaml
name: skill-harness
on: pull_request
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: mojomanyana/skill-harness@v1   # v1 = stable major tag (moves forward); pin a commit SHA to lock
        with: { skills-root: ./skills }
```

## Pointers

- **`SKILL.md`** — the pi front door (install via `pi install https://github.com/mojomanyana/skill-harness`); drives the loop conversationally.
- **`docs/USAGE.md`** — the step-by-step human walkthrough (setup → list → lint → run → review → grade → add-test).
- **`README.md`** — overview, spec format, results schema.
- Working on the codebase itself: `npm test` (vitest), `npm run typecheck`; the monorepo is `packages/core` (engine), `packages/adapters` (pi + claude-code judge), `packages/cli` (commands + review server), `packages/pi-extension` (the pi extension; its `dist/index.js` is a committed esbuild bundle — regenerate with `npm run build:ext` and commit it whenever the bundled core/cli source changes; a `bundle.test.ts` guard fails if it goes stale).
