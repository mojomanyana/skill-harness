# skill-harness — step-by-step usage

A verified walkthrough of setting up and using `skill-harness` locally. `skill-harness` runs a spec'd agent skill's scenarios on the `pi` harness, LLM-judges each transcript, scores it against a ship bar, and lets you review + re-run to measure a `SKILL.md` edit.

> Agents: see [`AGENTS.md`](../AGENTS.md) for the condensed, rules-first version. pi users: `pi install` the repo and drive it conversationally via [`SKILL.md`](../SKILL.md).

## 0. Requirements

- **Node ≥ 20.**
- For **`run`** only: **`pi` on your `PATH`** (`pi --version`) with a provider configured for the model under test (e.g. Fireworks), and a judge — either an Anthropic API key or the Claude CLI (`claude`) for `claude-code:<model>` (judges on the Claude subscription, no metered key).
- **`lint` and `list` need neither `pi` nor any API key** — they are pure static checks.

## 1. Set up (one time)

```bash
git clone https://github.com/mojomanyana/skill-harness
cd skill-harness
npm install
npm run build        # tsc — produces packages/*/dist
```

Invoke the CLI three ways:
- `node bin/skill-harness.js <cmd>` — the launcher (uses the built `dist`, else falls back to `npx tsx`).
- `npm run dev -- <cmd>` — dev, straight from source via tsx.
- `npm link` once, then `skill-harness <cmd>` — a global command.

Examples below use `node bin/skill-harness.js` against the bundled fixture skill (`packages/core/test/fixtures/golden-skill`) so you can reproduce them with no external skills repo.

## Scaffolding a spec

New skill with no spec? Two ways to get a `tests/specification.yaml`:

- `skill-harness init <skill> --skills <root>` — writes a commented template to fill in. Free, offline.
- `skill-harness suggest <skill> --skills <root>` — reads the skill's `SKILL.md` and LLM-drafts scenarios, a checklist, and a *proposed* critical set for you to review. Spends model tokens; defaults to `claude-code:claude-opus-4-8` (no metered key if the `claude` CLI is signed in). Override with `--model prov:model`.

`suggest` never marks scenarios critical for you and never auto-runs — review the draft (especially the proposed critical set commented at the top), then `run`.

## 2. Discover testable skills

A skill is testable when `<skill>/tests/specification.yaml` exists next to its `SKILL.md`. Discovery scans `<root>/*/tests/specification.yaml`.

```
$ node bin/skill-harness.js list --skills packages/core/test/fixtures
skills under packages/core/test/fixtures:
  ● golden-skill  (2 scenarios)

● = testable · ○ = no spec yet · ✗ = spec present but invalid
```

## 3. Lint — the free CI gate (no models, no keys)

Validates spec schema, ship-bar sanity, critical-id existence, fixture paths, and results-consistency (for any committed `results.yaml`). **Exits non-zero on any gate-failing finding** — this is what CI gates on. It also prints `info` **notes** (`ℹ`), which report something worth knowing that is not a defect — today: run-over-run boundary cells (§4f). Notes never change the exit code.

```
$ node bin/skill-harness.js lint all --skills packages/core/test/fixtures
✓ packages/core/test/fixtures/golden-skill

1 skill(s), 0 finding(s)          # exit code 0
```

A failing skill prints `✗ <dir>[/<scenario>]: <code> — <message>` and exits 1 (and emits `::error` GitHub annotations under `GITHUB_ACTIONS`). A note prints `ℹ` and emits `::notice`; the summary line counts them separately (`0 finding(s), 1 note(s) (do not fail the gate)`).

## 4. Run + grade — the core loop (spends model tokens)

Runs every scenario on `pi` (skill active in `green` mode), grades each transcript with the judge, writes `results.yaml`, and prints a scorecard.

```bash
node bin/skill-harness.js run golden-skill --skills packages/core/test/fixtures \
  --model fireworks:accounts/fireworks/models/deepseek-v4-pro \
  --judge claude-code:opus            # judge on the Claude subscription (no metered key) — the default
  --judge anthropic:claude-opus-4-8 --allow-metered-judge   # deliberately use a metered API key
```

