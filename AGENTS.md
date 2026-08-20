# AGENTS.md — skill-harness

> **Starting a session? Read `docs/NEXT-SESSION.md` first** — what is half-finished, what is pending a paid re-run, and the traps that only show up in CI.

Guidance for any coding agent (Claude Code, Codex, Cursor, pi, …) working in or with this repo.

**What this is:** `skill-harness` is a **test/optimize loop for agent skills**. Point it at a repo of skills; for any skill with a spec (`<skill>/tests/specification.yaml`) it runs each scenario on the `pi` harness, LLM-judges every transcript, scores it against a ship bar, opens an interactive review UI, and lets you re-run to measure a `SKILL.md` edit. It is **pi-only** (the `pi` CLI is the sole harness) and **multi-model**.

**When to use it:** the user asks to test / grade / benchmark a skill, compare models on a skill, check whether a `SKILL.md` edit helped, review a scorecard, or add a test case. It is a **dev tool for measuring skills — not a shipped skill, and not for running a skill in production.**

**Working on the project itself?** Read `docs/ROADMAP.md` first — it holds the strategy, phased task list with checkboxes, and rules (e.g. every feature ships with a post draft; nothing in the run→grade→review loop ever gets paywalled). Pick up tasks from the current phase, top-down, and check them off with date + PR/commit.

## Setup

```bash
npm install && npm run build      # Node ≥ 20; build produces packages/*/dist
```

Invoke the CLI as `node bin/skill-harness.js <cmd>`, `npm run dev -- <cmd>`, or (after `npm link`) `skill-harness <cmd>`. The launcher runs the built `dist` if present, else falls back to `npx tsx`.

**Requirements for `run`:** `pi` on `PATH` with a provider configured for the subject model (e.g. Fireworks), and a judge — by default the `claude` CLI signed into a Claude subscription (`claude-code:<model>`, no metered key); `anthropic:<model>` uses an API key instead. `lint` and `list` need **none** of this.

## Commands

```
list  <--skills root>                     which skills have a spec (● testable · ○ no spec · ✗ invalid)
lint  <skill|all> --skills root           validate specs/fixtures + results-consistency — CI gate, no models, no keys; exits non-zero on findings
run   <skill|all> --skills root [--model prov:model ...] [--mode red|green|force] [--judge prov:model] [--reps N] [--pass-threshold T] [--label name] [--parallel N] [--canary]
compare <skill|all> --reference ref|root --candidate root --model p:m --reps N  paired candidate regression (spends subject + judge)
mutation-test                             prove trajectory assertions turn red — free, offline
grade <run-dir> [--judge prov:model]      re-judge saved transcripts with a (different) judge — no model re-run
      [--auto-rejudge] [--secondary-judge p:m] [--tie-break-judge p:m]  ask untrustworthy cells again (OFF by default; prints the exact MAX extra call count first; unresolved disagreement blocks SHIP)
rescore <run-dir>...                      re-score saved reps against current spec thresholds — free, offline
regate <run-dir>...                       re-evaluate diff_contains/diff_excludes against the SAVED diffs — free, except one judge call per rep whose gate verdict flips
stability <skill|all> --skills root [--window N] [--all]  run-over-run verdict flips per scenario — free, offline, exits 0 always
restamp <skill|all> --skills root [--from <git-ref>]     one-time: record the model-visible skill digest on runs that still match — free, offline
review <skill> --skills root [--port N]   interactive matrix UI; flip verdicts + notes persist to results.yaml
add-test <skill> --skills root --id ID --title T --turn "…" [--turn …] --check "…" [--check …] [--critical] [--mode seeded --fixture path]
/skill-harness capture [skill]            (pi extension only) turn the live conversation into a regression case — free, zero model calls, preview before every write
/skill-harness judge [run-dir] [--auto-rejudge] [--secondary-judge p:m] [--tie-break-judge p:m]   full CLI parity; interactive pi shows a confirm dialog, and under -p the flag itself is the authorization
coverage <skill|all> --skills root [--strict]   which instruction sections have a DECLARED test — free, offline; --strict gates CI
affected <skill> --skills root [--base ref]     which scenarios a change could touch — free, offline; feed to run --only, or run --affected
init  <skill> --skills root [--force]                    scaffold a commented template spec (free, offline)
suggest <skill> --skills root [--model prov:model] [--force]  LLM-draft a spec from the skill's SKILL.md (spends tokens)
```

