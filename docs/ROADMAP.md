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
(`principal-pi-skills`, 7 skills × 3 models); demo GIF recorded ⬜ — **the only one left**.
Reworded 2026-08-04: "5 popular *external* skills" moved to Phase 2, where its value
(credibility, warm leads) actually lives. See the Sprint 1.2 entry for why.

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
      **Closed 2026-08-04**: 0.3.0 is published for all four packages and `latest` serves
      it; verified by installing the published tarball into a clean prefix and confirming
      `init`/`suggest`/`lint` are in `--help`. Both paths now onboard.

### Sprint 1.2 — Make it demoable
- [x] Surface red-vs-green as an explicit **lift** column in results + report
      ("does this skill do anything?" — neutralizes the rival's best feature)
      (2026-08-04) — `core/lift.ts`, derived on read (never persisted, so it can't go
      stale); scorecard `LIFT:` line + per-column/per-cell markers in the review UI;
      `inconclusive` class keeps ERROR/misfire noise out of the number.
      **Shipped but never exercised on real data** (found 2026-08-04): all 82 committed
      `results.yaml` in `principal-pi-skills` are `mode: green` — there is not one
      red-mode run anywhere, so no `lift` has ever been computed outside unit tests.
      Measuring it costs a full second pass (~426 rep-executions for 5 skills × 2 models
      at `--reps 3`), which is why it is parked rather than done. Two things to fix first,
      both free:
      - **`lift` silently compares mode-insensitive scenarios.** `pi.ts` treats an
        agent-file run as *the* system prompt — "no skill activation, whatever the mode" —
        so the 6 `system_prompt_file` scenarios (`debug`/`plan`/`review` D1+D2) are
        byte-identical in red and green. `computeLift` classes them `kept`/`both-fail` and
        folds them into the denominator, understating lift with cells where the skill was
        loaded on *both* sides. Needs a `mode-insensitive` class or an exclusion reported
        like `greenOnly`/`redOnly` already are
      - Red runs at the same `--reps` as green, or the two sides aggregate under different
        majority policies and the comparison is not like-for-like
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
- [ ] 30-second demo GIF. **Script written and tested — only the screen recording is
      left** (2026-08-05): `assets/demo/demo.sh`, one take, `DEMO_DELAY` sets the beat.
      Three beats: `list` (7 skills) → `lint` green, then one dropped `t` in a fixture
      marker yields 4 findings and exit 1 → `rescore` on two committed runs showing
      `git-ops` 93% → 100%. **Deliberately not** "edit SKILL.md → re-run → grade C→A": a
      live re-run spends subject+judge tokens and takes minutes, so the demo uses only
      free/offline commands and takes its grade movement from runs already on disk. Trade:
      no skill visibly *improving*, but every frame is reproducible by a viewer at zero
      cost against a public repo. Recording is a manual step — `vhs`/`asciinema`+`agg`
      would render it headlessly but neither installs here (cargo 1.75, no rustup, both
      need `edition2024`; `pip` is PEP-668 managed). See `assets/demo/README.md`
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