- `--model prov:model` repeats for multi-model comparison (or `--models <file>`).
- `--mode green` (default; the harness activates the skill) · `force` (SKILL.md as the system prompt) · `red` (baseline, skill off). **Green and force are both scored**; red is the control and never gets a grade. See §4e for which one to publish.
- `--canary` (green only) spends one extra call proving the skill reached the model, and aborts the run if it didn't.
- After the run, the scorecard flags any scenario that flipped its verdict since the last comparable run (§4f) — one run of such a cell is one draw, whatever its flakiness said.
- `--reps N` runs each scenario N times (flakiness); `--pass-threshold T` sets the ordinary pass-rate bar. Critical scenarios always require every clean repetition to pass. Judge/API/tooling ERROR remains ERROR and cannot be voted into a behavioral pass or failure.
- **Judge ≠ subject** — never put the judge model in the set under test; heed any judge≈subject warning.

The scorecard shows each scenario's verdict, the letter grade + %, and **SHIP / NOT READY**. A critical-id fail or any under-pressure (`B*`) fail blocks SHIP even if the pass count clears the bar.

## 4b. Lift — does the skill actually do anything?

A grade on its own can't tell you whether the skill helped. A capable model may pass your scenarios with the skill switched off entirely, and you'd read the resulting `A` as proof the `SKILL.md` works. **Lift** is the fix: run the same scenarios with the skill off, then compare.

```bash
node bin/skill-harness.js run golden-skill --skills <root> --mode red     # baseline, skill off
node bin/skill-harness.js run golden-skill --skills <root> --mode green   # skill active
```

The green scorecard then ends with a `LIFT:` line, and the review UI shows it per model column with `↑ skill` / `↓ skill` markers on the scenarios that changed:

```
  GRADE: B (80%) — 4/5 — NOT READY
  LIFT:  +2 net (3 gained, 1 regressed) · 1 inconclusive  (vs red baseline 2026-08-04T…)
```

- **gained** — failed without the skill, passes with it. This is the skill working.
- **regressed** — passed without the skill, fails with it. The skill actively hurt here.
- **kept** — passed either way. The model never needed the skill for this one.
- **inconclusive** — an `ERROR` or an unresolved judge misfire on either side. Deliberately *not* counted as a gain: an ERROR is a harness failure, not evidence the skill-less agent couldn't do the task, and counting it would let infrastructure noise inflate your lift.
- **not comparable** — dropped *before* classification and named in the headline instead, in two cases. Either the harness ran the scenario identically in both modes (a `system_prompt_file` scenario is its own system prompt, so the skill is loaded on the red side too), or the two sides were aggregated differently — a red baseline at `--reps 1` against a green run at `--reps 3`, or the same reps under different pass thresholds. Both would otherwise be a number that describes the harness rather than the skill.

**Run the baseline the same way you ran green.** A one-rep verdict is a single draw and a three-rep verdict is a majority over three, so `red FAIL → green PASS` across that gap can be sampling alone. Mismatched cells are excluded and the headline tells you what to re-run:

```
  LIFT:  nothing comparable (5 shared, red 1 rep vs 3 reps — re-run the baseline with --reps 3)
```

Lift is computed from whatever runs are on disk, so a baseline recorded weeks ago still counts, and it needs no re-run to appear. Only scenarios present in **both** runs are compared. With no red run at all, the report says `no red baseline` rather than showing a zero — "not measured" and "measured no effect" are different claims, and a baseline that exists but cannot be used is a third (`lift not comparable`).

## 4c. Staleness — and the cheapest honest way back

Every run records a sha256 of what it measured, and `lint` compares those against the
current sources. What changed decides **which command restores freshness**, and only one
of the four costs model tokens:

| what drifted | recorded as | remedy | cost |
|---|---|---|---|
| turns, mode, fixture path, `assert.vitest`, agent file, `SKILL.md`, fixture contents | `stimulus:<id>` (+ path keys) | `run` | subject + judge |
| a checklist item, a title, `judge_persona` | `rubric:<id>`, `rubric:__persona` | `grade <run-dir>` | judge only |
| `critical`, `reps`, `pass_threshold` | `policy:<id>` | `rescore <run-dir>` | free, offline |
| a `diff_contains` / `diff_excludes` needle | `gates:<id>` | `regate <run-dir>` | no subject call; one judge call per fail→pass rep |

