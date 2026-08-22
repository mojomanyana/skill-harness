# Codex subject axis + pi-daddy arms axis — design

*Written 2026-08-22. Owner-supplied work order, brainstormed and measured against the
repo before anything was designed. Every claim below that could be checked was checked;
the one assumption that remains is named as a spike and blocks the rest.*

Goal: measure `principal-pi-skills` on the three OpenAI-Codex models under the owner's
subscription, judged by Opus on the Claude subscription, and measure the same corpus with
and without pi-daddy loaded. Deliverable is a console runbook the owner executes himself.

---

## 1. What needs no work

Two thirds of the original request is already satisfied by software that exists.

**The Codex provider is in pi, not missing from skill-harness.** pi here is 0.84.2 and
`pi --list-models` reports an `openai-codex` provider carrying `gpt-5.6-sol`,
`gpt-5.6-terra`, `gpt-5.6-luna` (plus `gpt-5.3-codex-spark`, `gpt-5.4`, `gpt-5.4-mini`,
`gpt-5.5`).

**It is already on the subscription, not a metered key.**

```
$ pi auth check --provider openai-codex --json
{"status":"ready","provider":"openai-codex","authType":"oauth"}
```

Nothing in skill-harness would refuse this: `assertJudgeAllowed` is deliberately never
applied to the subject model (`judge-policy.ts` — "paying to run the model under test is
what a run *is*"). And the judge≠subject guard cannot misfire here, because
`judgeResemblesSubject` (`grade.ts:105`) requires the same provider, and `openai-codex`
is not `claude-code`.

**The judge is already the default.** `BAKED_DEFAULT_JUDGE = "claude-code:claude-opus-4-8"`
(`defaults.ts:17`), routed through `claude -p` on the subscription. No flag needed.

## 2. Decisions locked

| Decision | Value | Why |
|---|---|---|
| Subject models | `openai-codex:gpt-5.6-{sol,terra,luna}:medium` | Owner's three, "mid thinking" → pi's `medium` |
| Judge | `claude-code:claude-opus-4-8` (default) | Subscription, distinct provider from subject |
| pi-daddy arm | Extension loaded, not a governance preamble | pi-daddy ships no `SKILL.md`; it *is* an extension |
| Arms | 2 — `none`, `pi-daddy` | Confound accepted, reported honestly (§5) |
| Mode | `force` only | Only mode where the arm varies one thing (§6) |
| Scope | Staged: Wave 0 pilot → Wave 1 subset → decide | Measure before spending a wave |
| Arm mechanism | Corpus-side `arms.yaml` + `--arm`, arm in the run tag | No spec digest moves; committed runs stay valid |

## 3. Deferred, deliberately

Both were considered, designed far enough to cost out, and parked by owner decision.

- **Per-skill model pinning.** Decide after Wave 0, once there is evidence that the models
  even differ enough to be worth pinning. Findings that must survive to that decision are
  in §10 — in particular, a pin cannot live in a document `force` delivers, or writing it
  invalidates the measurement that justified it.
- **Purging the fireworks-era results.** Nothing in the campaign blocks on it: Wave 0's
  runs land in their own arm-tagged directories and collide with nothing. Findings that
  must survive are in §11.

## 4. Model axis — one spike, then probably nothing

`parseModelRef` (`adapters/types.ts:14`) splits on the **first** colon only and lets the
model half keep further colons. pi documents `--model` as accepting `provider/id` and an
optional `:<thinking>`. So `openai-codex:gpt-5.6-sol:medium` should reach pi as
`--provider openai-codex --model gpt-5.6-sol:medium` with **zero code change**, and
`modelSlug` (`adapters/types.ts:28`) sanitizes it to a distinct, stable
`pi-openai-codex-gpt-5.6-sol-medium` tag — dots survive its character class, the colon
becomes a dash, and a different thinking level is therefore a different tag.

**This is the one unverified assumption in the design and it blocks everything else.**
`pi --list-models "gpt-5.6-sol:medium"` returns no match, but that path is a fuzzy name
search and does not parse the suffix, so it proves nothing either way.

**Spike (do first, ~3 tiny calls):** run `--mode json` with `--model gpt-5.6-sol:medium`,
with `--model gpt-5.6-sol --thinking medium`, and with `--thinking off`, and compare the
reported usage. If the first two agree and differ from the third, the suffix binds.

### Spike result, 2026-08-22: BLOCKED, question still open

Run, and it could not answer the question — for a reason worth more than the answer.
All three calls failed identically with `stopReason: "error"`, zero tokens, and a
`provider_transport_failure` diagnostic ("WebSocket error",
`openai-codex-responses.js:948`). Repeated on `gpt-5.4` as well, so it is not model-specific.

Text mode gave the true cause that JSON mode masked:

```
$ pi --no-context-files --no-extensions --no-skills --no-session \
     --provider openai-codex --model gpt-5.6-sol -p "Reply with exactly: ok" </dev/null
exit=1
stderr: Encountered invalidated oauth token for user, failing request
```

**The Codex OAuth token is invalidated.** Credentials live in `~/.pi/agent/auth.json`.
Re-authentication is an owner action; the spike must then be re-run before Wave 0, because
the thinking-suffix question is still genuinely open.

Two consequences that outlive the token:

- **`pi auth check` is not a pre-flight gate.** It reported
  `{"status":"ready","authType":"oauth"}` against this invalidated token. It verifies that
  a credential exists and refreshes, not that it works. The runbook must probe with one
  real call instead.
- **JSON mode is the *worse* diagnostic here, not the better one.** It reports a generic
  transport failure and **exits 0**; text mode reports the real message and exits 1. Do not
  assume `--structured` improves failure visibility — see §7b.

**Fallback if it does not bind:** accept an optional third segment in `parseModelRef`
(`provider:model:thinking`) and emit `--thinking` in `pi.ts`'s `common` array. Two files,
contained. `modelSlug` must keep producing distinct tags per level either way.

## 5. The arms axis

### Why not the two obvious alternatives

- **`env.extensions` in the spec** (already supported, zero new code) is wrong for a
  comparison: it is a spec edit, so the digest moves, `lint` stales the corpus, and the
  control and treatment become textually different experiments.
- **`compare`** does paired setup on identical spec/model/mode/judge/reps and has
  regression exit codes, but "candidate" would still have to declare the extension in its
  spec — inheriting the same digest problem — and `compare` reports partial/affected and
  never SHIPs. Better as a later reporting layer over two arm runs than as the mechanism.

### The mechanism

`<skills-root>/tests/arms.yaml` — committed, beside the specs, part of **no** digest:

```yaml
arms:
  - name: pi-daddy
    extensions: [~/prepos/pi-daddy/packages/pi-daddy/extensions/grants.ts]
    seed_skills: [agents]              # → <workspace>/.pi/skills/*.md
    require_definitions: 6
    env:
      PI_GRANTS_GRANT: "tool:read,tool:grep,tool:find,tool:ls"
      PI_GRANTS_MAX_DEPTH: "1"
      PI_GRANTS_LEDGER: "<run-dir>/pi-daddy.ledger.jsonl"
```

`<run-dir>` is the one substitution the harness performs on this file, so each run's ledger
is isolated. `seed_skills` paths resolve against the **skills root**, not the skill dir —
`agents/` is corpus-level, shared by every skill. `require_definitions` is a minimum, not
an exact count.

`run` gains `--arm <name>`. Omitted means the implicit `none` arm — today's behaviour,
byte-identical, no new flags in the existing path.

**The arm is part of the run's identity, not of the spec's digest.** `runDirFor`
(`results.ts:272`) currently yields `tests/results/<harness>-<modelSlug>/<ts>/`; the arm
appends to the tag: `pi-openai-codex-gpt-5.6-sol-medium+pi-daddy/`. `+` is deliberate and is
appended *outside* `modelSlug` — its character class (`[^A-Za-z0-9._-]`) cannot emit a `+`,
so the separator can never occur inside a slug and the tag stays unambiguously splittable
back into model and arm. This is the load-bearing choice: `lint` and `stability` both key
on the tag, so the two arms become separate
lineages that can never be misread as a run-over-run verdict flip of the same thing — and
because no `specification.yaml` byte moves, **all 202 committed runs stay valid and the
101 lint findings do not grow.** (202 is measured — one `results.yaml` per run dir. The
roadmap's "~104 runs" dates from 2026-08-04 and is stale.)

`results.yaml` records an `arm:` block — name, resolved extension paths, seeded definition
count, and the root grant — so the record states what was loaded rather than implying it.

### Why seeding is required at all

pi-daddy resolves spawnable definitions from `<cwd>/.pi/skills` and
`~/.pi/agent/skills` (`catalog.ts:55`, consumed by `definitions.ts:205`). skill-harness runs
pi in a **neutral temp workspace**, and `~/.pi/agent/skills` is an empty directory on this
box. So loading the extension alone gives pi-daddy *nothing to spawn*: the arm would run
green, look fine, and measure nothing. The arm therefore copies the corpus's `agents/`
(6 definitions) into `<workspace>/.pi/skills/` as flat `.md` definitions — which is a shape
`definitions.ts` already accepts.

### Three refusals, before a token is spent

Positive-only checks are the failure mode this repo keeps re-learning, so each of these
gets a negative control in the suite:

1. Seeding yields fewer than `require_definitions` → ERROR. Missing evidence is ERROR.
2. An extension path does not exist → throw (existing `extensionFlags` rule).
3. **`~/.pi/agent/skills` is non-empty → ERROR.** pi-daddy reads that root too, so ambient
   definitions would silently vary the measurement. It is empty today; that is luck, not a
   guarantee, and this is the same class as the `--skill <nonexistent>` incident.

### Containment is still unavailable

The arm hands a model a spawn tool that can reach `bash`, and the `SandboxBackend` seam
remains fake-backed. Hence the narrow root `PI_GRANTS_GRANT` and `PI_GRANTS_MAX_DEPTH: 1`
above. **Any report from this campaign must keep saying containment is unavailable.** The
narrow grant is a bound on the intended path, not containment.

### The arm needs a delivery proof

This is `--canary`'s lesson applied to the arm. If no ledger event is written in any
scenario, the model never delegated, and "pi-daddy changed nothing" is indistinguishable
from "pi-daddy was never used" — a vacuous result shaped exactly like a finding. Pointing
`PI_GRANTS_LEDGER` into the run dir makes spawn events countable per run; **a zero count is
reported, never silently passed.** The pinned ledger-v2 contract and `assert.trajectory`
can read that evidence later; Wave 0 does not need gates on it.

### The confound, stated once and kept stated

Today no spec declares `env.extensions`, `require_subagents` appears in zero specs, and
skill-harness always passes `--no-extensions` — so in every committed run the model had
**no spawn tool at all** and could only narrate delegating. Loading pi-daddy therefore
changes two things at once: a spawn tool exists, and spawning is governed. Owner accepted
this rather than pay for a third ungoverned-spawn arm (which would also require vendoring
pi-mono's subagent extension, a deferred decision about carrying someone else's code).
**Every writeup says "governed delegation vs no delegation", never "governance changed
behaviour".**

## 6. Why force only

`skillFlags` (`adapters/src/pi.ts:50`) returns `["--skill", dir]` for green — with **no**
`--no-skills` — so green leaves pi's ambient skill discovery on. The seeded
`<workspace>/.pi/skills/` would then be discovered by the parent too, changing the parent's
own skill context rather than only handing it a governed spawn tool: a third variable.
`force` passes `--no-skills --append-system-prompt <SKILL.md>`, so seeded definitions are
reachable only through pi-daddy's path-based resolution. Clean arm.

Force is also the mode the project already calls the delivery that cannot silently
degrade, and 59 committed force runs exist for context.

Note that the 7 `system_prompt_file` scenarios (plan/debug/review D-series) bypass skill
activation entirely — but `extensionFlags` lives in `common`, independent of the skill
flags, so those scenarios do receive the arm's extension. Intended.

## 7. Cost and latency recording

`run.ts:308` takes the structured path only when `scenario.traceAssert ||
scenario.trajectoryAssert` is set. **No scenario in the corpus declares either** — 8,388
transcripts, 0 `.trace.jsonl` — so `results.yaml` records no cost, no tokens, and no wall
time anywhere. Every committed record carries `judge_verdict`, `reps`, `passes`, `clean`,
`flakiness`, `pass_threshold`, `override`, `note` and nothing else.

The data is discarded, not unavailable: `capture-trace-types.ts:97-101` already carries
`input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_tokens`, `cost_usd` per
invocation, and `comparison.ts` already aggregates those plus `wall_time_ms` for `compare`'s
`--max-subject-token-increase` / `--max-wall-time-increase` gates.

**Change:** a `--structured` flag on `run` takes the structured path regardless of gates,
and per-run aggregates are persisted into `results.yaml` as **optional additive** fields.
Whether that warrants a `schema:` bump is an implementation call — additive-optional argues
no, the 1→2 migration precedent argues for care. Either way old readers must not break.

Without this, the deferred pinning decision has nothing to read, and "cheaper and faster"
stays unanswerable.

## 7b. Provider failure must be infrastructure ERROR, not a model verdict

Added on the §4 spike's evidence, and it is a prerequisite for Wave 0 rather than a nicety:
**unmitigated, Wave 0 would have produced 44 spurious model FAILs indistinguishable from
findings.**

Neither run path classifies a provider-side failure today:

- **Text** (`piAdapter.run`): pi exits 1, so the adapter appends `[pi exited 1]` plus the
  stderr into the transcript. The judge then reads *"Encountered invalidated oauth token"*
  as the model's answer and fails the scenario. A provider outage becomes a skill
  regression.
- **Structured** (`runStructured`): pi exits **0** with empty content and a
  `provider_transport_failure` diagnostic. The empty-response retry in `run.ts` fires once,
  then the cell records a model-attributable failure. The diagnostic is on the stream and
  nothing reads it.

**Change:** classify provider failure as `infrastructureFailure` — which `run.ts` already
threads through as ERROR — in both paths. Structured reads
`diagnostics[].type === "provider_transport_failure"` and must not treat exit 0 as success;
text matches a non-zero exit against known provider signatures. ERROR blocks and never
passes, which is the existing rule ("missing evidence is ERROR, never a pass") applied to a
provider being adopted for the first time.

Negative control required: a fixture stream carrying `provider_transport_failure` with
exit 0 must produce ERROR, and the test must fail if the classification is removed.

## 8. Wave 0

**Prerequisites, both hard:** a re-authenticated Codex token proven by one real call (not
by `pi auth check`, see §4), and §7b's provider-failure classification in place.

`review` (22 scenarios) × `gpt-5.6-sol:medium` × force × `--reps 1` × both arms =
**44 subject runs, ~44 judge calls.**

Passes only if all four hold:

1. The provider runs and the thinking level is confirmed bound (§4 spike).
2. Cost, tokens and wall time land in `results.yaml`.
3. At least one ledger spawn event exists in the pi-daddy arm.
4. There is a readable verdict delta between arms.

**Wave 0's verdict delta is not a finding.** It is `--reps 1` on a single model; the
project's own tenet is that one run on a stochastic model is not a signal, and `lint`
already reports `review/S6` and `review/S9` flipping run-to-run in that corpus. Wave 0
proves the plumbing. Wave 1 gets scoped against its numbers — which skills, which models,
how many reps — as a separate decision.

## 9. Testing

- Every new unit gets a test that **can fail**, verified by a mutation pass. This repo has
  shipped fixes with no test at all, and a `pi-json.ts` prefilter test that once passed
  against deliberately broken source.
- Negative controls for all three §5 refusals. A check that only asserts success measures
  less than it claims.
- **No arm test may shell out to `pi`** — CI has none on PATH.
- If `cli`/`core` source moves, `npm run build:ext` and commit
  `packages/pi-extension/dist/index.js`. Never add pi-extension to an emitting `tsc -b`.
- Run `lint all --skills ../principal-pi-skills` before and after: the finding count must
  stay at 101/32. A change in that number means the arm leaked into a digest.

## 10. Finding: force delivers frontmatter, and the digest says it cannot

Found while designing the deferred pin. **Not fixed here** — changing force delivery would
move the ground under Wave 0. Own issue, own fix, own post.

`sources.ts:533` excludes two frontmatter keys from the model-visible digest:

```ts
const CAPABILITY_KEYS = new Set(["allowed-tools", "tools"]);
```

documented as *"Both are read by pi/pi-daddy to build a `--tools` allowlist; **neither is
ever rendered into the model's context**."*

That premise is false in force mode. `pi.ts:57` reads the **whole** `SKILL.md` — the local
variable is named `body`, which is how it reads as though frontmatter were stripped — and
appends it via `--append-system-prompt`. Nothing in `pi.ts` strips frontmatter; the only
helper that does (`canary.ts:31`) is used to pick a probe anchor, not for delivery. No test
covers frontmatter in force delivery; the sole force test asserts the missing-directory
error.

And the keys are present everywhere: **all 7** skills carry `allowed-tools:`, and **all 6**
`agents/*.md` carry both `tools:` and `allowed-tools:`. So across **59 committed force
runs** and the 7 `system_prompt_file` scenarios, the model was shown the capability
declarations the digest says it can never see. Editing `allowed-tools` today would be
forgiven by `lint`/`restamp` as inert frontmatter while the force system prompt genuinely
changed.

This is not a harmless line. In a corpus full of B-series over-refusal and right-sizing
counterexamples, telling a model `allowed-tools: read, grep, find, ls` is plausibly
load-bearing stimulus.

**Consequence for the deferred pin:** in force mode anything in the delivered document is
stimulus, so writing a measured pin into that document invalidates the measurement that
produced it, and validating the pin needs another wave whose pin invalidates that one. A
pin derived from measurement must live somewhere the model cannot see. Three ways out —
sidecar (no digest interaction), mode-aware digest (honest, inherits the regress),
strip denylisted keys in force (silently repopulates the 59 runs unless an explicit
incomparability marker is added) — to be chosen after Wave 0.

**Also relevant to pinning, on the pi-daddy side:** `spawn.ts:69` already does
`if (input.model) args.push("--model", input.model)`, so the plumbing exists — but the
model is chosen by the *LLM*, via a model-facing optional tool parameter defaulting to the
session's model (`extensions/delegation.ts:194`), and `definitions.ts` has no `model` field
at all. An operator-authored pin is the ADR-0016 pattern (`delegate.ts:75`: "A named
definition replaces the model's tool list with an operator-authored ceiling") applied to
model selection.

## 11. Findings for the deferred purge decision

**`results.yaml` is recoverable; transcripts are not.** 202 `results.yaml` on disk, **202
git-tracked**. 8,388 transcripts on disk, **5 git-tracked** — `.gitignore` carries
`**/tests/results/**/*.txt`. So 8,383 transcripts exist only on this disk, and transcripts
are the input to `grade`: delete them and no old run can ever be re-judged, including the
one finding that currently wants exactly that (`plan/A2`).

**The scope is clean.** Exactly 3 tag dirs per skill — `deepseek-v4-pro`, `glm-5p2`,
`kimi-k3` — 21 total. "Models I will not use again" maps 1:1 onto tags, the same unit
`lint` and `stability` key on and the same unit the arm axis extends. Prune-by-tag is the
natural design; dry-run by default, refuse on a dirty tree, refuse a match-everything glob
without an explicit opt-in, and report irrecoverable transcript count on its own line.

**Retiring beats deleting.** The only thing the old tags cost is `lint` noise — 100 of the
101 findings are staleness on those three tags. A `retired:` marker in a corpus-side file
(same home as `arms.yaml`, no digest interaction) makes `lint` skip them: clean gate,
evidence intact, reversible. It also fixes a documented wart properly — the smoke fixture's
retired `deepseek-v4-flash` tag produces a permanent stale finding that "cannot be cleared
by running anything — only by deleting the gitignored dir."

**Costs of deleting, to be accepted explicitly if chosen.** skill-harness README §289–293
points at this corpus as the flagship worked example with committed multi-model results,
and Phase 1's exit criteria rest on it; cut a git tag (`results/fireworks-era`) first so
the published example stays referenceable. The 12 `mode: red` runs live in those tags and
are the corpus's only red baselines — the roadmap already calls `lift` "shipped, barely
exercised". And either way, any writeup must say the finding count dropped by **removing
the subject, not by fixing anything.**

## 12. Deliverable

`docs/CODEX-ARMS-RUNBOOK.md` — the exact console sequence in order, free and offline
commands first: the §4 spike, `pi auth check`, `lint` as a before-baseline, the two Wave 0
arm commands, then what to read afterward and what each of the four Wave 0 criteria looks
like when it passes.

## 13. Unrelated defects noticed while measuring

Neither belongs in this spec; both are free.

- `RESULTS-MANIFEST.md` no longer exists in `principal-pi-skills`, but skill-harness
  README:293 still links to it as a live URL.
- README:325 still says `skill-harness run ponytail --skills ../principal-pi-skills`. The
  roadmap records that citing non-existent skills (`ponytail`, `code-review`) was found and
  corrected on 2026-08-04; that correction only partly landed.

---

## Appendix — environment measured against

| Thing | Value |
|---|---|
| skill-harness | `0.10.0`, `main` at `ba8f97f`, 1,289 tests / 79 files green |
| pi | `0.84.2` |
| pi-daddy | `0.18.1`, `8feaacb` |
| principal-pi-skills | HEAD `2c53559`, 7 skills, 106 scenarios, 202 runs, 101 lint findings / 32 notes |
| Corpus modes | 94 green, 59 force, 12 red |
| Scenario counts | architect 15, build 10, debug 12, decide 13, git-ops 21, plan 13, review 22 |
| §4 spike | Run 2026-08-22 — blocked on an invalidated `openai-codex` OAuth token; thinking-suffix question still open |