Defaults: subject `fireworks:accounts/fireworks/models/deepseek-v4-pro` · judge `claude-code:claude-opus-4-8` · mode `green` · harness `pi`. `SKILL_HARNESS_JUDGE` overrides the judge default for a repo or a shell; `--judge` beats both.

**Which modes are scored: `green` and `force`.** Both put the skill in front of the model, so both are graded against the ship bar; `red` is the baseline they are measured against and is never scored. A force run recorded by 0.4.x reads `not scored` — `rescore <run-dir>` (free, offline) writes the real grade, and `lint` names that remedy. Green and force are **not** interchangeable numbers: placement moves verdicts in both directions on identical skill text, so never pool them in one trend or scorecard claim.

**Green delivery can degrade silently; force cannot.** pi ≥ 0.83.0 delivers `--skill` by progressive disclosure (the description is in context, the instructions load on demand — "models don't always do this"), and pi accepts a nonexistent `--skill` path with exit 0 and a normal answer. A green wave can therefore measure a naked model and look plausible. When results are going to be published, prefer `--mode force`, or `--canary` (green only, one extra rep) which asks the model to quote a heading from its own instructions and aborts the run if the skill isn't reaching it. Every run records `harness_cli_version` so a reader can tell which harness produced the numbers.

**A metered judge is refused, not warned about.** `run`, `compare`, and `grade` fail fast — before any subject tokens are spent — if the judge would bill a per-token API, no matter where it came from (`--judge`, `SKILL_HARNESS_JUDGE`, or the judge a run recorded, which `grade` reuses by default). Opt in deliberately with `--allow-metered-judge`, or `SKILL_HARNESS_ALLOW_METERED_JUDGE=1` for a repo/shell. Non-billing providers are allow-listed: `claude-code` (Claude subscription) and local runtimes (`ollama`, `lmstudio`, `llamacpp`, `local`). Anything else — including a provider nobody has classified — is assumed to charge. This applies to the **judge only**: paying to run the model under test is what a run is.

`skill-harness --version` (or `-v`) prints the running version — check it before trusting numbers from a global install, and note that every run banner and `results.yaml` records `harness_version`.

**`assert.trace` / `assert.trajectory` beat a checklist item wherever the claim is mechanical.** `assert.trajectory` evaluates normalized multi-phase state/capability/workspace/evidence events; missing correlation fields are ERROR, and `mutation-test` proves its assertion classes can turn red — trajectory classes only, so it gives `assert.trace` gates no cover at all. For trace assertions, `require_calls` / `forbid_calls` / `require_subagents` / `unchanged_paths` are evaluated against a structured execution record BEFORE the judge runs, so a failing gate costs zero judge tokens — and since 0.7.0 an objective FAIL or ERROR **outranks** the judge's verdict (only an explicit author override beats it). Write the gate instead of hoping the judge reads the prose correctly: "does NOT mash them into one commit" is a fact about what happened, not a matter of opinion. Two rules when authoring them: `unchanged_paths` needs a workspace (`env.workspace: empty-git` or a fixture — the parser refuses it otherwise, offline and free), and a gate whose evidence is missing reports **ERROR**, never a pass. Verify tool names against a real captured `.trace.jsonl` before trusting a new gate: one that silently never fires is worse than no gate.