The lint message names the remedy, so you never have to work it out:

```
✗ golden/A1: stale — the rubric for `A1` changed since the newest pi-deepseek run
  (…) — results are stale; re-grade from the saved transcripts (`grade <run-dir>`)
  — judge-only, no model spend
```

Before this split, every one of those said "re-run" — which meant correcting a one-word
checklist mistake cost a full model pass, and that is pressure to leave a known-bad
rubric in place. The gate is exactly as strict as it was; only the price of getting back
to fresh changed.

### `regate` — fix a needle without re-running anything

`diff_contains` / `diff_excludes` are pure functions of the staged diff, and every seeded
rep saves its diff as an artifact. So a wrong needle is answerable from what is already
on disk:

```bash
skill-harness regate tests/results/pi-deepseek-v4-pro/2026-08-05T…
```

Per rep, one of four things happens — and only the last one costs anything:

- gate still fails → `FAIL` with the corrected reason (free)
- gate now fails where it passed → `FAIL`, no judge call (the gate is objective)
- gate passed before and still passes → the rep's saved judgement is re-read from its
  judge-raw artifact (free, and exact — it does not re-ask)
- gate blocked the rep before and now passes → judged now, because no judgement of that
  rep exists anywhere (one judge call)

Measured on a real needle fix: **9 judge calls instead of 81 rep-executions across three
models.** `regate` performs those calls while it runs and reports the count afterward;
confirm the possible judge spend before invoking it.

**Limits.** `assert.vitest` and `assert.post_test` need the workspace and cannot be
re-evaluated from any artifact — a scenario carrying either needs a `run`, and `regate`
says so rather than half-working. Diff and judge-raw artifacts are gitignored, so regate
works wherever the run dirs live (the machine that ran it, or CI that just did).

The regenerated `=== SEEDED GATES ===` trailer is harness-generated annotation appended
after the model's turns, not model output; the pre-regate transcript is kept beside it as
`…​.pre-regate.txt` so the audit trail does not rest on that distinction.

## 4d. Which harness produced a number

`results.yaml` records `harness_version` (this tool) and `harness_cli_version` (the
harness CLI it drove — `pi --version`), and the run banner and `--version` both print the
former. `schema` cannot answer either question: 0.2.1 → 0.3.0 kept `schema: 2` while
changing what a verdict *means*.

`harness_cli_version` exists because of §4e: a pi upgrade changed what green mode
measures, and the two waves it invalidated are indistinguishable from valid ones in the
committed artifacts, because nothing recorded which pi ran. It is written by `run` only —
`grade`, `rescore` and `regate` carry it forward untouched, since re-deciding a verdict
does not re-deliver a skill.

That enables a tripwire. If a results tree holds records written by a **newer**
skill-harness than the one you are running, `run` refuses (its numbers would not be
comparable) while `grade` and `lint` warn and continue — they are how you diagnose it. A
stale global install is otherwise invisible: a 0.1.0 binary grading a 0.3.x corpus
produces entirely plausible numbers.

## 4e. Green or force — and why it matters more than it sounds

| mode | how the skill arrives | scored? | can it degrade silently? |
|---|---|---|---|
| `green` | `pi --skill <dir>` — the harness activates it | yes | **yes** — see below |
| `force` | `pi --append-system-prompt <SKILL.md>` | yes | no |
| `red` | not at all (`--no-skills`) | no — it is the control | n/a |

**The measured failure.** pi 0.80.x wrapped a `--skill` prompt with the skill body. pi
0.83.0 delivers it by *progressive disclosure*: only the skill's description is always in
context, and the instructions load on demand — which pi's own docs note "models don't
always do". pi also accepts a **nonexistent** `--skill` path silently (exit 0, a normal
answer). Green mode therefore stopped putting one corpus's skills in front of the model,
and two full waves ran before anyone noticed: the affected skill scored ≈ its own
no-skill baseline while looking entirely plausible. The only tell was a contradictory
failure mix — over-ceremony and capitulation at once — that no single skill edit produces.

