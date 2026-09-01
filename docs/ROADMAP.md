# skill-harness — Strategy & Roadmap

> Agent-executable strategy doc. Produced 2026-07-06 from a full codebase + market analysis.
> Status line last reconciled with the shipped code on 2026-08-09.
> Agents: read **Context & Rules** before picking up any task. Work top-down within the
> current phase; do not start a later phase until the current phase's exit criteria are met.
> Check off tasks (`[x]`) as they land and note the date + PR/commit next to them.

> **Current open work lives in `docs/NEXT-SESSION.md`**, not here. This file is the
> strategy; that one is the state of play.

## Context (do not re-litigate)

- **What this is:** the test-driven development loop for Agent Skills (`SKILL.md`) —
  run scenarios through a harness, grade with an LLM judge, gate on a ship bar,
  review/override as a human, edit the skill, re-run, measure.
- **Positioning:** *skill-harness is the TDD loop for Agent Skills — for developers
  shipping SKILL.md-powered agents who want proof a skill works and keeps working,
  without trusting a raw LLM judge or standing up an eval platform.*
- **Differentiation (protect these):** judge-misfire quarantine, judge≠subject guard,
  seeded objective gates (git diff + tests), human overrides with mandatory audit notes,
  red/green (with/without-skill) comparison, multi-model side-by-side, lives *inside* the
  agent as an installable skill.
- **Strategy:** win the pi ecosystem first (native wedge, high-signal small pond), then
  generalize to Claude Code / the Agent Skills standard. Dev-loop workflow, not benchmark
  instrument — that's how we differ from adewale/skill-eval-harness (the closest rival),
  promptfoo (generic, OpenAI-owned), and MLflow skill evals (platform-flavored).