**Cost split an agent must respect:** `init`/`lint`/`list`/`rescore`/`restamp`/`stability`/`coverage`/`affected`/`mutation-test` are free static/offline commands (safe to run anytime, ideal for CI). `capture` is NOT among them and is not a CLI command at all: it is `/skill-harness capture` in the pi extension, it refuses to run without an interactive session (there is no preview step to approve in `-p`/`--mode json`, and preview-before-write is what keeps secrets out of committed files), and promoting a capture can spend subject tokens. `regate` is free too, *except* that a rep whose gate flips from fail to pass must be judged — it prints the count, and you must say so before running it. `grade` spends judge tokens only. `run`, `compare`, and `suggest` spend model tokens and need provider creds — **confirm the skill, model(s), and judge with the user before running any of them.** `run --canary` adds exactly one subject call (the delivery probe) to a green run, and it is the cheapest insurance there is: a green wave that was never delivering the skill dies for one rep instead of producing a full plausible scorecard.

**`flakiness 0.00` is not stability, and a boundary cell is not a failure.** `flakiness` is a within-run number (how much one run's reps disagreed); it cannot see a scenario that was unanimous in every run and still landed on a different side each time. Measured: two consecutive full runs, `A5` 3/3 PASS then 0/3 FAIL, `flakiness 0.00` in both. `skill-harness stability` (free, offline) reports those cells, and `lint` prints them as `info` notes (`ℹ`, `::notice`) that never fail the gate — the exit code counts only gate-failing findings, so do not "fix" a note. **Before reporting a per-scenario delta from one run, check whether that cell is a boundary cell**; if it is, say so, and re-run it with `--reps N` rather than presenting one draw as a measurement. An edit is not a flip: steps where the scenario's own stimulus/rubric/fixture changed are excluded and reported as edits, so a note is never just "you changed the skill".

**Match the remedy to the drift — lint tells you which.** A `stale` finding names the cheapest honest fix: `stimulus:` → `run` (costs tokens), `rubric:` → `grade` (judge only), `policy:` → `rescore` (free), `gates:` → `regate` (free). Never reach for `run` when lint asked for one of the other three; that is exactly the waste the split exists to remove. **A `SKILL.md`/agent-file `stale` on a corpus recorded before 0.8.0 may be pure frontmatter drift**, which no run can observe: those records hash raw bytes, so `allowed-tools:`-style edits still fire. Try `restamp <skill|all> --skills root --from <the ref the runs were green at>` (free, offline) before spending a wave — it upgrades every record whose model-visible text provably has not moved, and refuses the rest. (`suggest` and the default judge both run on `claude-code:claude-opus-4-8`: no metered key, but they do spend the user's subscription. A `--judge anthropic:…` run bills an API key — say so before running it.)

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
      - uses: mojomanyana/skill-harness@latest   # newest release; pin a version tag to freeze — see below
        with: { skills-root: ./skills }
```

**Two refs, and the choice is a real one.** `@latest` is a tag moved to each
release, so you get new checks as they ship; any release tag (`@vX.Y.Z`) freezes.

There is deliberately **no `@v1`**: `lint` is a CI gate, so a release that adds a
check turns a passing repo red, and a "stable major that moves forward" would
promise precisely what a linter cannot deliver. `@latest` makes no such promise —
it says only "newest release", which is true.

Pin when you want to choose *when* new checks land: worth it once a repo's
scorecard is a published claim, so that a red CI means "my skills changed" rather
than "the harness changed under me", and so an old CI run stays reproducible.
`@latest` is the better default while a repo is still iterating, and it keeps CI
at least as new as whatever wrote the committed `results.yaml` — a file written
by version X needs version ≥ X to lint (see `PUBLISHING.md`).

## Pointers

- **`SKILL.md`** — the pi front door (install via `pi install https://github.com/mojomanyana/skill-harness`); drives the loop conversationally.
- **`docs/USAGE.md`** — the step-by-step human walkthrough (setup → list → lint → run → review → grade → add-test).
- **`README.md`** — overview, spec format, results schema.
- Working on the codebase itself: `npm test` (vitest), `npm run typecheck`; the monorepo is `packages/core` (engine), `packages/adapters` (pi + claude-code judge), `packages/cli` (commands + review server), `packages/pi-extension` (the pi extension; its `dist/index.js` is a committed esbuild bundle — regenerate with `npm run build:ext` and commit it whenever the bundled core/cli source changes; a `bundle.test.ts` guard fails if it goes stale).