**What the harness does about it now.** New runs use results schema 3. The Pi adapter loads a read-only observation extension last and computes delivery from final provider-payload prompt fields; callers never supply the status. Each provider request records contract SHA-256/bytes/occurrences, mechanism, and raw plus normalized prompt digests. `cwd-line-v1` is the first named normalization registry rule: it replaces exactly the `Current working directory:` line. The payload text itself is not retained.

- the pi adapter **refuses** a skill dir with no `SKILL.md` rather than letting pi swallow
  the flag, and resolves the path first (a relative `--skills .` used to hand a child
  process a path that meant nothing in its cwd);
- every run records `harness_cli_version`;
- `--canary` spends one probe before the wave — "list the `## ` headings of your
  instructions" — and aborts if the reply doesn't contain them. It proves the body is
  *reachable*; under progressive disclosure nothing can prove the model read it on every
  later turn, which is exactly why the next bullet exists;
- `--mode force` is delivery that no pi version has made conditional. If a scorecard is
  going to be published, this is the mode to publish.

**Don't pool the two.** Placement is not a formatting detail: on identical skill text,
moving green → force took one skill's discipline scenario from 0/3 to 3/3 while dropping
another skill's right-sizing scenario from 3/3 to 0/3. Stronger adherence lifts discipline
scenarios and breaks right-sizing governors at the same time. The review UI keeps one
trend series per mode for that reason, and a lift says which delivery it measured.

**Scoring force runs you already have.** Force was unscored before 0.5.0, so runs recorded
by 0.4.x read `effective_grade: not scored`. Nothing needs re-measuring — the rep data is
on disk:

```bash
node bin/skill-harness.js rescore <run-dir> [<run-dir> ...]   # free, offline, no judge
```

`lint` flags those runs as `consistency — effective_grade is stale … rescore (free,
offline)` until you do.

## 4f. Stability — is one run of this cell worth anything?

`--reps N` gives you `flaky 0.00`, and it is easy to read that as "settled". It is not:
flakiness is a **within-run** number. Measured on two consecutive full force runs of the
reference corpus, nothing relevant edited in between:

| scenario | 2026-08-05 | 2026-08-06 | flakiness |
|---|---|---|---|
| `A5` | 3/3 PASS | 0/3 FAIL | `0.00` both runs |
| `D1` | 1/3 FAIL | 3/3 PASS | `0.00` in the second |

Unanimous, twice, in opposite directions. A scenario on a behavioural boundary does that,
and no single `results.yaml` can show it, because the evidence lives across files.

```bash
node bin/skill-harness.js stability golden-skill --skills packages/core/test/fixtures [--window 5] [--all]
```

Free and offline: it reads committed `results.yaml` files and computes. Per model tag ×
delivery mode (never pooled — placement moves verdicts), each scenario lands in one of
three states:

| state | means |
|---|---|
| `boundary` | flipped at least once across a comparable step — one run of it is one draw |
| `stable` | held its verdict across every comparable step in the window |
| `unmeasured` | one run, or no comparable step — **not** the same claim as stable |

Read the path as `PASS!→FAIL!`: `→` a step that counted, `⋯` a step that did not, `!` a
run whose reps were unanimous.

**An edit is not a flip.** A step is only counted when the recorded `source_hashes` show
the scenario's own stimulus, rubric, gates, fixture and judge persona were identical, and
when both runs aggregated the same way. Everything else is reported *with its reason*
rather than dropped:

```
D1 has no comparable run-to-run step: 1 step(s) where the scenario's own sources changed
  (../../agents/plan.md changed — an edit, not a flip)
```

`SKILL.md` is deliberately not one of those gates: in the case above the skill text *had*
changed — an edit aimed at a different scenario — while A5's own stimulus and rubric were
byte-identical, so gating on it would have hidden the finding. That flip is reported with
both readings named, because the record cannot say which is true:

```
⇄ CRITICAL A5 flipped its verdict in 1 of 1 comparable run-to-run step(s) (PASS!→FAIL!);
  each flip was between runs that were INTERNALLY UNANIMOUS (flakiness 0.00) — within-run
  reps cannot see this; SKILL.md changed across that step, while this scenario's own
  stimulus and rubric did not — so it is either a side effect of that edit or a boundary
  cell, and the record cannot say which
```

