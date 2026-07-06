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
**Exit criteria:** `init` + spec-generation shipped; quickstart verified ≤10 min on a
fresh machine; demo GIF recorded; 5 popular external skills graded in a public example.

### Sprint 1.1 — Ship & smooth the funnel
- [x] Publish 0.1.0 to npm (done)
- [x] `skill-harness init <skill>` — scaffold `tests/specification.yaml` with a commented
      template (spec-writing friction is the #1 onboarding killer) (2026-07-06, feat/init-suggest)
- [x] `skill-harness suggest <skill>` (or `init --draft`) — LLM-drafts a spec from the
      skill's own SKILL.md: scenarios, checklist, proposed critical set; human edits
      before first run. **Single most important task of the phase.** (2026-07-06, feat/init-suggest)
- [ ] Rename `SKILL_CHECK_*` env vars to `SKILL_HARNESS_*` with back-compat fallback
- [ ] Fresh-machine quickstart run-through; fix everything >10 min. Metric: ≤10 min.

### Sprint 1.2 — Make it demoable
- [ ] Surface red-vs-green as an explicit **lift** column in results + report
      ("does this skill do anything?" — neutralizes the rival's best feature)
- [ ] Flagship example: public repo (or `examples/`) with specs for ~5 popular skills
      (superpowers, anthropics/skills candidates), multi-model results committed
- [ ] 30-second demo GIF: edit SKILL.md → re-run → grade C→A. Store under `assets/` or link from README
- [ ] README top: positioning sentence + GIF + 3-command quickstart above the fold

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