- **Goals ranking:** community > money. Owner has 10–15h/wk and will do public posting.
- **Status already done:** name kept as `skill-harness`; **published to npm 0.7.0**
  (2026-08-08, tag `v0.7.0`, PRs #43 + #44). 0.7.0 shipped the five-phase pi-native
  capture program in one minor: `capture`, `assert.trace`, `require_subagents`,
  `coverage`/`affected`, and adjudication (`--auto-rejudge`) — plus the change that
  made the trace gates real: an objective FAIL/ERROR now outranks the judge in
  `effectiveVerdicts`. Before that, `objective` was recorded in `results.yaml` and
  never scored.

## Rules for agents

1. **Never paywall or degrade anything in the run→grade→review loop.** Free forever.
2. **Every feature ships with a post.** A feature PR is not "done" until a draft
   post/thread exists in `docs/posts/` (drafts are fine; owner edits voice).
3. Findings > features for growth. When in doubt, produce a graded-skill artifact
   someone can share.
4. Don't add a hosted/SaaS/dashboard component before Phase 5. Don't build UI polish
   beyond the existing report template ("no nice face").
5. Public API hygiene: no new `SKILL_CHECK_*`-prefixed names; don't break
   `specification.yaml` schema without a migration like results schema 1→2 had.
6. Verify on a fresh machine/temp dir before claiming onboarding tasks complete.
7. Remember pi headless gotcha: `pi -p` needs stdin from `/dev/null` or it hangs.

---

## PHASE 1 — Publishable & Provable (weeks 1–4)

**Goal:** a stranger goes from zero to a graded skill in under 10 minutes.
**Exit criteria:** `init` + spec-generation shipped ✅; quickstart verified ≤10 min on a
fresh machine ✅ (41s); a public example with multi-model results committed ✅
(`principal-pi-skills`, 7 skills × 3 models); demo GIF recorded ✅ (2026-08-05).
**All four met — Phase 1 is closed.** Reworded 2026-08-04: "5 popular *external* skills"
moved to Phase 2, where its value (credibility, warm leads) actually lives. See the
Sprint 1.2 entry for why. Phase 2 is now unblocked; nothing in it is started.

### Sprint 1.1 — Ship & smooth the funnel
- [x] Publish 0.1.0 to npm (done)
- [x] `skill-harness init <skill>` — scaffold `tests/specification.yaml` with a commented
      template (spec-writing friction is the #1 onboarding killer) (2026-07-06, feat/init-suggest)
- [x] `skill-harness suggest <skill>` (or `init --draft`) — LLM-drafts a spec from the
      skill's own SKILL.md: scenarios, checklist, proposed critical set; human edits
      before first run. **Single most important task of the phase.** (2026-07-06, feat/init-suggest)
- [x] Rename `SKILL_CHECK_*` env vars to `SKILL_HARNESS_*` with back-compat fallback
      (2026-08-04) — one `core/util/env.ts` resolver (new name wins, legacy warns once),
      all 3 sites moved, documented in USAGE.md for the first time
- [x] Fresh-machine quickstart run-through; fix everything >10 min. Metric: ≤10 min.
      (2026-08-04) — **41s** from fresh clone to a graded skill (~14x headroom); nothing in
      the source path needs fixing. Full measurements + repro in
      `docs/quickstart-verification.md`. The npm path was the caveat here — `latest` was
      0.1.2, with no `init` and no `suggest`, so an npm user had to hand-write the spec.
      **Closed 2026-08-04**: 0.3.0 was published for all four packages, and 0.3.1 followed
      on 2026-08-05 — `latest` serves it; verified by installing the published tarball into a clean prefix and confirming
      `init`/`suggest`/`lint` are in `--help`. Both paths now onboard.

### Sprint 1.2 — Make it demoable
- [x] Surface red-vs-green as an explicit **lift** column in results + report
      ("does this skill do anything?" — neutralizes the rival's best feature)
      (2026-08-04) — `core/lift.ts`, derived on read (never persisted, so it can't go
      stale); scorecard `LIFT:` line + per-column/per-cell markers in the review UI;
      `inconclusive` class keeps ERROR/misfire noise out of the number.
      **Shipped, barely exercised** (found 2026-08-04, corrected 2026-08-05): exactly one
      red baseline against a real model exists — the two-scenario `golden-skill` fixture
      during the quickstart verification, which correctly reported `no measured effect
      (2 passed without the skill too)`. Against the corpus that matters, all 82 committed
      `results.yaml` in `principal-pi-skills` are `mode: green`, so no lift has ever been
      computed there.
      Measuring it costs a full second pass (~426 rep-executions for 5 skills × 2 models
      at `--reps 3`), which is why it is parked rather than done. Both free prerequisites
      are now closed (2026-08-05) — what remains is only the spend, and note the second one
      means the baseline pass has to be `--reps 3` too, not a cheap single-rep control:
      - [x] **`lift` silently compared mode-insensitive scenarios** — fixed 2026-08-05.
        `pi.ts` treats an agent-file run as *the* system prompt — "no skill activation,
        whatever the mode" — so the 6 `system_prompt_file` scenarios
        (`debug`/`plan`/`review` D1+D2) are byte-identical in red and green.
        `computeLift` classed them `kept`/`both-fail`, which reads as evidence against
        the skill when in fact the skill was loaded on *both* sides — so every agent-file
        scenario moved lift **down**, 7% of the headline pointing the wrong way. Now
        excluded before classification and reported separately (`modeInsensitive`, like
        `greenOnly`/`redOnly`), because there is no honest bucket for "we ran the same
        thing twice". Ids come from the spec, not `results.yaml`, so it works on runs
        already published. The all-excluded case no longer claims "no shared scenarios".
        The review UI needed no change — `liftSummary` iterates `lift.cells`, so the
        exclusion propagates. Post: `docs/posts/2026-08-05-comparing-a-run-against-itself.md`
      - [x] **Red runs at the same `--reps` as green** — fixed 2026-08-05. `computeLift`
        compared verdicts without looking at how either was produced, so a `--reps 1`
        baseline against a `--reps 3` green paired one draw with a majority-of-3: on a
        scenario the model passes half the time that manufactures a `gained` a quarter of
        the time, and a `regressed` on the lucky-red/minority-green side. Fix reads an
        `AggregationShape` (`reps` + applied `pass_threshold`) off both sides and excludes
        the pair when they differ — same policy as `modeInsensitive`, reported as
        `aggregationMismatch`, never reclassified. Threshold is part of it: 1-of-3 vs
        3-of-3 is a different majority policy at the same N. A stray `pass_threshold` on a
        1-rep cell is normalized away, since `outcomesToResult` never aggregates there.
        Headline names the mismatch and the remedy (`re-run the baseline with --reps 3`).
        Also fixed one layer up: the review UI's badge fell through to "no red baseline"
        whenever nothing was comparable, which is false and sends the author to re-run the
        one run they already have — now `lift not comparable` with the headline as tooltip
        (`liftNoneBadge` in `assets/report.grade.js`, parity-tested). Three states, not two.
        Post: `docs/posts/2026-08-05-one-draw-against-a-majority.md`
- [x] Flagship example: **`mojomanyana/principal-pi-skills`** — public, 7 pi skills, 88
      scenarios × 3 models × 3 reps, every `results.yaml` committed, ~104 runs mapped in
      `RESULTS-MANIFEST.md` (2026-08-04) — linked from README as the worked example. It
      already exceeded "~5 skills, multi-model results committed"; the gap was only that
      nothing here pointed at it, and README's example block cited two skills
      (`ponytail`, `code-review`) that never existed in that repo
- [ ] **External** skills, moved to Phase 2 — deliberately dropped from Phase 1. Grading
      someone else's skills buys credibility and warm leads (every tested author is a
      lead), which is *distribution*, not validation, so it belongs beside the findings
      post. Shrink to 2–3 skills. Corpus survey done 2026-08-04: pi ships no skills of
      its own and its docs recommend exactly two corpora — `anthropics/skills` (166k
      stars, but no SPDX license detected and the document skills are explicitly
      source-available, so **fetch at a pinned SHA, never vendor**) and
      `badlogic/pi-skills` (2.3k, MIT, by pi's author, but all eight skills are
      tool-wrappers needing live credentials — poor fit for reproducible committed
      results). Every process-oriented pi corpus found has under 20 stars, so "popular
      *and* pi-native *and* testable" does not currently exist as a set
- [x] Demo GIF — **recorded and in the README** (2026-08-05): `assets/demo.gif`, 17s,
      453K, 110×24. Three beats: `list` (7 skills) → `lint` green, then one dropped `t` in
      a fixture marker yields 4 findings and exit 1 → `rescore` on two committed runs
      showing `git-ops` 93% → 100%. **Deliberately not** "edit SKILL.md → re-run → grade
      C→A": a live re-run spends subject+judge tokens and takes minutes. Trade: no skill
      visibly *improving*, but every frame is free for a viewer to reproduce against a
      public repo, and no frame depends on a model reply that would differ on a second
      take. Rebuild with `assets/demo/record.sh` — headless via `script(1)` → asciicast →
      prebuilt `agg`, with real pty timings (no synthesised delays). Toolchain note:
      building `agg`/`asciinema`/`vhs` needs Rust with `edition2024` and this box has
      cargo 1.75 from apt with no rustup, hence the prebuilt binary
- [x] README top: positioning sentence + GIF + 3-command quickstart above the fold
      (2026-08-04) — positioning sentence, install + 3 commands, differentiators list;
      contributor material (git clone, repo layout) moved down into Development. GIF
      still outstanding: a commented slot is in place at the top for it to drop into

### Sprint 1.3 — Measurement integrity (protect "seeded objective gates")

Not new scope: these repair the differentiator Phase 1 already claims. Found by
re-reading the tree against release-1's committed results.

- [x] Release hygiene: land 0.2.1 on `main`; make the `v1` tag's advertised
      "moves forward" contract true (2026-08-04, PR #26) — both were runbook
      omissions, now mandatory post-publish steps in `PUBLISHING.md`
- [x] Seeded runs show the judge the staged diff, and save it as a run artifact
      (2026-08-04, PR #27) — `runSeeded` computed the diff, gated on it and threw
      it away, so seeded checklist items about code behavior were graded from the
      model's self-description; `build` A1's six reps passed identical gates and
      split PASS/FAIL purely on phrasing. Capped copy in the transcript with an
      explicit truncation marker; uncapped `.diff.txt` beside it
- [x] `assert.diff_excludes` + `assert.post_test` — additive seeded gates
      (2026-08-04, PR #28) — a negative needle makes scope discipline objective
      (matched on *changed* lines only, or context would fail correct models);
      a post-test the model never sees checks required behavior with no judge
- [x] `source_hashes` covers scenario definitions + fixture trees
      (2026-08-04, PR #29) — the staleness lint was checking the instructions and
      ignoring the test; a swapped fixture left `lint all` reporting 0 findings.
      Per-scenario digests, not a whole-file spec hash, so spec *growth* flags
      nothing. **Forward-looking**: runs recorded before this carry no fixture
      hashes and stay silent, so published scorecards need a re-run to become
      checkable
- [x] Lint reports a mistyped fixture marker (2026-08-04, PR #30) — the runtime
      already refused `_uncommited/` (2026-07-30); this moves the discovery to the
      free offline CI gate, sharing one implementation so lint can never bless a
      fixture `run` rejects
- [ ] **Re-measure** — scoped down to 4 cells and handed off (2026-08-04):
      `docs/re-measurement-2026-08-04.md`. The earlier wording here ("the committed
      scorecards predate all of the above") was broader than the evidence: the three
      verdict-moving changes touch `mode: seeded` scenarios only, and just `build`
      (8 of 9 seeded) and `debug` (5 of 8) have any. Those 4 cells (both models) were
      graded without the judge seeing the diff and need fresh **full** runs — `grade`
      can't repair them, since pre-`f6a5f6c` transcripts don't contain the diff.
      `architect`/`decide`/`plan`/`review` have **zero** seeded scenarios, so their
      verdicts stand; `git-ops` was already re-measured post-fix (`release-2-gitops`).
      Not ours to execute — `principal-pi-skills` is read-only from here and `run`
      writes into it.
      **Separate, lower-priority**: 12 of the 14 current cells carry no
      `scenario:`/`fixture:` hashes, so `lint all` reporting 0 findings against that
      tree means "nothing provably stale", not "fresh". Fixing that is ~500
      rep-executions of hygiene, and buys detectability rather than corrected numbers

### Sprint 1.4 — Third-pass work order (owner-supplied, 2026-08-05)

Source: `~/prepos/skill-harness-work-order.md`, written against `main = 96de023`
(0.3.2) by the owner of `principal-pi-skills`, with every item measured against real
runs there. **North star it states, binding on prioritization:** one principal
engineer steers while skills and subagents do the work — so the harness's job is
measurement the engineer never has to second-guess, and a loop cheap enough that a
found defect gets *fixed* rather than documented around.

Its headline: the 0.3.0 staleness gate is now strong enough that **it charges model
spend to correct a rubric**, which is pressure to leave known-bad rubrics in place.
Two branches there are parked on exactly that — 135 rep-executions to restore
freshness while learning nothing new about the models. **Do not weaken the gate**;
make truth cheap to restore.

- [x] **Item 5 + 4.1 + 4.2 — record corrections, version identity** (2026-08-05):
      - The `@latest` claim about `principal-pi-skills` was false on both surfaces —
        its CI pins `ref: v0.3.0` deliberately, and its `package.json` names the
        harness nowhere. Corrected in `PUBLISHING.md` and
        `docs/re-measurement-2026-08-04.md`; that repo *is* the pinning example.
      - Judge default moved off the metered API to `claude-code:claude-opus-4-8`
        (Claude subscription, OAuth) — it had billed a corpus once by accident. A
        default may not be able to spend money. `SKILL_HARNESS_JUDGE` sets policy
        once per repo/shell; `--judge` still wins; the three duplicated judge
        defaults collapsed into core's `defaultJudge()`.
      - `--version` / `-v` / `version` (was `unknown command`, exit 1), the version
        on the run banner, and `harness_version` stamped by `finalizeResults` — the
        one funnel every writer passes through, so `run`/`grade`/`rescore`/override
        all record provenance. Older runs carry none and are never retro-labelled.
      - **Beyond the work order, at the user's request (2026-08-05):** a metered judge
        is now *refused*, not merely un-defaulted. `assertJudgeAllowed` gates `run` and
        `grade` in both the CLI and the extension, whatever the judge's origin —
        `--judge`, `SKILL_HARNESS_JUDGE`, or the judge a run recorded (which `grade`
        reuses). Opt-in is explicit: `--allow-metered-judge` per command,
        `SKILL_HARNESS_ALLOW_METERED_JUDGE` per repo/shell. Allow-list of
        non-billing providers (`claude-code` + local runtimes), so an unclassified
        provider is assumed to charge; judge only, since paying for the subject model is
        what a run *is*. Checked in `run` before the harness/PATH check, so the refusal
        cannot arrive after tokens are spent.
      - **Claim corrected while implementing it:** the rationale first written here and
        in the code said every pre-0.3.3 run recorded the old metered default, so
        re-grading an archive would bill. False — all ~140 committed `results.yaml` in
        `principal-pi-skills` record `provider: claude-code` (checked 2026-08-05). The
        old default was reachable, never taken. The regrade path is latent, and the
        guard exists for the three paths that remain.
      - Post: `docs/posts/2026-08-05-a-default-that-cannot-bill-you.md`
- [x] **Items 1 + 2 — split the staleness identity, and `regate`** (2026-08-05, the
      design change). `scenario:<id>` hashed stimulus + rubric + policy + gates together,
      so lint's only remedy for any drift was "re-run" — and correcting a rubric
      therefore cost model spend. Now four keys, each naming the cheapest honest remedy
      in the finding itself: `stimulus:` → `run`, `rubric:` (+ `rubric:__persona`) →
      `grade` (judge-only), `policy:` → `rescore` (free), `gates:` → `regate` (free +
      one judge call per flipped rep). Strictness unchanged; only the price of getting
      back to fresh moved.
      - `facets()` keeps the exhaustive-destructure guard, so a new `Scenario`/
        `SeededAssert` field fails the build until someone assigns it a bucket — and a
        wrong bucket is worse than none, since it would promise `rescore` where the
        transcripts are actually invalid.
      - `scenarioDigest` is now **read-only and frozen** at the 0.3.x field set: it is a
        stored-hash format, and every scorecard published before 0.4.0 recorded it.
        Deleting it would turn "no findings" into "no comparison" for the whole corpus,
        silently. Legacy keys still resolve; their remedy admits it cannot tell which
        facet moved.
      - Refresh rules: `grade` rewrites only the `rubric:` keys it actually judged
        (`--suspect-only` must not certify the rubrics it skipped) plus the persona;
        `rescore` rewrites `policy:`; `regate` rewrites `gates:`; `run` rewrites all.
        `regrade.ts`'s doctrine narrowed from "recorded hashes stay" to "recorded
        *stimulus* hashes stay".
      - `regate` reuses `evaluateNeedleGates` (extracted from `runSeeded`, one
        implementation so a regated verdict cannot disagree with a fresh run) and
        re-reads a rep's **saved judge-raw artifact** when its gate state did not change
        — free and exact, instead of re-asking. Only a gate-fail → gate-pass flip costs
        a judge call; the CLI prints the count. `vitest`/`post_test` scenarios are
        refused, not half-regated.
      - Post: `docs/posts/2026-08-05-the-gate-that-charged-you-to-fix-a-typo.md`
- [x] **Item 3 — workspace hygiene** (2026-08-05). `git add -A` staged vitest's
      `node_modules/.vite` cache into every captured diff. Fixed at workspace
      materialization by appending `node_modules/`, `coverage/`, `.vitest/` to
      `<repo>/.git/info/exclude` — not a worktree file, so it cannot contaminate a
      scenario *about* `.gitignore`, the model cannot read or delete it, a fixture's own
      `.gitignore` stays byte-identical, and it applies to every git call rather than the
      ones someone remembered to annotate. Written before the baseline `add -A`, so a
      fixture shipping a stray `node_modules/` does not commit it either.
- [x] **Item 4.3 — downgrade tripwire** (2026-08-05). `newestRecordedVersion` scans a
      results tree for the highest `harness_version`; `run` refuses when that exceeds the
      running version (its numbers would not be comparable), while `grade` warns and
      `lint` reports a `consistency` finding — both are how someone diagnoses this, and
      blocking the diagnosis is the wrong trade. Version comparison is numeric per
      component, because `"0.10.0" < "0.9.0"` lexically would fire the tripwire backwards
      exactly once, on the release where it mattered. Inert on pre-0.3.3 trees, which
      record no version and are never retro-labelled.

### Sprint 1.5 — Addendum: green mode measured a naked model (owner-supplied, 2026-08-05)

The addendum at the top of `~/prepos/skill-harness-work-order.md`, ranked above items 1–5
(all delivered in 0.4.0). Released as **0.5.0** (2026-08-06).

- [x] **Item 0b — score force-mode runs** (2026-08-06). `green` and `force` are both
      scored; `red` stays the unscored control. Scored **directly**, not behind a spec
      flag or a `--score-force` opt-in: "was the skill in front of the model?" is a
      property of the mode, and a second knob is a second thing to forget (and this repo
      has one consumer, so there is no green-only default to preserve for anyone else).
      The gate had been open-coded in seven places — `run`, `grade`, `rescore`, `regate`,
      `lint`, and both review-server writers — which is exactly how force came to be
      unscored in all seven at once; it is now one predicate, `scoreContextFor`.
      Everything downstream of a grade had to follow: `grade`/`regate`/the UI's re-judge
      read the run's OWN mode's artifacts (a force run's transcripts are `.force.txt`, so
      looking for green ones found nothing and threw "nothing to re-grade"); `trends`
      splits a tag into one series per mode; `collectLift` takes the newest *scored* run
      as the skill side and records which delivery it measured. A pre-0.5.0 force run's
      `not scored` placeholder now disagrees with a recompute, so `lint` says so and
      names `rescore` — free, offline — as the remedy.
      **Epoch honesty is the load-bearing part:** on identical skill text, green → force
      took `build` A1 from 0/3 to 3/3 while dropping `plan` C2 from 3/3 to 0/3, so the two
      modes are two deployments, not two samples of one. Nothing pools them.
- [x] **Item 0 fix set — delivery must be verifiable** (2026-08-06).
      - **Adapter tripwire.** `skillFlags` stats the skill dir + `SKILL.md` and refuses,
        loudly, before exec — pi 0.83.0 accepts `--skill /nonexistent` with exit 0 and a
        normal answer, so the failure had no other way to announce itself. Checked for
        force too (an absent `SKILL.md` must not become an empty system prompt).
      - **Relative path resolved at the source.** `discover()` returned `join(root, name)`
        — relative under `--skills .`, handed to a child process running in a neutral cwd
        of the harness's choosing. `dir`/`specPath` are absolute now; the adapter resolves
        again as a second line of defence.
      - **`harness_cli_version` in `results.yaml`** (`pi --version`, asked once per run,
        `null`-tolerant). Written by `run` only and carried verbatim by every rewriter: a
        re-grade re-asks the judge, it does not re-deliver a skill. The whole incident was
        unbounded afterwards precisely because nothing recorded which pi ran.
      - **`--canary` (green only, off by default).** One probe before the wave: list the
        `## ` headings of your own instructions. Anchors on the *longest* heading and
        never on frontmatter, since the description is always in context under
        progressive disclosure. Fail ⇒ abort before the spend, with force mode named as
        the fix; pass ⇒ `delivery_canary: pass` on the record (the journal is gitignored,
        so a validity claim has to live in `results.yaml` to survive a commit). Honest
        limit, stated in the docs: it proves the body is *reachable*, not that the model
        loaded it on every later turn — which is the argument for force, not against the
        probe.
      - Green runs without a canary now print a scorecard `NOTE:` naming the
        version-dependence and both remedies.
      - Found on the way: the review UI's `/rejudge` was dropping `source_hashes` and
        `partial` on write, silently retiring the staleness gate for any run re-judged
        from the browser. Now carried, with the one `rubric:` key it applied refreshed.
        The pi extension's flag parser dropped valueless flags entirely, so `--canary`
        would have been accepted and ignored.
      - Post: `docs/posts/2026-08-06-the-same-skill-text-scored-twice.md`

### Sprint 1.6 — Run-over-run stability (owner-supplied finding, 2026-08-06)

Released as **0.6.0** (2026-08-06). One item, optional in priority, high in value.

- [x] **Surface run-over-run verdict stability per scenario** (2026-08-06). The finding:
      `plan`/DS A5 and D1 swapped UNANIMOUS verdicts between two consecutive full force
      runs — A5 3/3 → 0/3, D1 1/3 → 3/3, each run internally `flakiness 0.00`. Within-run
      flakiness quantifies rep variance and says nothing about run-over-run stability, so
      the most confident-looking output the tool produces was the least trustworthy.
      `stability.ts` derives it on read (nothing persisted — a fact about a SET of runs
      cached inside one run is wrong the moment the next lands, the same argument
      `lift.ts` makes), and `collectScoredRuns` was extracted from `trends.ts` so there is
      **one** history walker rather than two definitions of "which runs count".
      Surfaces: a free `stability` command, a `⇄` line on a fresh run's scorecard, a
      `⇄ n/m` marker + tooltip on the review-matrix cell, and a `lint` note.
      **Two design calls worth keeping straight.** (a) *An edit is not a flip*: a step is
      counted only when the recorded `source_hashes` prove the scenario's own stimulus,
      rubric, gates, fixture and persona identical AND both runs aggregated the same way;
      rejected steps are reported with their reason, which is how D1's flip turned out to
      be an `agents/plan.md` edit rather than instability. (b) *`SKILL.md` is deliberately
      NOT one of those gates* — A5's flip happened across a skill edit aimed at another
      scenario, so gating on it would have hidden the finding; that flip is reported
      naming both readings (edit side-effect vs boundary cell) because the record cannot
      settle it. Third state `unmeasured` is load-bearing: one run has not been *shown*
      to be stable.
      **New idea: lint severity.** A boundary cell is not a defect, so its finding is
      `severity: "info"` (`ℹ`, `::notice`) and the exit code counts only gate-failing
      findings. A linter that reddens CI for "this cell needs more reps" teaches people
      to delete the scenario or stop reading the output.
      Named `volatility` rather than the `stability` the order suggested, for one reason:
      it sits next to `flakiness` in the same row, and `stability: 0.00` would have to
      mean "perfectly stable" — mixed polarity in one line of output is a footgun.
      - Post: `docs/posts/2026-08-06-flakiness-zero-is-not-stability.md`

### Sprint 1.7 — pi-native feedback loop (owner decision 2026-08-08)

Plan: `docs/superpowers/plans/2026-08-07-pi-native-regression-capture-program.md`.
Five pi-only capabilities as one incremental program: live conversation capture,
objective execution traces, subagent orchestration tests, instruction
coverage/affected-test selection, and confidence-aware rejudging.

**Placement is deliberate, and it is a reprioritization.** This sits ahead of the
unstarted Phase 2 launch work, at the owner's explicit call on 2026-08-08. The
argument for going first: the north star in Sprint 1.4 is measurement the engineer
never has to second-guess, and Phase 2's growth product is a *findings* post — a
findings post backed by objective trace gates and confidence-aware judging is a
materially stronger artifact than one backed by a single LLM judge over prose.
The cost is real and should not be dressed up: launch slips by the length of this
program, and Phase 2's metrics stay at baseline meanwhile.

Sequencing rules carried from the plan: **one phase at a time**, separate minor
releases per user-facing feature rather than one big drop, and pending captures
never enter `specification.yaml` before a human promotes them.

- [x] **Phase 0 — feasibility spike** (2026-08-08). Validated pi 0.83.0's JSON
      event contract against offline fixtures before touching the adapter, and
      found four things the plan had wrong. Design record:
      `docs/pi-native-capture-design-2026-08-08.md`; fixtures + provenance:
      `packages/adapters/test/fixtures/pi-json/`. Whole spike cost **$0.0035** in
      subject tokens; the extension-isolation proof cost nothing at all.
      - **The plan's transcript rule would have moved verdicts.** §4.2 said a
        trace carries "assistant text blocks excluding thinking"; print mode —
        what today's adapter actually shows the judge — emits only the **final**
        assistant message. Models emit text alongside tool calls, so the plan's
        rule would have fed the judge interim narration the transcript has never
        contained, on scenarios nobody edited. Proven byte-exact both ways on a
        deterministic prompt. Same class of silent epoch as
        `docs/force-epoch-2026-08-06.md`.
      - **The stream is quadratic.** `message_update` re-sends the entire
        accumulated message per delta: a three-tool-call run emitted **52 MB** of
        stdout wrapping 12 KB of terminal events. The JSON path must stream-parse
        and cannot reuse the buffering `exec()` helper — a memory bug that would
        have surfaced mid-wave on a long scenario, not in a unit test.
      - **Parallel tool calls complete out of order.** pi runs batched calls
        concurrently; ends arrive in completion order, not issue order.
        `toolCallId` is the only sound correlation key. `gpt-oss-20b` can't
        produce the shape at all (one call per round trip), so that fixture is
        pinned to `deepseek-v4-flash`.
      - **Extension isolation confirmed, stronger than assumed.**
        `--no-extensions --extension <path>` loads exactly the declared extension
        even under `-a` project-local trust. Tested via load-time stderr markers
        for **zero** model spend, since extensions load during `--help`.
      - Also: pi's `turn` is a round trip, not a user turn (the plan overloads the
        word); `session.cwd` and tool-error strings leak absolute paths; thinking
        appears in three separate events, so dropping it is three explicit filters;
        a tool's `details` survives verbatim and is the one stable structured
        channel for subagent normalizers.
      - `CaptureCaseV1` / `ExecutionTraceV1` fixed as types-only in
        `packages/core/src/capture-trace-types.ts` — no behavior, nothing wired in.
      - No post: a spike ships no user-facing feature. Rule 2 attaches from Phase 1.
- [x] **Phase 1 — `/skill-harness capture`** (2026-08-08). Turns the live conversation
      into a reviewable regression case: active-branch projection, contiguous turn
      selection, human-confirmed target, offline checklist draft, full preview, then
      save-pending or promote. Zero model calls; the optional single-scenario run is
      the only spend and it names the cost first.
      - **A pending capture is not in `specification.yaml`.** It lives in
        `<skill>/tests/captures/`. The `draft: true` alternative would have to be
        honored by every runner, scorer, linter, staleness check, lift computation
        and stability walker — forgotten once in either direction it either drags a
        ship grade down or drops a real scenario from a release run.
      - **Only user turns are committed.** Assistant prose is evidence for the human
        writing the expectation, never an oracle; it goes to a git-ignored sidecar.
      - **Redaction is the load-bearing part**, since captures get committed:
        thinking dropped at all three events pi emits it in, tool-result bodies never
        persisted (only name/isError/bytes/sha — a failing `read` embeds an absolute
        path in its error string), home dirs → `~`, secrets by shape and by key name,
        session path hashed. The preview step is the control, not a courtesy.
      - **Bug caught by its own test:** the promotion path hashed the spec
        immediately before appending, so the concurrent-edit guard covered
        microseconds instead of the minutes the interview actually takes. Baseline is
        now taken before the first question.
      - `spec-write.ts` is now the single validated atomic writer; `add-test` was
        refactored onto it so the two paths cannot disagree about a legal spec write.
      - Post: `docs/posts/2026-08-08-promote-a-conversation-to-a-regression.md`
- [x] **Phase 2 — structured traces + objective `assert.trace` gates** (2026-08-08).
      Declarative assertions over what the model DID, evaluated before the judge:
      `require_calls` (with min/max and argument predicates), `forbid_calls`,
      `unchanged_paths`. Valid on inline and seeded scenarios alike.
      - **A failed gate costs zero judge calls** — the ordering is the feature, and
        there is a test whose whole job is counting them.
      - **Missing evidence is ERROR, never a pass.** An adapter that cannot trace, a
        structured run yielding no trace, an unreadable saved trace: all ERROR. A
        result with no `objective` field means *not declared*, never *passed* — the
        one collapse that would silently upgrade the whole legacy corpus.
      - **The DSL is closed.** Seven comparison operators, no expressions, no
        callbacks. A spec arrives from a repository; giving it a code path would make
        "add a test" and "run arbitrary code in CI" the same act. Unknown keys are
        rejected rather than ignored — a silently-dropped `forbid_call` reads in
        review as protection while asserting nothing.
      - `assert.trace` is bucketed as a **gate** facet, so lint names `regate` (free)
        as the remedy — and `regate` was extended to honour it, reading saved
        `.trace.jsonl` artifacts. A run predating trace capture is refused with "needs
        a re-run" rather than answered from no evidence.
      - **Bug caught while wiring regate:** prior-gate state was read only from the
        seeded transcript trailer, which trace-gated inline scenarios do not have, so
        a gate flipping to PASS never triggered the re-judge it needed — leaving a
        stale FAIL verdict beside a PASS objective.
      - Existing scenarios keep their execution path. `runStructured` is opt-in per
        scenario; transcript parity is proven but proven on a handful of fixtures,
        which does not justify silently re-running a published corpus.
      - Post: `docs/posts/2026-08-08-assert-the-trace-not-the-story.md`
- [x] **Phase 3 — first-class subagent orchestration tests** (2026-08-08). Makes the
      PARENT testable, not just the subagent prompt `system_prompt_file` already
      covered. Three layers, graded separately: **selection** (did it delegate, to
      the right agent) and **handoff** (did the task carry required context, and
      withhold forbidden content) are objective; **integration** (did the final
      answer use the child's report) stays with the checklist judge, because
      pretending that is objective would be this tool's whole failure mode. A
      scenario can pass the first two and fail the third — there is a test for it.
      - **`env.extensions` is closed loading**, not additive: `--no-extensions` plus
        one `--extension` per declared path, so nothing the developer happens to have
        installed joins the test. A missing declared extension is a hard error before
        pi is spawned — pi would otherwise start fine, the tool simply wouldn't
        exist, and the scenario would grade a model that never had the option.
      - **Extensions are STIMULUS; assertions are GATES.** Editing an assertion
        changes only what we conclude from evidence on disk (`regate`, free); editing
        an extension changes what the model could DO, so only a re-run can answer.
        Extension *contents* are hashed, so editing your subagent tool marks results
        stale without a character of the spec changing.
      - **Nothing assumes a universal subagent extension.** Normalizers cover the
        single/parallel/chain shapes and the spec declares the tool name; an
        unrecognized shape yields nothing rather than a guess, because inventing an
        `agent` field would be a confident assertion about something nobody wrote.
        Unknown extensions still work via plain `require_calls`.
      - `draftSubagentAssertion` can prepopulate `tool`/`agent`/`count` from a captured
        delegation, but the capture command does not call it yet — `captureToScenario`
        emits no gates. Reachable from the library, not from `/skill-harness capture`. It
        deliberately never `task_contains` — the text that WAS sent is not the text
        that is REQUIRED, and proposing it manufactures a brittle assertion the
        author never reasoned about.
      - Also closed the open Phase 2 lint gap: `env.extensions` paths are validated
        statically, so a typo is a free CI failure rather than a graded absence.
      - Post: `docs/posts/2026-08-08-testing-the-parent-not-just-the-subagent.md`
- [x] **Phase 4 — instruction coverage + affected-test selection** (2026-08-08).
      Two free, offline commands: `coverage <skill|all> [--strict]` and
      `affected <skill> [--base ref]`, plus `run --affected` and pi-extension
      subcommands. Scenarios opt in with `covers: ["../SKILL.md#core-principle"]`;
      the unit is a Markdown heading section, because that is the unit authors
      already write in.
      - **It is called DECLARED coverage everywhere**, and the output says
        "declared link, not proof". A coverage number read as proof is worse than
        none: an author who believes 100% means done stops looking. `--strict` is
        therefore opt-in — an uncovered section is information, not a defect, and a
        gate on it teaches people to add a token `covers:` to silence it. A
        *broken* reference does fail regardless, since that is a wrong statement in
        the spec rather than a gap, and the finding names near-miss slugs because a
        renamed heading is the usual cause.
      - **Selection resolves every ambiguity toward MORE.** Under-inclusive is
        dangerous (ship a regression); over-inclusive is merely expensive. So every
        critical and B-series scenario always runs, a scenario with no `covers` is
        always selected, changed fixture/post-test/agent-file/extension selects its
        scenario, and a renamed-away file or a wholesale rewrite selects
        everything. Every selection prints a reason — one you cannot interrogate is
        one people stop trusting.
      - Reuses the existing `--only` machinery, so an affected run inherits
        partial/never-SHIP through the same code path rather than a parallel one.
      - **`covers` is in NO staleness facet** — it is metadata. Editing it changes
        what `--affected` selects next time, not what any past run measured;
        charging a re-run for a label is the trap the facet split removed. The
        exhaustive-destructure guard forced that decision to be written down.
      - **Bug the unit tests missed:** YAML frontmatter closes with `---`, and the
        line above a `---` is a Setext h2 per CommonMark — so every `SKILL.md` had a
        phantom section named after its own `description:` line, sitting where a
        whole-file `covers` would mark it covered. Nine passing heading tests, found
        in ten seconds by running the command on a real skill.
      - Post: `docs/posts/2026-08-08-which-instructions-have-no-test.md`
- [x] **Phase 5 — confidence-aware automatic rejudging** (2026-08-08). Asks an
      untrustworthy cell again instead of publishing it. Four triggers computed from
      the COMPLETE first wave: `ambiguous`, `contradictory` (the misfire quarantine,
      now with a remedy), `non_unanimous`, and `ship_deciding` — a counterfactual
      against the **real scorer**, so min-pass/critical/B-series all move it and no
      second copy of the ship rules can drift.
      **Motivated by our own measurement**: 1 disagreement in 57 judgments (~2%), and
      the one that mattered was `git-ops` A9 — a published FAIL that was a 1-in-7
      minority draw, the difference between 93% and 100%.
      - **Off by default, and spec configuration alone never authorizes a call.** The
        only switch is `--auto-rejudge`; a test asserts a misfired cell costs exactly
        zero extra calls without it. Preflight prints the exact ceiling first.
      - **The preflight quotes CALL COUNTS, never dollars.** The default judge is a
        Claude subscription and reports no per-call usage, so a dollar figure would be
        invented — and invented numbers are this tool's cardinal sin. (Metered
        reference, measured on the real corpus: ~760 in / ~130 out tokens per call ≈
        $0.008 at Opus rates; 674 cells worst case ≈ $11.)
      - **`unresolved` reuses the existing suspect gate** rather than adding a second
        ship rule — two rules drift, one cannot.
      - **A malformed answer is not a vote.** Consequence that fell out rather than
        being designed: when the FIRST wave misfired it is not a clean vote either, so
        a contradictory cell needs TWO fresh judgments to agree. A misfire cannot
        confirm itself.
      - Caps at 3 judgments, not configurable; adjudicates one documented rep rather
        than the rep that would move the headline; human overrides survive untouched.
      - **Bug caught by its own test:** the ship-deciding counterfactual cleared
        `suspect` on only one side, so the baseline stayed blocked-by-suspect and
        EVERY suspect cell reported as ship-deciding for the wrong reason.
      - **Surfaced everywhere** (2026-08-08): review-UI cell markers `◉` (objective)
        and `⚖` (adjudication) in the existing `⇄` pattern; a two-step
        `POST /adjudicate` that prices before it charges; and pi-extension parity via
        `/skill-harness judge --auto-rejudge`. The browser offers no tie-break judge
        (choosing a third judge is a judge decision a UI cannot make honestly), so a
        disagreement raised there stays unresolved and blocks SHIP; the extension does
        accept one, since the author types it. Under `-p` the flag itself is the
        authorization, said out loud so the consent path is visible.
      - **Second bug, same feature:** `resolveAdjudicationJudges` took an
        eagerly-parsed `subject` argument, so a run whose recorded model is not
        `provider:model` threw before the `enabled` early-return — killing a regrade
        that had not even asked for adjudication. Now takes a token, parses after the
        check, and warns instead of failing when it is unreadable.
      - Post: `docs/posts/2026-08-08-when-one-judge-is-not-enough.md`

### Sprint 1.8 — Real-pi smoke coverage (2026-08-08)

- [x] **`scripts/smoke-real-pi.sh`** — the three paths a fake adapter cannot reach:
      `runStructured`'s spawn + streaming JSONL reader, the `--extension` argv the
      harness passes to pi, and the live judge loop under `--auto-rejudge`. One
      scenario covers all three; a single-scenario spec (min_pass == total) makes the
      cell always `ship_deciding`, so adjudication is guaranteed to fire. Committed as
      a hand-run script, never CI, and wired into `PUBLISHING.md` as a pre-publish step.
      - **It immediately found a real bug**: `grade` silently dropped the `objective`
        field from `results.yaml`, so a trace-gated scenario re-read as "no assertions
        declared" — the dangerous direction — while 1,036 tests passed. `regate` had the
        mirror-image bug for `adjudication`.
        Fixed per command, because the correct contract differs: `grade` carries
        `objective` (it does not re-evaluate gates) and drops `adjudication` (it replaced
        those judgments); `regate` recomputes `objective` (that is its job) and carries
        `adjudication` (it asks no judge anything); `rescore` carries both (it
        re-measures nothing). `packages/core/test/field-roundtrip.test.ts` now covers
        every writer × every optional field — the round-trip suite the plan asked for
        and nobody had written.
      - Also observed live, on the third run: the judge **disagreed with itself** on the
        same transcript (#1 PASS, #2 FAIL) — a real instance of the ~2% variance Sprint
        2.3 measured, and the `unresolved → suspect: true → blocks SHIP` path firing on
        real data rather than a fixture.
      - Asserts on artifacts, not exit codes: trace version and `pi_version` recorded,
        the declared extension's `Agent` call present with the right agent, and no
        thinking / home paths / tool-result bodies persisted — the privacy limits
        verified against a real stream instead of a sanitized fixture.

### Sprint 1.9 — One choke point for result rewrites (2026-08-08)

- [x] **`rebuildScenarioResult` + an exhaustive-destructure guard on `ScenarioResult`.**
      Four of this sprint's five bugs came from the same shape: a rewriter or an
      argument that looked cheap. The `objective`/`adjudication` drops were the third
      instance, and unlike the others they needed a paid smoke run to surface because
      1,036 tests passed straight through them.
      The `sources.ts` facet guard has caught this class at COMPILE time three times
      for `Scenario`; ``ScenarioResult`` had no equivalent. Now it does: every rewriter
      goes through one function that destructures every field, so adding one fails the
      build until someone chooses `carry` / `fresh` / `drop`. Verified by adding a
      probe field — `results.ts(517,9): Type '{ guardProbe?: string }' is not
      assignable to type 'Record<string, never>'`, naming the field.
      - The policy per command is now stated in code rather than implied by a spread:
        `grade` carries `objective` and drops `adjudication`; `regate` recomputes
        `objective` and carries `adjudication`; adjudication carries `objective` and
        writes `adjudication` fresh; the review server's `/rejudge` shares `grade`'s.
      - `override`/`note` are carried unconditionally and are deliberately NOT policy —
        no command re-measures a human's judgement.
      - A dropped field is OMITTED, never set to `undefined`, so a result with no
        evidence still serialises byte-identically to one written before the field
        existed.
      - 21 tests in `field-roundtrip.test.ts`: every command × every field, the
        dangerous direction (dropping `adjudication` + `suspect` would un-block a
        blocked run), and a runtime backstop asserting no key escapes the known set.

### Sprint 1.10 — Risk-adaptive workflow measurement (owner work order, 2026-08-20)

- [x] **Versioned trajectory assertions, principal/pi-daddy normalization, paired compare,
      critical repetition gates, mutation self-test, and cost/latency reporting** (2026-08-20,
      implementation working tree). Objective workflow events now cover phase/state/authority/
      capability/workspace/evidence/finalization contracts before the judge; `compare` preserves
      paired artifacts and never overclaims seeded sampling; `mutation-test` proves 15 assertion
      classes turn red offline. The principal v3 skill cells and eight live workflow E2E cells remain
      explicitly unrun. Sandbox delivery is bounded to an interface + fake; no containment claim.
      Post: `docs/posts/2026-08-20-the-final-answer-is-not-the-workflow.md`

### Sprint 1.11 — Qualification packet execution integrity (owner repair, 2026-08-28)

- [ ] **`qualification-runner-v1` + pi-daddy ledger-v3 consumer.** A separately
      versioned, external-config-only runner for future Principal qualification
      packets: durable prepare/start/status/poll/validate/abort lifecycle; exact-once
      launch accounting; OAuth-only sanitized child environment; detached deadline
      supervision; no automatic retry; provider/model artifact attestation; and a
      separate production ledger-v3 selector preserving execution ancestry and
      workflow facts while leaving 0.17/v2 unchanged. Infrastructure only — no board,
      holdout, measurement identity, or model call. Implementation branch:
      `feat/qualification-runner-v1`; replace with PR/merge identities when landed.
      Post: `docs/posts/2026-08-28-one-call-means-one-launch.md`

## PHASE 2 — Launch & first 100 fans (weeks 5–10)

**Goal:** exist in the heads of everyone who writes skills.
**Exit criteria:** ~500 stars; 20+ external issue-filers; listed in pi ecosystem docs +
2 awesome-lists.

### Sprint 2.1 — pi-native launch
- [ ] Post in pi GitHub Discussions/Discord; X thread; r/LocalLLaMA multi-model
      comparison post ("deepseek vs kimi on the same skill")
- [ ] Ask for a pi ecosystem-docs listing (we install as a pi skill — natural ask)
- [ ] Submit to awesome-cli-coding-agents + one more list
- [ ] Enable GitHub Sponsors
- Metric: 100 stars. Key task: one pi maintainer acknowledges/tries it.

### Sprint 2.2 — Show HN + findings bomb
- [x] **Findings post — drafted 2026-08-08**:
      `docs/posts/2026-08-08-ninety-three-percent-and-still-not-shipping.md`.
      **The headline the data actually supports is not the one this line predicted.**
      "X% fail under pressure" turned out to rest on 23 green / 11 force under-pressure
      cells — 3 failures each — and dressing 3/11 up as "27% of skills fail under
      pressure" would have been exactly the kind of number this project exists to
      refuse. The defensible finding is stronger anyway: **91–94% pass, and only 7 of
      21 green runs ship** (6 of 11 in force). Pass rate and ship bar disagree most of
      the time, and the gap is 14 critical failures plus the pressure cluster.
      - Paired lift, via the harness's own `collectLift` over 147 comparable cells:
        **red 62% → skill-on 93%**, 48 gained vs 2 regressed. `plan` alone goes
        36% → 89%. 12 mode-insensitive cells correctly excluded; 0 aggregation
        mismatches (the whole corpus is `--reps 3`).
      - Also reportable, and unexpected: **zero unresolved judge misfires** across all
        166 committed runs — not because the judge never misfired, but because every
        one was resolved before commit. The quarantine worked as a *process*. Plus 5
        author overrides.
      - `build` green 56% / 0-of-3 under pressure vs force 93% / 2-of-3 is the
        green-delivery incident visible in committed data.
      - **Scoped honestly**: these are the owner's own 7 skills, not popular
        third-party ones — the 2026-08-04 survey found "popular AND pi-native AND
        testable" is not currently a set that exists. The post says so in its own
        "What this is not" section rather than in a footnote.
      - Reproducible by anyone: `scripts/corpus-findings.mjs` and
        `scripts/corpus-lift.mjs`, both free and offline over the public corpus.
      - **Still owner-only:** the interactive report link, and actually posting it.
- [ ] Show HN with the findings post (not a bare repo)
- [ ] PRs/issues to 3+ tested skill repos with their reports attached (every tested
      author is a warm lead)
- Metric: HN front page or 300 cumulative stars.

### Sprint 2.3 — Judge-reliability essay
- [ ] Deep-dive post on misfire detection with real numbers from our runs
      ("your LLM judge contradicts itself and you'd never know")
      — **draft exists**: `docs/posts/2026-08-04-judge-contradicts-itself.md` (2026-08-04).
      **No longer blocked on the numbers** (2026-08-04): re-judging saved transcripts
      holds the subject constant, so movement is the judge — **1 disagreement in 57
      judgments across 12 rep-cells (~2%)**, 45 judge calls, zero model spend. Write-up:
      `principal-pi-skills/docs/judge-variance-2026-08-04.md`. Model and judge variance
      are separable: `git-ops` A4's 2/3 is the *model* (same rep fails 4/4), while A9's
      published FAIL was a 1-in-7 *minority judge draw* — the difference between
      `git-ops`/DeepSeek reading 93% and 100%. Implied practice + candidate feature:
      judge a non-unanimous cell twice before publishing; unanimous cells reproduced
      perfectly. Numbers are cited in the draft's owner-notes, not folded into the body —
      this is Phase 2 and Phase 1's exit criteria are unmet, so nothing launches yet.
- Metric: 3 unsolicited mentions by others.

## PHASE 3 — Generalize to the Agent Skills standard (months 3–5)

**Goal:** harness-agnostic in fact, not just in interface.
**Exit criteria:** claude-code subject adapter used by strangers; a third adapter
contributed or in PR by someone external; 1,000 stars.

### Sprint 3.1 — claude-code subject adapter
- [ ] Implement `HarnessAdapter` for `claude` CLI as a *subject* (judging already routes
      through it); green/red/force parity; same spec runs on pi and Claude Code
- [ ] De-hardcode default subject/judge models (config file > flags > baked defaults;
      currently duplicated in cli.ts, runner.ts, commands.ts)

### Sprint 3.2 — Relaunch positioning
- [ ] Update README/SKILL.md/npm descriptions to "test loop for Agent Skills"
- [ ] r/ClaudeAI launch post + Claude Code-focused quickstart
- Metric: 1,000 stars.

### Sprint 3.3 — Contributor pipeline
- [ ] Adapter authoring guide + template; make adapters the celebrated extension point
- [ ] 10 curated good-first-issues; CONTRIBUTING.md
- Metric: first external adapter PR.

## PHASE 4 — Community engine + early revenue (months 5–9)

**Goal:** recurring reasons to come back.
**Exit criteria:** monthly skill report has an audience; GitHub Action used in 20+ repos;
Sponsors ≥ $200/mo or first paid audit.

- [ ] Public skill scoreboard: static site auto-built from the example suite; re-run
      monthly against new models; publish movement (recurring, automatable content)
- [ ] Skill-CI story: polish `action.yml`, "gate your skills repo on the ship bar" guide
- [ ] First money: Sponsors push; offer fixed-price skill-audit engagements ($3–8k)

## PHASE 5 — Open-core hosted layer (months 9–12+)

**Only if Phase 4 exit criteria were met.** Hosted trends/team layer on the existing
journal.jsonl stream: run history, team review queues, regression alerts, org skill
registry. Local loop stays free forever. Sketch: free / ~$29 seat/mo / enterprise.
Do not announce paid plans before ~2,000 stars + visible CI adoption.

---

## Risks to watch

1. **Platforms ship first-party skill testing** (Anthropic/OpenAI are both publishing
   guidance). Counter: neutrality + rigor — cross-harness, cross-model, judge-trust
   gating, human review loop.
2. **Distribution never happens at 10–15h/wk.** Counter: rule 2 (every feature ships
   with a post); findings posts are the growth product.
3. **Skills paradigm shifts.** Counter: keep the core loop artifact-agnostic — it tests
   "an agent given instructions against scenarios"; skills are go-to-market, agent-behavior
   regression testing is the durable capability.

## Scoreboard (update as measured)

| Metric | Now (2026-07-06) | P2 target | P3 target |
|---|---|---|---|
| GitHub stars | 0 | 500 | 1,000 |
| External issue-filers | 0 | 20 | 40 |
| npm weekly downloads | ~0 (registry has no stats yet) | 100 | 500 |
| Repos using the Action | 1 (self) | 5 | 20 |

_Last measured 2026-07-06 (GitHub API + npm downloads API). Still at baseline —
Sprint 1.1 (`init` + `suggest`) has shipped to the branch/PR but this is pre-launch,
so no distribution movement is expected yet. Phase 2 launch is what moves these._