It also shows up without being asked for: a `⇄` line under a fresh run's scorecard, a
`⇄ n/m` marker on the review-matrix cell with the note as its tooltip, and a `lint` note.

**Notes never fail the gate.** `lint` prints stability findings with severity `info`
(`ℹ`, and `::notice` in GitHub Actions); the skill keeps its `✓` and the exit code counts
only gate-failing findings. A boundary cell is not a broken spec — the remedy is `--reps`
on that scenario, or an override with a note once you have decided which side is right.

## 4g. Screen retained evidence before buying another run

```bash
node bin/skill-harness.js screen <run-dir> [<run-dir> ...]
```

`screen` is free, offline, and read-only: it never resolves an adapter and makes zero subject or judge calls. From schema-v3 fields alone it groups by skill × model × scenario, reports delivery-proven control and treatment pass rates, and reports each retained criterion's fail rate. Control ≥80% is `CEILING`, ≤10% is `FLOOR`, 20–70% is `INFORMATIVE`; incomplete, legacy, or inconclusive evidence is `UNKNOWN`. An informative baseline means headroom exists, not that the skill helps.

Schema 1/2 records remain valid and byte-identical, but cannot acquire prompt/vote evidence that was never retained. Reading never upgrades them. Re-running writes schema 3; `grade`, `rescore`, `regate`, adjudication, and review carry the observations without re-attributing delivery.

## 5. Review — flip verdicts, read transcripts

```bash
node bin/skill-harness.js review golden-skill --skills packages/core/test/fixtures [--port N]
```

Opens a local matrix UI (model × scenario). Click cells to read transcripts + raw judge output, flip verdicts, add notes, inspect the misfire queue, view trends across runs, and one-click re-judge. Saves persist to `results.yaml`. Ctrl-C to stop. **The author owns the verdict** — the judge proposes; your overrides + notes are the durable record. Commit `results.yaml`, not transcripts.

## 6. Re-grade cheaply — before spending tokens on a re-run

```bash
node bin/skill-harness.js grade <run-dir> --judge claude-code:opus
```

Re-scores the **saved transcripts** of a prior run with a (possibly different) judge — no model re-runs. Use it to de-confound a suspicious result before a fresh `run`. It reads the transcripts of the run's own mode, so a force run and a red baseline are both re-gradable, and a force run comes back scored.

## 6b. Judge agreement — offline after two distinct grades

A normal `grade` now retains the prior full-cell verdict before replacing it. After the
same saved run has been graded by two distinct judges, report agreement without making
another call:

```bash
node bin/skill-harness.js judge-agreement <run-dir>
```

It prints agree/disagree/error per scenario and an aggregate; missing, suspect, or
ambiguous votes are errors, never agreements. Start with
`openai-codex:gpt-5.6-sol` against `claude-code:claude-opus-4-8`; both are
subscription-backed with zero marginal per-token cost. Open-weight judges remain a
secondary tier until this report measures their agreement. Structured results record
`metrics.cost_source`; positive tokens plus zero recorded cost warn unless the provider
is a recognized subscription provider.

## 7. Add a test case

```bash
node bin/skill-harness.js add-test golden-skill --skills packages/core/test/fixtures \
  --id C1 --title "handles empty input" \
  --turn "do the thing with no args" \
  --check "asks a clarifying question" --check "does not crash" \
  [--critical] [--mode seeded --fixture path/to/repo]
```

Appends a scenario to the skill's `specification.yaml`. Gather the fields conversationally first.

### `/skill-harness capture` — turn the conversation you're in into a test

Inside a pi session, when the agent has just done something wrong (or something
right that you want to keep working):

```
/skill-harness capture [skill]
```

It reads the **active branch** of the session, groups it into logical turns, and
walks you through: pick a contiguous turn range → confirm which instructions were
responsible → mark it `failure` or `good_example` → write what it *should* have
done → edit the drafted checklist → **preview the whole case** → save as pending,
promote to a scenario, or cancel.

**Free.** Zero model calls; the checklist draft is a sentence splitter, not a
model. The only spend is the optional "run just this scenario now?" at the end,
which names the cost before asking.

