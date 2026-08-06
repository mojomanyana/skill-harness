# skill-harness

**The TDD loop for Agent Skills.** For developers shipping `SKILL.md`-powered
agents who want proof a skill works — and keeps working — without trusting a raw
LLM judge or standing up an eval platform.

![skill-harness demo: discover 7 skills, lint them offline, break one fixture marker and
watch the gate catch it, then re-score two committed runs 93% → 100%](assets/demo.gif)

<sub>17s, no API key, nothing mocked — every command above is free and offline, and the
grade movement is two runs already committed to a public repo. Re-record it with
`assets/demo/record.sh`.</sub>

## Quickstart

```bash
npm i -g skill-harness
skill-harness suggest my-skill --skills ./skills   # LLM-drafts a spec from the skill's own SKILL.md
skill-harness run     my-skill --skills ./skills   # run every scenario, judge it, score it
skill-harness review  my-skill --skills ./skills   # flip verdicts in a local UI; saves to results.yaml
```

No spec yet and don't want to spend tokens? `skill-harness init my-skill` writes a
commented template instead — free and offline. Already have runs? `lint` and
`list` need no models and no API keys at all.

## What it does

Point it at a repo of skills, and for any skill with a spec it will:

1. **run** each scenario against pi (a model of your choice, skill active),
2. **grade** every transcript with an LLM judge,
3. **score** it against a ship bar (with critical + under-pressure gating),
4. open an **interactive review** UI where you flip verdicts and add notes that
   persist back into the skills repo, and
5. let you **add tests** and **re-run** to measure a `SKILL.md` edit.

It is **pi-only** (the `pi` CLI is the sole harness) and **multi-model** — run the
same scenarios across several models and compare them side by side.

**What makes the numbers trustworthy**, and what an eval platform generally won't
give you:

- **Remedy-aware staleness** — a published result knows what it measured, split four
  ways: edit a checklist and lint says *re-grade* (judge only); change a threshold and it
  says *rescore* (free); fix a `diff_contains` needle and it says *regate* (free, from the
  saved diffs). Only a changed stimulus costs a re-run.
