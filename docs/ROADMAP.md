# skill-harness — Strategy & Roadmap

> Agent-executable strategy doc. Produced 2026-07-06 from a full codebase + market analysis.
> Agents: read **Context & Rules** before picking up any task. Work top-down within the
> current phase; do not start a later phase until the current phase's exit criteria are met.
> Check off tasks (`[x]`) as they land and note the date + PR/commit next to them.

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
- **Status already done:** name kept as `skill-harness`; published to npm 0.1.0.

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
- [ ] **Items 1 + 2 — split the staleness identity, and `regate`** (the design change).
      One `scenario:<id>` digest covers stimulus, rubric and policy together, so
      lint's only remedy for any drift is "re-run". Split into `stimulus:` (→ `run`),
      `rubric:` (→ `grade`, judge-only), `policy:` (→ `rescore`, free) and `gates:`
      (→ `regate`, free + judge-on-flip), each lint message naming its cheapest
      honest remedy. `regate` re-evaluates needle gates against the saved `.diff.txt`
      artifacts: measured at **9 judge calls instead of 81 rep-executions** for the
      C2 needle fix. Migration is half-built already — `currentHashFor` returns
      undefined for unknown prefixed keys, so new kinds degrade silently on old
      readers.
- [ ] **Item 3 — workspace hygiene**: `git add -A` in `runSeeded` stages vitest's
      `node_modules/.vite` cache into the captured diff. No gate in the corpus was
      affected, but the channel is live both ways (a needle matching a test filename
      passes for free; `diff_excludes` can false-fail on a path string) and it pads
      every diff the judge reads. Fix at workspace materialization: append
      `node_modules/` to `<repo>/.git/info/exclude` — invisible to the model, applies
      to every git call, fixtures unchanged.
- [ ] **Item 4.3 — downgrade tripwire**: `run`/`grade`/`lint` compare their own
      version against the newest `harness_version` in the tree they touch. Older tool
      + newer records ⇒ `run` refuses, `grade`/`lint` warn loudly. Inert until fresh
      runs carry the field, like `source_hashes` was. Measured near-miss it kills: a
      stale global **0.1.0** would have spent ~102 rep-executions grading without the
      diff — the exact defect being re-measured — and every number would have looked
      plausible.

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
- [ ] Findings post: "I ran N popular agent skills through an LLM-judged harness with
      anti-gaming tripwires — X% fail under pressure" + interactive report link
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