Two things worth knowing:

- **A pending capture is not a test yet.** It lives in `<skill>/tests/captures/`,
  outside `specification.yaml`, so it cannot touch ship-bar totals, staleness,
  lift or stability until you promote it.
- **Only your user turns are committed.** The model's reply is evidence for
  writing the expectation, not an oracle to match against — it goes to a
  git-ignored `.local/` sidecar. Hidden thinking, tool-result bodies, secrets and
  home paths are stripped before anything is written, and the preview is your
  chance to check that.

Requires an interactive session: under `-p` / `--mode json` there is no preview
step, so `capture` refuses rather than writing unreviewed.

## 7b. Objective gates — assert what the model DID

An LLM judge reading a transcript can only grade what the model *said*.
`assert.trace` grades what it **did**, from a structured record of the run:

```yaml
scenarios:
  - id: R1
    title: delegates authentication diagnosis
    turns:
      - "Find why authentication is failing."
    checklist:
      - integrates the planning subagent's recommendation

    env:
      workspace: empty-git         # required: `unchanged_paths` needs a tree to observe
      extensions:                     # closed loading: ONLY these load
        - ../../.pi/extensions/subagents/index.ts

    assert:
      trace:
        require_subagents:            # selection + handoff, objectively
          - tool: Agent
            agent: plan
            task_contains: ["authentication"]
            task_excludes: ["password"]
        forbid_calls:
          - write
        unchanged_paths:
          - ".env"
```

Also available: `require_calls` (any tool, with `count: {min,max}` and argument
predicates `equals` / `contains` / `starts_with` / `ends_with` / `matches` /
`exists` / `any`).

**A failed gate costs zero judge tokens** — assertions run before the judge, so a
scenario that called a forbidden tool fails on evidence and nothing is asked.

**Missing evidence is `ERROR`, never a pass.** An adapter that can't trace, a run
that produced no trace, an unreadable saved trace — all `ERROR`. A result with no
`objective` block means *no assertions were declared*, not that they passed.

**Editing an assertion needs no subject re-run** (`regate` reads the saved
`.trace.jsonl`, but may judge fail→pass reps). **Editing an extension is different** — it changes what the model could
do, so it's stimulus and needs a re-run. Lint names the right remedy for each, and
extension *contents* are hashed, so editing your subagent tool marks results stale
even though the spec didn't change.

**What a trace does not prove:** it proves a registered tool was called with given
arguments. It says nothing about what that tool then did to the machine — a `bash`
command string is not a filesystem audit. For a real path policy, forbid `bash` or
assert on `unchanged_paths`.

## 7c. Workflow trajectories — state, authority, and fresh evidence

`assert.trajectory` is the multi-phase counterpart to `assert.trace`. The pi adapter normalizes pi
tool events, principal assurance v1 events, and current pi-daddy grant/governance ledgers into one
versioned event model. Assertions can require/forbid events, order transitions, correlate
run/task/workspace/context IDs and distinct head/tree identities, enforce freshness after the last
change/authority/Build completion, prove lease and approval lifecycle, reject superseded-task
mutation, and verify finalization.

```yaml
env:
  workspace: empty-git
  event_sources:
    - adapter: principal-assurance-v1
      path: .git/principal-pi-skills/assurance-v1/runs/*/events.jsonl
assert:
  trajectory:
    version: "1.0"
    ordered:
      - [{ event: phase_started, where: { phase: build } }, { event: code_changed }, { event: phase_completed, where: { phase: build } }, { event: evidence_recorded }]
    correlate:
      - left: { event: code_changed, select: last }
        right: { event: evidence_recorded, select: last }
        same: [run_id, task_id, workspace_id, digests.head, digests.tree]
```

A missing field needed for governance is `ERROR`, never success. Gates run before the judge and are
replayable with `regate` from `.events.jsonl`. Run the free evaluator proof any time:

```bash
node bin/skill-harness.js mutation-test
```