- **[Lift](#lift--baseline-vs-skill)** — baseline vs skill, so you find out whether the model
  would have passed without your skill anyway
- **Judge-misfire quarantine** — a verdict the judge contradicted itself on is
  quarantined, not counted, and it blocks SHIP until a human resolves it
- **Judge ≠ subject guard** — same-family grading inflates scores, so it warns
- **Seeded objective gates** — git diff + real `vitest` runs, not just opinion
- **Human overrides with mandatory audit notes** — the author owns the verdict

## Requirements

- **Node ≥ 20**
- **`pi` on your `PATH`** (`pi --version`) with at least one provider configured
  (e.g. Fireworks for the model under test, Anthropic for the judge).
- `run`, `grade`, and `suggest` spend model tokens. `init`, `lint`, and `list`
  are free, offline, and safe in CI.

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

No spec yet? Don't hand-write the YAML — scaffold it: `skill-harness init <skill>`
writes a commented template (free, offline), or `skill-harness suggest <skill>`
LLM-drafts scenarios and a checklist from the skill's own `SKILL.md` for you to
review (spends tokens; see the command reference below).

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
      diff_excludes: ["lastIndex"]  # ... and must NOT touch these
      post_test: post/S1.test.ts    # our test, copied in after the agent finishes
    checklist:
      - writes a covering test that passes
```

### Seeded gates (`assert`)

All four are optional. Each one that fails makes the scenario a FAIL without
spending a judge call. They are independent in effect, with one cross-check at
parse time: a needle listed in both `diff_contains` and `diff_excludes` is
rejected as an authoring error, since that gate could never pass.

| Gate | What it proves |
|---|---|
| `vitest: true` | `vitest run` passes in the temp repo. Grades the model's **own** tests, so a weak test the model wrote and passed still counts as green. |
| `diff_contains: [str]` | Each needle appears in the diff's **changed lines**. A keyword check — it proves the model wrote a name, not that the name behaves. |
| `diff_excludes: [str]` | No needle appears in the diff's **changed lines**. Makes scope discipline ("fix `sliceRange`, leave `lastIndex` alone") objective instead of inferring it from the model's prose. |
| `post_test: <path>` | A test file **you** wrote, copied into the workspace *after* the agent finishes and run on its own. The model never sees it, so it cannot write code shaped to pass it, and it needs no judge. |

Both needle gates deliberately match only added/removed lines, never context
lines or `+++`/`---` file headers. A unified diff carries context around every
hunk, so an untouched symbol near the edit site appears in the diff verbatim.
Matching that text would fail every model that changed exactly the right thing
(for `diff_excludes`) and pass models that changed nothing relevant (for
`diff_contains`) — the second being the quieter and more dangerous of the two.

`post_test` is the complement to `vitest`, not a replacement: `vitest` asks "did
the model's own tests pass?", `post_test` asks "does the code do what the task
required?". The file is copied in after the diff is captured, so it never appears
in the diff and never reaches a judge.

The gate demands positive evidence that assertions ran — it reports a spec error
rather than a pass when the hidden tests are all `.skip`/`.todo`, when vitest
collects nothing, or when no summary can be parsed. (Vitest exits **zero** for a
fully-skipped file, so a gate keyed on the exit code alone would have reported
PASS having executed nothing.) A `post_test` path that is missing or is not a
readable file likewise fails the scenario as a spec error, never as model
behavior — and `skill-harness lint` catches that one for free, before you spend a
run. Note the model owns the workspace, including `vitest.config.ts`: the gate is
unguessable, not tamper-proof.

> **YAML gotcha:** a checklist/turn item with an unquoted `": "` parses as a YAML
> *mapping*, not a string — `skill-harness` rejects it with a hint. Quote such items:
> `- "right-sizes: a glance — fine"`.

---

## CLI reference

```
skill-harness run    <skill|all> --skills <root> [--model prov:model ...] [--models file]
                               [--mode red|green|force] [--judge prov:model] [--harness pi] [--label name] [--parallel N] [--reps N] [--pass-threshold T] [--canary]
skill-harness grade  <run-dir>   [--judge prov:model]    # re-grade saved transcripts (neutral judge)
skill-harness review <skill>     --skills <root> [--port N]   # serve the interactive UI
skill-harness add-test <skill>   --skills <root> --id ID --title T --turn ... --check ... [--critical]
                                                            [--mode seeded --fixture path]
skill-harness init   <skill>     --skills <root> [--force]     # scaffold a commented template spec (free, offline)
skill-harness suggest <skill>    --skills <root> [--model prov:model] [--force]  # LLM-draft a spec from SKILL.md (spends tokens)
skill-harness list   --skills <root>                          # discovered skills + spec status
skill-harness lint   <skill|all> --skills <root>               # validate specs/fixtures + results-consistency; CI gate (exits non-zero on findings)
```

**Defaults:** subject model `fireworks:accounts/fireworks/models/deepseek-v4-pro` ·
judge `claude-code:claude-opus-4-8` · mode `green` · harness `pi`.

The judge default is Opus **on your Claude subscription** (`claude-code` shells out to
`claude -p`, OAuth), not a metered API key — a default must not be able to spend money
nobody asked for. Stronger than a default: a metered judge is **refused** unless you
say so, whether it arrived via `--judge`, via `SKILL_HARNESS_JUDGE`, or from the judge
a run recorded (which `grade` reuses). Opt in per command with `--allow-metered-judge`
or per repo with `SKILL_HARNESS_ALLOW_METERED_JUDGE=1` — an API key's rate limits are
worth having for a large `--reps` run, but you choose it. Free providers are
allow-listed (`claude-code` and local runtimes like `ollama`); anything unclassified is
assumed to bill. `skill-harness --version` prints the running version, and every run
banner and `results.yaml` now records it.

### Worked example — a real skills repo, graded in public

[**mojomanyana/principal-pi-skills**](https://github.com/mojomanyana/principal-pi-skills)
is seven pi skills tested with this harness, with every `results.yaml` committed:
**88 scenarios × 3 models × 3 reps**, 528 rep-executions in the release round plus 264
more against a third model that the skills were never tuned against.
[`RESULTS-MANIFEST.md`](https://github.com/mojomanyana/principal-pi-skills/blob/main/RESULTS-MANIFEST.md)
maps all ~104 runs to the round that produced them, so a superseded number stays
readable instead of being quietly overwritten.

It is worth reading for the parts a scorecard usually hides:

- **Per-cell pass rates, not single draws** — `build` A1 fails on all three models, which
  says the scenario found something in the skill rather than something about a model.
- **Judge audits that moved verdicts in both directions** — a rewritten checklist turned
  one 7-7 deadlocked transcript into 7-0, promoting `architect` C2 on one model and
  failing it on another, withdrawing an earlier correction. Recorded, not smoothed over.
- **Re-runs that invalidate their own history** — `git-ops` A9 had been measuring a
  model's reaction to an empty directory rather than its conflict-marker discipline; the
  reseeded scenario moved DeepSeek from 93% to 100%, and the old rows say so.

```bash
# discover what's testable
skill-harness list --skills ../principal-pi-skills

# run one skill (skill active), grade, score, print a scorecard
skill-harness run build --skills ../principal-pi-skills

# compare several models on one skill — the review matrix puts them side by side
skill-harness run git-ops --skills ../principal-pi-skills \
  --model fireworks:accounts/fireworks/models/deepseek-v4-pro \
  --model fireworks:accounts/fireworks/models/kimi-k3

# re-grade the saved transcripts with a different judge — no model re-runs (cheap de-confound)
skill-harness grade ../principal-pi-skills/build/tests/results/pi-*/2026-*/ \
  --judge fireworks:accounts/fireworks/models/kimi-k3

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

| mode | meaning | scored? |
|------|---------|---------|
| `green` | skill activated through the harness (`pi --skill`) | yes |
| `force` | SKILL.md injected as the system prompt (`--append-system-prompt`) | yes |
| `red`   | baseline, **no** skill (the contrast case) | no — it is what the others are measured against |

**Both delivered modes are scored** (since 0.5.0), because "was the skill in front
of the model?" is what a ship grade depends on, and both put it there. They are not
interchangeable measurements, though: placement changes behavior in both directions
at once. Measured on identical skill text, moving from green to force took one
skill's discipline scenario from 0/3 to 3/3 while dropping another skill's
right-sizing scenario from 3/3 to 0/3. So a trend line never pools them — a model
tag with runs in both deliveries gets one series per mode in the review UI.

**Green delivery depends on your harness version; force does not.** pi 0.80.x
wrapped the prompt with the skill body. pi 0.83.0 delivers `--skill` by
*progressive disclosure* — only the skill's description is in context and the
instructions load on demand, which its own docs note "models don't always do". A
nonexistent `--skill` path is also accepted silently (exit 0, a normal answer). So
a green run can measure a naked model and still look like a result. Three things
address it:

- the adapter **refuses** a skill dir with no `SKILL.md` instead of letting pi swallow it;
- every run records `harness_cli_version` (`pi --version`) beside its verdicts;
- `--canary` spends **one** probe up front — the model is asked to quote a heading from
  its own instructions — and aborts the run if the skill isn't reaching it. A run that
  isn't measuring anything then costs one rep instead of a wave.

`--mode force` is the delivery that has never been conditional, which is why it is
what a published corpus should measure.

### Lift — baseline vs skill

A letter grade can't tell you whether the skill did anything: a strong model may
pass your scenarios with the skill switched off, and that `A` looks identical to
a skill that works. Run both modes and `skill-harness` reports the difference as
**lift** — on the scorecard, and per model column in the review UI:

```
  GRADE: B (80%) — 4/5 — NOT READY
  LIFT:  +2 net (3 gained, 1 regressed) · 1 inconclusive
```

| class | meaning |
|---|---|
| **gained** | failed without the skill, passes with it — the skill working |
| **regressed** | passed without the skill, fails with it — the skill hurt |
| **kept** | passed either way — the model never needed the skill here |
| **inconclusive** | `ERROR` or an unresolved judge misfire on either side |
| **not comparable** | the harness ran it identically in both modes, or the two sides aggregated differently — excluded, never reclassified |

`inconclusive` is the load-bearing one: an `ERROR` is a harness failure, not
evidence that the skill-less agent couldn't do the task, so it is never counted
as a gain. Without it, flaky infrastructure reads as skill value.

Run the baseline at the same `--reps` as green. A one-rep verdict is a single draw
and a three-rep verdict is a majority over three; comparing across that gap turns
sampling into apparent skill value, so those cells are excluded and the headline
says what to re-run.

Lift is derived from the runs already on disk — an old baseline still counts, and
nothing needs re-running for it to appear. Only scenarios present in both runs are
compared, and a skill with no red run reports `no red baseline` rather than a
zero, because "not measured" is a different claim from "measured no effect".

The skill side is whichever delivered mode ran most recently (green or force); the
baseline is `--no-skills` either way, so red-vs-force is as valid a comparison as
red-vs-green, and the reported lift says which delivery it measured.

### Concurrency & workspaces

**`--parallel N`** runs up to N scenarios (and their judges) concurrently; default is 1 (sequential).
Use it to speed up large skills; keep it modest to respect provider rate limits.

**`--reps N`** runs each scenario N times (default 1). The scenario's verdict becomes a pass-rate
and it **PASSes** at `--pass-threshold T` (default 0.5; ties pass). A per-scenario flakiness
index is recorded. Combine with `--parallel` to keep N reps fast.

**`--only A1,D2`** runs a scenario subset — the iteration tool (re-testing two D-scenarios must
not cost an 18-scenario run). The result is marked `partial: true`, is **never ship-graded**,
and never counts as staleness coverage; a typo'd id fails before anything runs.

**Empty responses are infra, not behavior.** A blank assistant turn (the shape a model/harness
timeout leaves) is retried once in a fresh workspace; if it happens again the scenario is
`ERROR` — it still blocks SHIP, but it is never handed to the judge, because grading an empty
reply produces a confident FAIL about behavior that never happened.

**Staleness is machine-checked.** Every full run records `source_hashes` — a sha256 of
everything it measured: SKILL.md, each `system_prompt_file`, each scenario's *definition*,
each `post_test`, and every file in each fixture tree ([details](#results--git-policy)).
`lint` compares the newest full run per model against the current sources and fails with
`stale` when they differ, including when the newest run never measured a scenario the spec
now defines: a published result must describe inputs that still exist. Runs predating a key
kind are silent (no retroactive noise); partial runs never count as coverage.

**`rescore <run-dir>...`** re-collapses saved reps against the *current* spec thresholds —
no model calls, no judge calls, free. Reps are the measurement (`passes` of `clean`); a
threshold is policy. When the policy changes, recompute the old measurements under it and
record what moved, rather than reconciling two numbers in prose. Only reps-bearing
scenarios move; single-rep verdicts, `ERROR` and `JUDGE-AMBIGUOUS` are carried verbatim
(no rate to re-apply), and overrides/notes/suspect flags are preserved — this changes the
collapse rule, never what the judge said. Every re-score journals a `rescore` event with
the verdicts that moved.

**`grade <run-dir> --suspect-only`** re-judges only untrustworthy verdicts (misfire-suspect or
`JUDGE-AMBIGUOUS`), carrying clean ones verbatim — the rejudge path for ambiguity without
re-spending the whole run's judge calls. With nothing suspect it is a no-op.

**Per-scenario overrides:** `reps:` and `pass_threshold:` in `specification.yaml` override the run flags.

**Scenarios can declare their workspace** with `env: { workspace: none | empty-git | fixture:<path> }`:
- `none` (default): a fresh isolated temp dir.
- `empty-git`: a temp dir initialized as an empty git repo (for git-based scenarios).
- `fixture:<path>`: copies a fixture directory (relative to the spec) and initializes it as a git repo.

Every git workspace is `git init -b main` plus a baseline commit, so the branch name is
`main` regardless of the host's `init.defaultBranch`, and a later `git diff --cached`
shows only the agent's edits.

**Starting from a dirty tree.** A fixture may carry `_uncommitted/` and `_staged/`
subdirectories. Their contents are copied over the workspace *after* the baseline commit,
so those paths land as pending changes instead of history: `_uncommitted/` stays unstaged,
`_staged/` is added to the index. That's what scenarios like "I fixed the typo — commit
it" and "commit my staged changes" need. Use either or both; neither marker directory ever
appears in the workspace.

```
fixtures/typo-fix/
  README.md                  # -> the baseline commit ("Teh project")
  _uncommitted/README.md     # -> applied after   ("The project")  => unstaged edit
  _staged/CHANGELOG.md       # -> applied after, then git add      => staged edit
```

**Marker names are checked.** A typo — `_uncommited/`, one `t` — would once have been
copied into the baseline commit as an ordinary directory, leaving the scenario measuring
the opposite of its intent with nothing to show for it. Any *top-level* `_name/` is now
read as a marker claim: `skill-harness lint` reports it (free, offline, in CI, with a
"did you mean?" when it's a near-miss) and `run` refuses the fixture outright. Both use
the same rule, so lint can never bless a fixture the runtime rejects. Two carve-outs, so
ordinary content is left alone: only a *single* leading underscore counts (`__tests__/`
and `__pycache__/` copy normally), and markers are top-level only (`pkg/_staged/` is
ordinary content).

**A real remote.** `env: { remote: true }` (with `empty-git` or a fixture) initialises a bare
repo in its own temp dir, wires it as `origin`, and pushes the baseline, so `main` tracks
`origin/main` and push/fetch/diverged-upstream work with no network. Without it a git
fixture has no upstream at all, and a model reasonably reads that as "solo throwaway repo"
— which is why a scenario like git-ops A4 passed or failed depending on the run. Both temp
dirs are removed on cleanup. Requesting a remote without a repo is a spec error.

**Testing an agent definition, not a skill.** `system_prompt_file: <path>` (relative to the
spec, like fixtures) runs that markdown file AS the system prompt with no skill activated —
the shape a subagent definition actually runs in. Such a scenario must declare exactly one
turn: a subagent has no turn two, so testing one across several would measure conversation
armor the single-shot contract deliberately drops. `lint` fails if the file is missing,
since silently falling back to skill activation would measure the wrong artifact.

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
  resembles a subject model. (The default judge is Claude, precisely so it stays
  distinct from a Fireworks subject.)
- **Judge provider:** `claude-code:<model>` — the default — routes grading through the
  local `claude` CLI on a Claude subscription (OAuth). `anthropic:<model>` uses a
  metered API key instead: higher rate limits, real per-token cost.
- **Weak/stochastic models lie on a single run.** Re-run noisy critical scenarios
  before trusting a delta.

---

## Results & git policy

Each run writes to the **target skills repo**:

```
<skill>/tests/results/<harness>-<model-slug>/<timestamp>/
  A1.green.txt        transcript            (gitignored)
  A1.green.judge.txt  raw judge output      (gitignored)
  A1.green.diff.txt   staged diff — seeded scenarios only   (gitignored)
  …
  results.yaml     verdicts + judge reasons + your overrides + notes   (committed)
  journal.jsonl    machine-facing event stream for this run            (gitignored)
  report.html      generated review UI   (gitignored)
```

A generated `results/.gitignore` keeps `results.yaml` tracked while ignoring the
raw transcripts, journal, and report. Commit the durable verdicts; regenerate the rest.

**`<id>.<mode>[.rep<k>].diff.txt`** is the `git diff --cached` a seeded scenario
produced — the code the model actually wrote. The scenario workspace is destroyed
after every rep, so without this artifact a seeded verdict cannot be audited after
the fact. It is saved for every rep, whether the gates passed or failed, and a
(size-capped) copy is included in the transcript the judge grades, so a seeded
checklist item about what the code *does* is graded from the code rather than from
the model's description of it. Cap the judge's copy with
`SKILL_HARNESS_DIFF_MAX_BYTES` (default 64000); the artifact on disk is never
truncated.

`results.yaml` is **schema 2**:

- `effective_grade` is always override-aware — it's recomputed from the current
  verdicts (judge, or your override where present) on every write, so a saved
  grade can never disagree with what's on the page. Schema-1 files (from before
  this) are still read fine — they're migrated in memory on load, never rewritten.
- `label` carries the `--label` you ran with (`null` if you didn't pass one).
- `mode` records which run mode (`red` / `green` / `force`) produced the file. `green`
  and `force` are scored; a `red` baseline's `effective_grade` is a `not scored`
  placeholder. A force run recorded by 0.4.x carries that placeholder too — `rescore`
  (free, offline) writes the real grade, and `lint` says so.
- `harness_cli_version` records the harness CLI that produced the transcripts
  (`pi --version`). Provenance for the *delivery*: a pi upgrade silently changed what
  green mode measures, and that incident was invisible in the artifacts because
  nothing recorded which pi ran. Written by `run` only, and carried verbatim by
  `grade`/`rescore`/`regate` — they re-decide verdicts, they do not re-deliver a skill.
- `delivery_canary: pass` appears on a green run started with `--canary`: before the
  wave, the model quoted a heading from its own skill instructions back. Absent means
  the probe wasn't asked for — never that it failed, because a failed canary aborts
  the run before any results file exists.
- each scenario carries `suspect`: the judge-misfire tripwire fired (its per-item grades
  disagree with its overall verdict) — marked `suspect`, excluded from the grade, and blocks
  SHIP until you re-judge it or set an override in the review UI.
- `source_hashes` records a sha256 of **everything the run measured**, so `lint` can prove a
  published result still describes the current inputs:

  | key | covers | cheapest honest remedy when it drifts |
  |---|---|---|
  | `SKILL.md` | the skill text | `run` (subject + judge) |
  | `stimulus:<id>` | what the model was asked — turns, mode, workspace, fixture path, `assert.vitest` | `run` (subject + judge) |
  | `rubric:<id>`, `rubric:__persona` | the checklist, title, and judge persona the verdicts came from | `grade` (judge only) |
  | `policy:<id>` | `critical`, `reps`, `pass_threshold` — how verdicts collapse to a grade | `rescore` (free) |
  | `gates:<id>` | `diff_contains` / `diff_excludes` needles | `regate` (free; one judge call per flipped rep) |
  | `fixture:<path>` | every file under one fixture dir, including `_staged/`/`_uncommitted/` | `run` (subject + judge) |
  | `<relative path>` | a `system_prompt_file`, or an `assert.post_test` file's contents | `run` (subject + judge) |

  Lint names the remedy in the finding itself — only stimulus drift costs model spend.
  Runs recorded by 0.3.x carry a single combined `scenario:<id>` key instead of the
  four split ones; it is still compared, and a fresh run supersedes it.

  A source that could not be read when the run was recorded is stored as
  `unreadable` rather than omitted, and always reports stale — an omitted key
  would never be compared again for the life of that result.

  Scenario digests are **per-scenario and built from the parsed spec**, not from
  `specification.yaml` as a whole. Editing A1's checklist marks A1 stale and leaves A2 alone,
  and reindenting the YAML marks nothing stale, because formatting isn't what a run measures.
  A recorded scenario that no longer exists in the spec is a reshape, not staleness, and is
  ignored — but a scenario the spec defines that the newest full run never measured *is*
  reported, or renaming a scenario would leave a SHIP scorecard looking current. Runs
  recorded before a given key kind existed simply don't carry it and are never retroactively
  flagged.

`skill-harness grade` re-judges whatever transcripts a run left on disk — single-rep or
`--reps N`, and in the run's own mode (a force run's `.force.txt` transcripts, a red
baseline's `.red.txt` ones). It fails fast, before spending a judge call, if a recorded
scenario's transcripts are missing or the spec no longer defines it, rather than quietly
shrinking the grade denominator.

**Overrides** (via `skill-harness review`) **require a note** — you must say why the
judge was wrong before an override is accepted. Saving one also un-gitignores
that scenario's transcript, raw judge output and staged diff, so the evidence
behind the override stays in the audit trail alongside the note.

`journal.jsonl` is a per-run, line-delimited event stream (`run-started`,
`delivery-canary`, `scenario-started`, `gate-result`, `judge-verdict`,
`misfire-flag`, `score`, `override`) meant for tooling — trends, dashboards, future UI — rather than
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
      - uses: mojomanyana/skill-harness@latest
        with:
          skills-root: ./skills   # dir of skill subdirs, each with tests/specification.yaml
```

> **`@latest`** is a tag moved to each release: you get new checks as they ship.
> **Pin a release tag** (`@vX.Y.Z`) or a commit SHA to freeze instead — do that
> when you want to choose *when* new checks land.
>
> There is deliberately no `@v1`. `lint` is a gate, so any release that adds a
> check turns a passing repo red; a "stable major that moves forward" would
> promise a stability a linter can't honour, whereas `@latest` promises only
> "newest release", which is true. A `results.yaml` written by version X also
> needs version ≥ X to lint.

`lint` validates spec schema, ship_bar sanity, critical-id existence, fixture paths (seeded scenarios, or any scenario using `env.workspace: fixture:PATH`), fixture marker names, and results-consistency + staleness (for any committed `results.yaml`). Failures fail the check and report each finding as a GitHub error annotation in the run summary. Your `tests/` folders are unchanged.

---

## Development

Working on `skill-harness` itself (rather than using it):

```bash
git clone https://github.com/mojomanyana/skill-harness
cd skill-harness
npm install
npm run build     # emit per-package dist/
```

### Repo layout

    packages/core/       engine: spec, discover, run, grade, score, results, seeded, lift, report
    packages/adapters/   pi harness + claude-code (subscription CLI) judge routing
    packages/cli/        command surface (run/grade/review/add-test/init/suggest/list) + review UI server
    bin/skill-harness.js   launcher: packages/cli/dist if built, tsx fallback otherwise

```bash
npm test          # vitest unit tests for the engine
npm run typecheck # tsc --noEmit
npm run build     # emit per-package dist/ (tsc project references)
```

Adding another harness is the one extension point: implement `HarnessAdapter`
(`packages/core/src/adapters/types.ts`) and register it in
`packages/adapters/src/index.ts`.