It detects 42 permanent mutations: the original 21 trajectory cases plus schema-v3 rejection, delivery zero/duplicate/unobservable outcomes, objective judge suppression, observer normalization/contract/extension provenance, and screen classification/filtering. The command remains free and offline.
Full schema and adapter details: [`ASSURANCE-WORKFLOWS.md`](ASSURANCE-WORKFLOWS.md).

## 7d. Paired reference-versus-candidate comparison

```bash
node bin/skill-harness.js compare build \
  --reference main --candidate ../principal-pi-skills \
  --model fireworks:accounts/fireworks/models/deepseek-v4-pro \
  --reps 3 --mode force
```

This **spends subject and judge calls**; confirm the skill, model(s), and judge first. Both sides use
the same scenario/spec/fixture/model/mode/judge/repetition plan and remain independently inspectable
under `.skill-harness/comparisons/`. Reports include exact digests, per-scenario lift/regression and
flakiness, token/tool/judge/wall metrics where available, and explicit cost thresholds separate from
behavior. This is paired setup, not provider-seeded deterministic sampling.

Exit 2 means a critical regression; exit 1 an ordinary ship-bar/behavioral regression or unresolved
infrastructure error. `--only` and `--affected` are branch feedback and can never report SHIP.

## 7e. Coverage + affected — which instructions have no test (free, offline)

Opt a scenario in with `covers`:

```yaml
scenarios:
  - id: A1
    title: politeness
    covers: ["../SKILL.md#core-principle"]
```

```bash
node bin/skill-harness.js coverage <skill|all> --skills <root> [--strict]
node bin/skill-harness.js affected <skill> --skills <root> [--base <git-ref>]
node bin/skill-harness.js run <skill> --skills <root> --affected --base <git-ref>
```

```
demo: 2/3 sections have a declared test (67%)

  no test declares coverage of:
    ../SKILL.md#demo  (Demo)

  `covers` records a declared link, not proof the behaviour is tested.
```

**It is DECLARED coverage, not proof.** A `covers` entry records that somebody
associated a test with a section — not that the behaviour is tested, still less
tested well. `--strict` (which exits non-zero on uncovered sections) is opt-in for
exactly that reason. A **broken** reference fails regardless of `--strict`, since
that's a wrong statement in the spec rather than a gap; renaming a heading is the
usual cause, so the finding suggests near-miss slugs.

`affected` reads `git diff --unified=0 <base>`, maps changed lines to heading
sections, reverses the `covers` map, and prints a **reason per scenario**:

```
selected 2/3 scenario(s):
  A2  covers skills/demo/SKILL.md#edge-cases
  B1  B-series (always run)

an affected run is partial and never reports SHIP — a full run still gates a release
```

**Selection always errs toward more**, because under-inclusive means shipping a
regression while over-inclusive only costs tokens:

- every **critical** and **B-series** scenario runs, whatever the diff said;
- a scenario with **no `covers`** is always selected — there's nothing to consult;
- a changed **fixture / post-test / agent file / extension** selects its scenario;
- a referenced file that was **renamed or deleted**, or a **wholesale rewrite**,
  selects *everything*.

`run --affected` reuses `--only`, so it's partial and can never report SHIP. Use it
to iterate; a full run still gates a release.

**`covers` costs nothing to change** — it's in no staleness facet. Editing it
changes what `--affected` selects next time, not what any past run measured.

## 7f. Confidence-aware rejudging — when one judge isn't enough

Re-judging saved transcripts holds the model constant, so movement is the judge. Ours
disagreed with itself in **1 of 57 judgments (~2%)** — and the one that mattered was a
published FAIL that turned out to be a 1-in-7 minority draw, the difference between a
skill reading 93% and 100%.

```bash
node bin/skill-harness.js grade <run-dir> --auto-rejudge \
  --secondary-judge claude-code:claude-opus-4-8 \
  --tie-break-judge claude-code:claude-opus-4-8
```

Four triggers, computed from the **complete** first wave:

| Trigger | Fires when |
|---|---|
| `ambiguous` | the judge's verdict blocks disagree, or nothing parseable came back |
| `contradictory` | the overall verdict disagrees with its own per-item grades (the misfire) |
| `non_unanimous` | the reps split — 2 PASS + 1 FAIL is not a settled result |
| `ship_deciding` | flipping this one cell would change SHIP ⇄ NOT READY |

`ship_deciding` is a counterfactual against the **real scorer**, so min-pass, critical
and B-series all move it.

**Off by default. Spec configuration alone never authorizes a judge call** — the only
switch is `--auto-rejudge`. The preflight prints the ceiling before the first extra call:

```
adjudication: 1 cell(s) triggered — up to 1 additional judge call(s)
  secondary judge: claude-code:claude-opus-4-8
  no tie-break judge — a disagreement stays unresolved and blocks SHIP
  A4: contradictory
```

**That is a call count, not a dollar figure, on purpose.** The default judge is your
Claude subscription and reports no per-call usage back to the harness, so a dollar
estimate would be invented. (Metered reference, measured on the real corpus: ~760 input
/ ~130 output tokens per call ≈ $0.008 at Opus rates.)

Every configured judge passes the same gates as the primary — metered refusal and
judge≠subject.

**Three outcomes:**

- **confirmed** — two clean votes agree; suspect cleared.
- **tie_broken** — a clean two-of-three majority; suspect cleared.
- **unresolved** — anything else: `suspect: true`, which **blocks SHIP** through the
  existing gate rather than a second one.

**A malformed answer is not a vote.** Ambiguous and misfired judgments are recorded in
full and never counted — so when the *first* wave misfired, a cell needs **two** fresh
judgments to agree. A misfire cannot confirm itself.

Caps at 3 judgments per cell. Adjudicates one documented rep, never the rep that would
move the headline. **Human overrides survive untouched** — a judge panel does not
outvote the author.

## 8. The optimize loop

Edit the `SKILL.md` under test → re-`run` → compare the new scorecard to the old `results.yaml`. Report the **per-scenario delta**, not just the letter grade. Don't trust one run on a weak/stochastic model — re-run noisy scenarios (`--reps`).

Before you attribute a delta to your edit, check `stability` (§4f): a cell that flips between runs on unchanged text will also flip across an edit, and reading that as "my change did this" is the mistake the whole section exists to prevent.

## Environment variables

All optional — the defaults are what you want unless a slow model or a headless
box says otherwise.

| Variable | Default | What it does |
|---|---|---|
| `SKILL_HARNESS_PI_TIMEOUT_MS` | `300000` (5 min) | Per-scenario ceiling on one `pi` invocation. Raise it for slow/thinking models; a hit shows up as an `ERROR`, not a `FAIL`. |
| `SKILL_HARNESS_VITEST_TIMEOUT_MS` | `120000` (2 min) | Ceiling on the `vitest` objective gate inside a seeded scenario. |
| `SKILL_HARNESS_NO_OPEN` | unset | Any non-empty value stops `review` from launching a browser. Set it on headless/CI boxes and over SSH. |
| `SKILL_HARNESS_DIFF_MAX_BYTES` | `64000` | Byte cap on the staged diff embedded in a seeded scenario's judged transcript, so a huge diff can't overflow the judge's context. Truncation is marked inline; the `.diff.txt` artifact on disk is never capped. |

These were named `SKILL_CHECK_*` in 0.1.x. The old names still work, and using one
prints a one-time notice telling you the new spelling; they may be dropped in a
future major. A value that isn't a positive number is reported and ignored in
favour of the default, rather than becoming a `NaN` timeout.

## CI (consumer repos)

Add one workflow file to a skills repo to lint specs on every PR (free, static):

```yaml
name: skill-harness
on: pull_request
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: mojomanyana/skill-harness@latest   # newest release; pin a version tag to freeze
        with:
          skills-root: ./skills            # dir of skill subdirs, each with tests/specification.yaml
```

`@latest` is a tag moved to each release, so you pick up new checks as they ship.
Pin a release tag (`@vX.Y.Z`) or a commit SHA to freeze instead — worth doing
once a scorecard matters, since `lint` is a gate and a release that adds a check
turns a green repo red. There is deliberately no `@v1`: a moving *major* tag
would claim a stability a linter can't offer, while `@latest` claims only to be
the newest release.

Their `tests/` folders are unchanged; the check is free/static (no `pi`, no secrets). Metered model runs in CI (manual trigger) are a separate, later tier.
