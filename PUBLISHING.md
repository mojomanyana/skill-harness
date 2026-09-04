# Publishing skill-harness 0.12.0

This is the npm-publish runbook. The registry contains 0.11.0; this release branch is
bumped to 0.12.0 for the closed ledger contract and the schema-v3 measurement/reporting
boundary. `release:pack` must produce only manifest-bound `*-0.12.0.tgz` archives from
the final clean release commit. The owner authorized this release on 2026-09-04.

## 0.12.0 — self-screenable results

Results schema 3 is an intentional observation-and-meaning epoch. New Pi runs retain per-provider-request prompt provenance, byte-computed contract delivery, and every per-criterion judge vote under its repetition/panel member. Runtime validation recomputes recorded panel verdicts and rejects divergence. `skill_delivered` is an objective gate: known zero/duplicate delivery is NOT-MEASURED, excluded from efficacy denominators, and never judged; instrumentation failure is ERROR. Schema-1/2 meanings remain unchanged.

`screen <run-dir>...` is free/offline and adapter-free. It derives control/treatment rates and criterion failures from schema-v3 fields. Schema 1/2 remains readable without an on-disk rewrite; absent historical observations remain UNKNOWN. The prompt, judge, verdict parser, panel collapse, and scorer are unchanged. The named normalization registry starts at `cwd-line-v1`, replacing exactly Pi's dynamic `Current working directory:` line.

Release evidence must include the v2 compatibility test, v3 schema positive/negative controls, writer round trips, prompt occurrence mutations, the no-adapter screen CLI test, and the full mutation catalogue. Draft post: `docs/posts/2026-09-04-the-result-that-can-answer-the-next-question.md`.

### 0.12.0 real-Pi smoke gate: RUN

The two-probe smoke completed on Pi 0.84.2 with subject
`openai-codex:gpt-5.6-luna` and judge `openai-codex:gpt-5.6-sol`. The extension
probe recorded trace v2, the `Agent` call and one delegation, the expected
authenticated-delivery ERROR, and zero judge calls. The extension-free probe
recorded exactly-once delivery PASS, an initial PASS judgment, and a confirmed
`ship_deciding` panel of two judgments after `grade --auto-rejudge`; delivery
remained PASS across the rewrite. This is same-family path verification, not an
efficacy measurement.

## 0.12.0 — cross-repository contract repair

The next publish must not proceed unless CI's `pi-daddy-contract` job is green. That
job checks out `mojomanyana/pi-daddy` at the literal immutable 0.19.0 SHA
`c364a6717e3d5e369ecd3298b9cbb595eb94d9b2` into a sibling directory, installs both
lockfiles, builds both repositories, and runs:

```bash
npm run verify:pi-daddy-contract -- ../pi-daddy
```

It does not use pi-daddy `main`, a tag, or npm `latest`. The verifier refuses a dirty
producer checkout or any other HEAD, imports production builders plus `REFUSAL_CODES`,
validates 47 builder-produced records against schema SHA-256
`3862bc451c25393dd40b198c62a8f94a3f58784e31da6dff05e3f06be71a3f86`, and requires
every normalized v2 event to retain run/task join identity. Release/publish work is
downstream of this job: a green ordinary unit suite cannot substitute for it. The pin
claims only identities it can rederive from the exact producer commit: repository,
commit/version, source paths, schema digest, and all seven byte-vendored artifact
digests.

The earlier 0.10.0 release notes below accurately record that release's pin
(`1948b940…`). The first repair re-pinned provenance to Handoff B `3070152…`; this
synchronization advances it to pi-daddy 0.19.0 `c364a67…`, whose closed refusal
vocabulary has 32 members after adding production-reachable
`WORKSPACE_NOT_AUTHORIZED`. The adapter continues deriving that vocabulary from the
pinned schema instead of maintaining another list. No OS sandbox is introduced by
this repair.

The next publish must also keep `pi-daddy-ledger-v3-contract` green. That independent
lane pins pi-daddy Wave 1 commit
`4a9524394ca995fd74ed9bbb836dc4e73cda3b8c`, tree
`7c006bff213142634f0f911ba9bd6add363ecaae`, version 0.21.1. The pin is reachable from
pi-daddy's merged `main` at `62e9d027514e9fc6d689d505d7ef733a07f1470c` with the
same tree and an empty full diff. It reproduces all five
positive v3 fixtures through production builders, exercises non-vacuous v3 mutations,
and leaves the v2/0.17 lane unchanged. `qualification-runner-v1` is source-built and
unpublished; release evidence must include its public schemas, CLI lifecycle tests,
two byte-identical package builds, and clean installed-artifact probes. This work
contains no authorization to publish, tag, or run a qualification measurement.

The registry has `0.1.0`, `0.1.1`, `0.1.2`, `0.2.1`, `0.3.0`, `0.3.1`, `0.3.2`, `0.4.0`,
`0.5.0`, `0.6.0`, `0.7.0`, `0.8.0`, `0.9.0`. This repo is at `0.10.0`, so these commands publish
a **new version over an existing line** — the `@skill-harness` scope is already claimed, and
`latest` moves to 0.10.0 as each package lands. npm refuses to publish over a version that
already exists, so every version literal below has to move with the bump; they are written out
rather than parameterised because a runbook you can read is worth more than one you can paste.

**0.10.0 takes the minor: the pi-daddy v2 adapter is pinned to the producer's canonical
contract, and validates against it before normalizing.** It takes the minor rather than a patch
because a v2 record carrying an **undeclared top-level field now fails closed**, where 0.9.0
accepted it. That is a gate getting stricter, which is the same reason this project has no
moving `v1` tag: a release that adds a check makes a repo that passed yesterday fail today, and
a patch number would understate it.

The adapter used to restate pi-daddy's `ledgerVersion: 2` contract in its own code, and a
restatement can disagree with the original in either direction. Measured against the producer's
own builder output at pi-daddy `main` `1948b9406c13c9730f2fc103e68023d6e58c5e85` (merged PR #11),
it disagreed three ways at once: the canonical `check_receipt` fixture was **rejected** because
the harness demanded that a receipt's measured `treeSha` equal the controller-supplied
`correlation.tree_sha` — which pi-daddy's builders emit independently; a canonical
`capability_decision` refused with `GRANT_ID_MALFORMED`, a member of the producer's own pinned
enum, was rejected as an unsupported code; and an undeclared top-level field rode through
unnoticed although the producer's schema is `additionalProperties: false`.

**The contract is now interpreted, not transcribed.** `contracts/pi-daddy/ledger/v2/` vendors the
producer's schema, its four builder fixtures and its README byte-exact, with the commit and
per-artifact SHA-256 in `PINNED.json`. A v2 record is validated against those bytes *before*
semantic normalization, so undeclared fields, invalid enum members, wrong nullability and
requiredness drift fail closed by construction rather than by a check someone remembered to
write. The evaluator refuses anything it cannot faithfully enforce — an unknown keyword, a known
keyword whose value has an unexpected shape, or a `$ref` carrying sibling constraints — so a
future contract construct is a loud failure rather than a quiet hole. No new runtime dependency.

**`digests.tree` now comes from the receipt alone.** `correlation.tree_sha` survives only as
`digests.correlation_tree`, and is not required to equal it. Requiring agreement did not just
reject the producer's own receipt: it let a controller-supplied string vouch for a measured
identity, which is the opposite of what a trusted digest is for.

**Every restated vocabulary is drift-asserted** set-equal to its place in the pinned schema, in
both directions, through one `V2_RESTATED_VOCABULARIES` manifest — refusal codes and refusal
field/detail-type names, event discriminators, approval sources and scopes, lease outcomes and
access, lifecycle states, executors, and the correlation field whitelist including which of its
fields are numeric. A hand-copied list without that assertion is exactly how `GRANT_ID_MALFORMED`
came to read as "unsupported", and with the schema gating first, a set that drifts *narrower* now
fails the mirror way: contract-valid in, stale-harness-rejected out.

Harness-only requirements deliberately survive schema validation, because the producer's schema
is a floor and not a ceiling: missing `correlation.run_id`/`task_id` still fails as unjoinable
even though pi-daddy permits an uncorrelated v2 line, and a receipt `treeSha` must still look
like a git object id. Legacy unversioned 0.17 support and the `pi-daddy-v1` selector alias are
unchanged.

*What is NOT claimed.* Conformance to a contract is not attestation. Everything 0.9.0 declined to
claim still stands: **there is no OS sandbox**, the `SandboxBackend` seam is fake-backed, temp
fixture directories and git workspaces are not containment, and the principal digest chain
detects torn or edited logs but cannot stop an unsandboxed subject that rewrites and rehashes a
whole ledger. Nothing watches pi-daddy for drift either — the conformance test proves the consumer
matches the *pinned* commit, not the producer's current `main`.

**Consumer checklist for this release:**

1. No spec or results migration. The change is confined to the `pi-daddy-v1` event adapter.
2. If you feed pi-daddy `ledgerVersion: 2` ledgers to `assert.trajectory`, re-run or `regate`
   that evidence: records rejected for the receipt-tree or refusal-code reasons above now
   normalize, and a record carrying an undeclared top-level field now fails closed.
3. Bump exact consumer pins to `v0.10.0`; `@latest` trackers move with the release tag.
4. Re-pin the producer contract with `node scripts/vendor-pi-daddy-contract.mjs` when pi-daddy
   publishes a new one. `packages/adapters/src/pi-daddy-ledger-v2.ts` is generated — never
   hand-edited.

## 0.11.0 — the arms axis, and a provider outage that stops looking like a skill regression

**Published 2026-08-23.** First release since 0.10.0. Three additions, and the third is the
one that changes what a `results.yaml` can say.

**Provider failure is infrastructure ERROR, not a model verdict.** Measured against an
invalidated `openai-codex` OAuth token: text mode exits 1 with `Encountered invalidated oauth
token`, while `--mode json` reports a generic `provider_transport_failure` with
`stopReason: "error"`, zero tokens, and **exit code 0**. Neither path was classified, so a
wave against a dead provider produced model FAILs shaped exactly like findings. Both paths now
classify, the verdict is ERROR before the judge and costs zero judge calls, and it survives
`grade`/`regrade` rather than being re-judged into a FAIL on the next pass. The marker lives in
the transcript **preamble**, ahead of the first `>>> ` header, so a model writing the same line
into its answer cannot forge one. **Transcripts written by ≤ 0.10.0 carry the old placement and
will not short-circuit on re-grade.**

**`run --structured`.** `runStructured` only ever fired for a scenario declaring a trace or
trajectory gate, and no scenario in the reference corpus declares either — so the subject half
of `ScenarioMetrics` (`input_tokens`, `subject_cost_usd`, cache tokens) was never populated by
any run, anywhere. The fields already existed; nothing wrote them. One flag now takes the
structured path regardless, including on `mode: seeded` scenarios.

**The arms axis.** A named bundle of harness-side conditions — extensions, seeded definitions,
env — declared in `<skills-root>/tests/arms.yaml` and selected with `--arm`, so the same
scenarios can be A/B'd with and without an extension loaded. The arm is carried in the
**run-directory tag** (`pi-<model>+<arm>`), deliberately: `lint` and `stability` both key on the
tag, so two arms are separate lineages that can never be misread as one lineage flipping
run-over-run — and no `specification.yaml` byte moves, so no committed result is disturbed.
Four refusals make a vacuous arm unreachable: too few seeded definitions, an unreadable seed
directory, a non-empty ambient `~/.pi/agent/skills`, and a seed path escaping the skills root.

### `results.yaml` grew an `arm` block — consumers need 0.11.0 to read it

Still **schema 2**. The block records the arm's name, resolved extension paths, seeded
definition count, `ledger_events`, and the declared `env` with `<run-dir>` unsubstituted. Per
the rule in §1b, **a `results.yaml` written by 0.11.0 needs a reader ≥ 0.11.0**, and every
rewriter (`grade`, `regate`, `rescore`, the review UI) now carries the block rather than
rebuilding the draft without it — an omission that silently deleted the only committed evidence
an arm run delegated, since the ledger it counts is gitignored.

**Correction to §2 below, which was stale:** `principal-pi-skills` is described there as pinning
`ref: v0.3.0` at an exact pin. It does not — its workflow pins `ref: latest`, so moving the
`latest` tag reaches its CI immediately. That is the desired ordering here rather than a hazard:
that repo already carries Wave 0 results written by an unreleased `main`, and tagging 0.11.0 is
what gives its CI a reader new enough to understand them.

### Smoke gate: RUN for this release

0.10.0 skipped it on the grounds that the release touched none of the three paths no fake can
exercise. This release touches **all three** — the streaming JSONL reader (provider-failure
collection and the new `env` passed to `spawn`), the `--no-extensions --extension` argv (the
arm's entire mechanism), and the live judge loop (`regrade`'s provider-failure short-circuit).

`./scripts/smoke-real-pi.sh` reached all four stages, exit 0, on pi 0.84.2 for `cost_usd
0.000562688`: trace_version 2 recorded, the declared extension's `Agent` tool present and
called, no thinking / home paths / result bodies persisted, the objective gate PASS on four
assertions before any judge spend, and `--auto-rejudge` genuinely taking a second opinion
(2 judgments, `confirmed`, `ship_deciding`). One draw on a cheap model, not a measurement.

### Also verified before publishing

Build, `npm run typecheck`, 1,368 tests across 86 files, the suite again with `pi` removed from
`PATH` (the CI condition), the committed pi-extension bundle current against an in-memory
rebuild, and `lint all --skills ../principal-pi-skills` reporting `7 skill(s), 104 finding(s),
32 note(s)` — the same figure measured before this work began, which is the evidence that no arm
leaked into a result digest.

### Field-tested, which is new for a release here

The axis was exercised live before publishing, not only under test: `review` × 22 scenarios ×
3 reps × both arms on `openai-codex:gpt-5.6-terra:high`, twice on the governed side. That run
is what found the executor trap now documented in `docs/CODEX-ARMS-RUNBOOK.md` — an arm must
pin `PI_GRANTS_HERDR`, because absent it means *probe*, and a probed herdr pane cannot complete
behind `pi -p`. Findings in `docs/posts/2026-08-23-the-spawn-that-only-said-starting.md`.

### 0.9.1, superseded and never published

A `release/0.9.1` branch was prepared for the 0.9.0-era pi-daddy adapter work and never shipped.
Its notes claimed the adapter "accepts the four `ledgerVersion: 2` variants emitted by the pinned
builders". Measured against the producer's canonical fixtures, that was **not true** at that
commit — `check_receipt` was rejected outright — and it was pinned to 0.18.0 `dde8eeb`, which has
since moved. 0.10.0 supersedes it. The lesson is the one this release is built on: a claim about a
producer's format is worth only as much as the producer's own artifact you checked it against.

### 0.9.0, kept for context

**0.9.0 takes the minor: workflow-level assurance — trajectory assertions, paired
`compare`, and an offline self-test that proves the new gates can turn red.**

Nothing about `results.yaml`'s verdict fields changed shape. What is new is a second
kind of evidence beside the execution trace, and a way to compare two skill
revisions without pretending one wave is a measurement.

**`assert.trajectory` — gates over normalized workflow events.** Where `assert.trace`
asks what tools were called in one run, trajectory assertions ask whether a
multi-phase workflow held its shape: `require`, `forbid`, `ordered`, `correlate`,
`approvals`, `freshness`, `coverage`, `forbid_after`, `unique`. Events are normalized
from pi traces and from native event sources, and a missing correlation field is
**ERROR**, never a pass — the same rule the trace gates already follow. Adapters for
principal/pi-daddy governance shapes ship with fixtures.

**`compare <skill|all> --reference <ref> --candidate <root>`** — paired setup, not
seeded sampling. Both sides run from throwaway snapshots, and the command *refuses*
to run when the two sides differ in scenario IDs, spec bytes, fixture / extension /
system-prompt / post-test inputs, subject model, mode, judge, or repetition plan.
Test-input equivalence is preflighted **before the first subject call**, so an unfair
comparison costs nothing. Regression exit codes are distinct: `2` for a critical
regression, `1` for an ordinary one. It spends subject and judge calls — confirm the
skill, models and judge before running it.

**`mutation-test`** — free, offline, no models. Proves the trajectory assertion
classes can actually turn red, 15 mutations, and fails if any survives. It covers
`assert.trajectory` only: `assert.trace` needles are evaluated by different code and
get nothing from it.

**Critical scenarios now demand every clean repetition.** `critical: true` and
membership in top-level `critical:` are one release-gating set, and for that set the
effective repetition threshold is always `1.0`. An `ERROR` stays `ERROR` — repetitions
cannot vote it into a PASS, and one objective failure cannot be outvoted by other
reps. A full green/force `run` that is NOT READY exits non-zero; red baselines and
partial runs do not pretend to be release gates.

**Cost and latency are recorded** per run (subject tokens in/out/cache-read, judge and
re-judge call counts, wall time, tool-call and delegation counts), and three JSON
schemas are published for external consumers: `schemas/specification-v1`,
`schemas/results-v2`, `schemas/trajectory-event-v1`.

*What is NOT claimed, stated plainly.* **There is no OS sandbox.** Core exports a
`SandboxBackend`/`withSandbox` seam with fake-backed tests, and that is all it is: temp
fixture directories and git workspaces are **not containment**, and reports must keep
saying containment is unavailable until a real backend exists. The principal digest
chain is an integrity check, not attestation — it detects torn or edited saved logs,
but an unsandboxed subject that can rewrite and rehash a whole ledger can fabricate
one. No signature, MAC, or remote witness is claimed. The `examples/principal-v3-pack`
fixtures prove the evaluator accepts and rejects saved event sequences; they report no
principal model cell as executed.

**The pre-publish smoke gate was rebuilt, because it had never worked.** Four defects,
each of which made it report something other than what it measured: it pinned a
retired model alias, selected its run dir by model tag (so it could assert against a
*previous* run), **never reached its own assertions** — step 1 exited non-zero on any
non-shipping scorecard under `set -e` — and gated the objective *after* the judge
spend, though `grade` only carries that verdict and never recomputes it. See
`docs/ASSURANCE-WORKFLOWS.md` for the workflow contract, and the smoke section below
for what the gate proves now.

**Consumer checklist for this release:**

1. Nothing to migrate. `assert.trajectory`, `compare` and `mutation-test` are additive;
   a spec that declares none of them behaves exactly as it did on 0.8.0.
2. If you declare `critical:` scenarios, re-read their grades before trusting a green
   board: the threshold for that set is now every clean repetition, so a cell that
   passed 2 of 3 was previously green and is now a release failure. That is the point.
3. If you consume `results.yaml` from outside, the new schemas are the contract to pin
   against rather than reading fields by hand.
4. Bump the pin to `v0.9.0` when you want the 0.9.0 notes (`.github/workflows/ci.yml`).
   Consumers tracking `latest` get this automatically.

### 0.8.0, kept for context

**0.8.0 takes the minor: a new command, and a change to what "the skill changed" means.**

Nothing about a verdict, a grade, or the shape of `results.yaml` changed. What changed is
which edits the staleness gate charges you for.

**The behavioural change: a frontmatter-only edit no longer stales a published run.**

`SKILL.md` and every `system_prompt_file` are now digested as **body + model-visible
frontmatter**, recorded under new keys `skill:prompt` and `prompt:<path>`. `description` and
`name` stay inside the gate — under progressive disclosure the description decides whether
the skill is selected at all. `allowed-tools` and `tools` are excluded: both spellings of a
capability ceiling, read by pi/pi-daddy to build a `--tools` allowlist, and neither is
authored for the model.

Hashing the raw bytes — which is what shipped through 0.7.0 — charged a full paid re-wave
for edits no graded run could observe. Measured on the reference corpus: adding one
`allowed-tools:` line to seven `SKILL.md` files, **every body byte-identical**, took `lint`
from 2 findings to 22, and 20 of those demanded re-runs.

*What is now unprotected, stated plainly.* Under `--mode force` the adapter appends the
WHOLE file to the system prompt, so an excluded key is genuinely in the model's context and
editing it no longer stales that run. That is the real coverage being traded, not a
hypothetical — every newest published run in the reference corpus is force mode. Taken
anyway because the line is a declaration *about* tooling rather than instruction authored
for a model, and a force run passes `--no-skills` so pi never applies the ceiling. Frontmatter
*formatting* also stops being a change at all: the digest is built from parsed YAML with
string scalars trimmed, so refolding a `>` block or reordering keys is a no-op.

Delivery is deliberately unchanged. Stripping frontmatter in the adapter would make the
principle true by construction, but it would silently change what `force` measures for every
future run and make old force runs incomparable to new ones — a bigger lie than the one
being fixed.

**The new command: `restamp <skill|all> --skills <root> [--from <git-ref>]`** — free,
offline, no models. This is a stored-hash format, so the fix cannot apply retroactively on
its own: a one-way hash cannot say whether a past edit touched the body. `restamp` upgrades a
record only where it can *prove* the claim — the recorded raw-bytes hash still matches the
bytes the run measured (`--from` supplies those from git when the edit already landed), and
those bytes carry the same model-visible text as today's. Anything else is left honestly
stale, and `run` is the only thing that can clear it.

Both digests keep being written, so an older skill-harness reading a newer `results.yaml`
still finds the key it knows, and the new keys are prefixed so it reports "not comparable"
rather than a confident wrong finding.

**Consumer checklist for this release:**

1. `lint all --skills <root>` before upgrading, and again after. On a corpus nobody has
   edited the two are identical: a legacy record keeps matching on the raw-bytes key exactly
   as before, so **skipping the migration costs nothing**.
2. Run `restamp all --skills <root> --from origin/main` once, on a board that lints clean,
   and commit the result. Every later frontmatter-only edit is then free. Note `origin/main`
   rather than `main` — a fresh clone often has no local `main`, and an unresolvable `--from`
   now fails loudly rather than reporting "0 upgraded".
3. Expect `restamp` to leave most historical runs alone. On the reference corpus it upgraded
   18 of 140; the other 122 measured genuinely older skill text and are correctly unprovable.
4. Bump the pin to `v0.8.0` when you want the notes (`.github/workflows/ci.yml`).

### 0.7.0, kept for context

**0.7.0 takes the minor: five new capabilities, and one change to what a verdict means.**

Read the last bullet before upgrading — it is the only one that can move a number on
results you already have.

- **`capture`** (pi extension only, `/skill-harness capture`) — promote a live pi
  conversation into a regression case. Interactive by design: it refuses to run without a
  session and the interview primitives, because preview-before-write is what keeps secrets
  out of committed files. Never a CLI command, never headless, not free.
- **`assert.trace`** — objective gates over a structured record of what the model actually
  did: `require_calls`, `forbid_calls`, `require_subagents`, `unchanged_paths`. Evaluated
  before the judge, so a failing gate costs zero judge tokens.
- **Orchestration assertions** — `require_subagents` tests the parent's delegation
  (selection, handoff content, and what the handoff must NOT carry), not just the
  subagent.
- **`coverage` and `affected`** — which instruction sections have no test, and which
  scenarios a diff could plausibly affect. Both free and offline. `affected` resolves every
  ambiguity toward selecting MORE, and an affected run never reports SHIP.
- **Adjudication (`--auto-rejudge`)** — a second (and optionally third) judge on cells that
  are ambiguous, self-contradictory, non-unanimous across reps, or ship-deciding. Spend is
  disclosed as an exact call-count ceiling before anything is bought, and an unresolved
  disagreement blocks SHIP rather than resolving itself.

**The one behavioural change: an objective gate now outranks the judge.**
`effectiveVerdicts` returns `override ?? objective ?? judge_verdict`, where an objective
FAIL forces FAIL and an objective ERROR (evidence missing) forces ERROR. An explicit
author override still wins.

Previously `objective` was recorded in `results.yaml` but never scored — it reached the
ship decision only through a single rep's gate prefix, so `--reps N` out-voted it,
`grade` re-judged past it, and `regate` recomputed it away. A critical scenario in which
the model called a forbidden tool scored 100%, grade A, SHIP.

*Consequence for existing results:* a committed `results.yaml` carrying
`objective: {status: FAIL|ERROR}` beside a PASS verdict will now score differently — that
is the fix, not a regression. Scenarios that declared no trace assertions carry no
`objective` at all and are completely unaffected, which is every result produced before
this release.

**Also in this release, and worth knowing if you rely on the artifacts:**

- **Execution trace format v2.** `changed_paths` is tri-state: `null` means the workspace
  was never observed, `[]` means observed and unchanged. A v1 reader must decline a v2
  trace. Nothing in any corpus has committed traces (`*.jsonl` is gitignored), so no
  stored data is invalidated.
- **`unchanged_paths` is observed by content snapshot**, taken before the model runs and
  diffed after — so it sees `.gitignore`d files (it previously could not see `.env`, the
  canonical case) and does not attribute a fixture's own `_staged/`/`_uncommitted/` trees
  to the model.
- **`delivery_canary` gains `"skipped"`.** A `--canary` that was asked for but could not
  run is now recorded, rather than leaving a `results.yaml` identical to one where
  delivery was never checked.
- **Trace artifacts are fully redacted** — tool `details` and the model's `final_text`
  included, plus credentials embedded in URLs.
- `results.yaml` field ORDER is unchanged from `outcomesToResult`; rewrites no longer
  produce noise diffs.

**Consumer checklist for this release:**

1. `lint all --skills <root>` before and after upgrading — output should be identical.
   Verified against the reference corpus: byte-identical, 62 findings either side.
2. If any committed result carries an `objective` block, re-read its grade: a gate that
   was being ignored is now enforced.
3. `assert.trace.unchanged_paths` requires a workspace (`env.workspace: empty-git` or a
   fixture). The spec parser refuses the combination offline, before any spend.
4. Bump the pin to `v0.7.0` when you want the notes (`.github/workflows/ci.yml`).

### 0.6.0, kept for context

**0.6.0 takes the minor: a new command, a new `lint` code, and a new severity concept.**
Nothing about a verdict, a grade or `results.yaml` changed — this release only *reads*.

- **New command `stability <skill|all>`** — run-over-run verdict flips per scenario ×
  model tag × delivery mode, derived from committed history. Free and offline (no model,
  no judge, no harness), and it exits 0 whatever it finds.
- **`lint` gains `info` findings, and its exit code now counts only gate-failing ones.**
  `LintFinding` gains an optional `severity` (absent = `error`, so every existing code
  behaves exactly as before) and a new code `stability` carries `severity: "info"`.
  Consequences for a consumer: `lint` prints `ℹ` lines and `::notice` annotations it did
  not print before, the summary line reads `N finding(s), M note(s) (do not fail the
  gate)`, and **a repo whose CI failed only because of stability notes would now pass** —
  which cannot happen in practice, since the code is new. Anything parsing lint output
  should key on `severity`/the `✗` vs `ℹ` prefix rather than on line count.
- **`collectTrends` is unchanged in shape**, but its history walk moved into a new
  exported `collectScoredRuns` (one walker, shared with stability). `TrendData` is
  byte-identical for the same tree.
- **`RunColumn.cells[id]` gains an optional `stability`** object (flips, compared,
  volatility, note) — present only on cells that flipped. Additive; the review UI reads
  it for a `⇄` marker and tooltip.
- **`formatScorecard(summary, lift?, stability?)`** takes a third optional argument. Old
  two-argument calls behave as before.
- No `results.yaml` change at all: stability is derived on read, never stored, so it works
  retroactively on history recorded by every earlier version.

**Consumer checklist for this release:**

1. Bump the pin to `v0.6.0` when you want the notes (`.github/workflows/ci.yml`).
2. Run `stability <skill> --skills <root>` once over the existing corpus — it costs
   nothing and needs no new runs.
3. Do not "fix" a boundary-cell note. The remedy is `--reps N` on that scenario, or an
   override with a note once you have decided which side is right.

### 0.5.0, kept for context

**0.5.0 took the minor: a mode that was never scored now scores, so committed numbers
change.** Nothing about a *verdict* changed; what changed is which runs get a grade.

- **`force` runs are scored.** `green` and `force` both deliver the skill, so both are
  graded against the ship bar; `red` remains the unscored control. Every force run
  recorded by ≤ 0.4.x carries an `effective_grade` placeholder (`mode=force (not
  scored)`) that a 0.5.0 recompute disagrees with, so **`lint` reports one
  `consistency — effective_grade is stale` finding per such run** until they are
  re-scored. `rescore <run-dir>` fixes it: free, offline, no judge, no model.
- **`grade` / `regate` / the review UI's re-judge now read the run's OWN mode's
  artifacts** (`<id>.force.txt`, `<id>.force.diff.txt`) instead of assuming green. A
  force or red run that previously failed with "nothing to re-grade" now works — and a
  red run re-graded this way stays unscored.
- **`results.yaml` gains two optional fields.** `harness_cli_version` (what `pi
  --version` said) and `delivery_canary: pass` (green + `--canary` only). Older readers
  ignore unknown top-level keys, but the standing rule still applies: *a `results.yaml`
  written by version X needs version ≥ X to lint.*
- **`trends` splits a model tag by mode.** `TrendModel` gains `mode`, and a tag holding
  both green and force history yields two series instead of one pooled sparkline.
  Anything consuming `/trends` JSON by index needs to key on `mode` as well as `tag`.
- **`Lift` gains `mode`, and its skill side is the newest scored run** (green *or*
  force) rather than the newest green one. A corpus that moved to force delivery gets
  its lift back; a corpus with both sees the newer delivery. Field names (`greenPassed`,
  `greenTimestamp`, `cells[].green`) are unchanged on purpose — they mean "the
  skill-active side", and renaming them would break every published report asset.
- **The pi adapter refuses a skill dir with no `SKILL.md`** and resolves relative paths
  before exec. A run that used to silently measure a naked model (pi accepts a
  nonexistent `--skill` path with exit 0) now fails loudly at the first scenario.
  `discover()` also returns absolute `dir`/`specPath` now.
- **New flag `run --canary`** (green only): one probe proving the skill reached the
  model, aborting the run if it did not. Off by default — it costs a rep.
- **The pi extension's flag parser records bare flags.** `--canary` (and any future
  valueless flag) used to be dropped silently; a valueless `--model` / `--mode` /
  `--judge` still falls back to the default rather than passing `""` down.

**Consumer checklist for this release** (`principal-pi-skills` and anything else pinning):

1. Bump the pin (`.github/workflows/ci.yml`, the `ref:` on the skill-harness checkout)
   to `v0.5.0` in the same PR as any results produced by it.
2. `rescore` every committed force run once, in one commit, to convert the
   `not scored` placeholders into real grades — free, and it clears the new lint
   findings. Re-run nothing.
3. If a published scorecard mixes green-epoch and force-epoch numbers, split them: the
   same skill text scores differently under each delivery (measured: `build` A1 0/3 →
   3/3, `plan` C2 3/3 → 0/3).

### 0.4.0, kept for context

**0.4.0 took the minor, and consumers pinning an exact version must bump.** It changes
what `results.yaml` records and adds a `lint` finding, which are two of the three reasons
0.3.0 was a minor:

- **`source_hashes` gains four key kinds** and stops writing one. `scenario:<id>` (one
  digest over stimulus + rubric + policy + gates) is replaced by `stimulus:<id>`,
  `rubric:<id>`, `policy:<id>`, `gates:<id>` and a spec-level `rubric:__persona`. An
  older reader resolves unknown prefixed keys as "not comparable" — that forward-compat
  branch has been there since 0.3.0 — so **an older skill-harness will not false-flag a
  0.4.0 results file, but it also cannot check it**, and its coverage check silently
  stops applying. The rule stands: *a `results.yaml` written by version X needs version
  ≥ X to lint.*
- **A new `consistency` finding**: linting a tree whose records were written by a newer
  harness than the running one now reports it. A repo whose CI pins an old version and
  whose results are produced locally from a newer one will start failing — correctly,
  and that is the point.
- **`lint` messages changed shape.** A `stale` finding now names the cheapest honest
  remedy (`re-grade`, `rescore`, `regate`, or `re-run`) instead of always saying
  "re-run". Anything grepping those messages needs updating; the `code` values are
  unchanged.
- **A metered judge is refused** unless `--allow-metered-judge` /
  `SKILL_HARNESS_ALLOW_METERED_JUDGE` is set, and the default judge moved from
  `anthropic:claude-opus-4-8` to `claude-code:claude-opus-4-8` (Claude subscription).
  **This breaks any CI that relied on an ANTHROPIC_API_KEY judge by default** — add the
  flag, or set the env var, deliberately.
- **New command `regate`**, and `--version` / `-v`. `results.yaml` gains
  `harness_version`. Captured diffs no longer contain `node_modules/`, `coverage/` or
  `.vitest/`, so a `diff_contains` needle matching a test filename that used to pass for
  free will now correctly fail.

**Consumer checklist for this release** (`principal-pi-skills` and anything else pinning):

1. Bump the pin (`.github/workflows/ci.yml`, the `ref:` on the skill-harness checkout)
   to `v0.4.0` in the same PR as any results produced by it.
2. If CI judged with an API key by default, add `--allow-metered-judge` or switch to
   `claude-code:`.
3. Re-run nothing for correctness — no gate's *verdict* semantics changed. But note that
   pre-0.4.0 runs carry only legacy `scenario:` keys, so their lint remedy will say
   "re-run" where a 0.4.0 run would have said "re-grade"; a re-run converts that.

### 0.3.2, kept for context

0.3.2 was a patch: `computeLift` stopped comparing two verdicts produced by different
aggregations (a `--reps 1` baseline against a `--reps 3` green paired one draw with a
majority-of-3), and the review UI stopped claiming "no red baseline" when a baseline
existed but nothing in it was comparable.

### 0.3.1, kept for context

**0.3.1 was a patch and nobody on 0.3.0 was affected by the bugs it fixed.** Two
things changed:

- `computeLift` no longer compares mode-insensitive scenarios — the ones with
  `system_prompt_file`, which `pi` runs with `--no-skills --append-system-prompt`
  *whatever the mode*, so red and green were the same run. They were classed
  `kept`, which reads as evidence against the skill when the skill in fact
  produced that red-side pass, so every such scenario pushed lift **down**. It
  changes `lift` output, and `Lift` gains a required `modeInsensitive` field —
  additive for anything reading a `Lift`, breaking only for code constructing one
  as a literal. **Nobody can have hit this**: it needs a red-mode run on a spec with
  `system_prompt_file` scenarios. The only red baseline ever recorded is the
  two-scenario `golden-skill` fixture, and neither scenario uses that field.
- `@skill-harness/cli`'s `prepack` copies `assets/report.*` rather than all of
  `assets/`. A demo GIF landed in `assets/` after 0.3.0 was cut, which would have
  taken the cli tarball from 20.1 kB to 511 kB. **0.3.0's published tarball is
  unaffected** — it was packed before the GIF existed.

That release existed to stop the repo disagreeing with the registry, not because
anyone was broken.

### 0.3.0, kept for context

0.3.0 was a **behaviour-breaking release for CI consumers**, which is why it took
the minor rather than the patch: `lint` gained the `fixture-marker`,
`post_test`-existence and scenario-coverage checks (a repo that passed on 0.2.1
can fail on 0.3.0), `assert.diff_contains` now matches the diff's changed lines
rather than its raw text, and `source_hashes` records new key kinds that older
versions cannot read. Seeded results produced before 0.3.0 were graded without
the judge seeing the diff and need re-running, not re-grading.

## Prereq

```bash
npm login
```

You need an npm account with publish rights on the `@skill-harness` scope and on
the unscoped `skill-harness` name — the same account that published 0.1.x.

## Build and pack through the release command — this is not optional

`dist/` is **gitignored** (only `packages/pi-extension/dist/index.js` is
force-committed, and that one is never published), so `git status` cannot tell
whether a publishable output is absent, stale, or has the wrong mode. In particular,
`npm ci` can mark an already-present workspace bin executable and TypeScript preserves
that mode when it rewrites the file. The same source then packs differently depending
on whether the workspace was reused.

The only authorized packaging path is:

```bash
node --version          # must be v20.20.2
npm --version           # must be 10.8.2
npm ci
npm run release:pack
# digests and archive-entry modes are now in release-artifacts/release-manifest.json
git status --short     # still required for tracked source; not used to validate dist/
```

The command enforces those exact Node/npm versions. Runtime support remains Node ≥20,
but release packaging is intentionally narrower: npm versions disagree about executable
mode treatment for declared bins, so an unpinned packager would restore the ambiguity this
control exists to remove.

`release:pack` is the control, not the prose around it. It requires a clean tracked
source tree, rejects ignored/untracked compiler and schema inputs, runs `npm ci` itself
to establish the exact lockfile dependency tree, and records the exact source
commit/tree plus Node/npm versions. It inspects
every existing output-path component without following links, rejects alias overlap and
non-directory ancestors, and validates newly-created output components. Explicit
relative and absolute external directories remain supported; a path that reaches one
through a symlink does not. This is validation against a still filesystem, not OS
containment: another process able to rename path components concurrently can race an
`lstat` check, so release preparation requires a quiescent checkout and output directory.

It inspects the three exact ignored output roots
(`packages/{core,adapters,cli}/dist`) and every public package input, refusing symlinks,
devices, FIFOs, sockets, missing files, and other non-regular entries before packaging.
It then recreates only the generated roots with `npm run build`, establishes
`packages/cli/dist/cli.js` as canonical POSIX archive mode **0644**, and derives an
expected inventory from explicit per-package roots and required files. That inventory
must agree exactly with npm's dry-run plan, npm's actual pack metadata, and the real tar
entry paths, types, modes, sizes, and bytes. JavaScript/declaration pairs are required.
Changing the CLI mode never changes its contents.

The output directory rejects unexpected entries rather than using broad cleanup and
invalidates any prior manifest before another authorized-path check can fail. Any later
failure removes the four expected archives and completion marker. The manifest is
written last through a same-directory temporary file and atomic rename; it binds the
source commit/tree, exact toolchain, creation order, package metadata, archive sizes and
SHA-256 values, full file inventories, and canonical modes. No manifest means packaging
did not complete.

All four workspace `prepack` hooks require the authorization marker created by this
command. Standard raw `npm pack -w …` or `npm publish -w …` therefore fails closed and
names `npm run release:pack`; it is not an alternative release path. npm's explicit
`--ignore-scripts` switch disables every lifecycle hook, including this tripwire — it
can create an **unverified** tarball but cannot create `release-manifest.json`. Treating
such bytes as releasable is equivalent to deliberately removing a release check, not an
authorized fallback. The release command itself refuses an ambient
`npm_config_ignore_scripts=true`, so a publisher's global setting cannot silently skip
the guard during canonical preparation. CI runs the command and the regression suite
covers clean/reused workspaces, hostile paths and package inputs, tar mutation, stale
evidence, and removed normalization.

## Smoke against real pi — before you publish

`npm test` is 1,000+ tests against fixtures and fake adapters, which is exactly
right for CI: fast, free, deterministic. But three code paths only exist when a
real process is on the other end, and no fake can exercise them — the streaming
JSONL reader in `runStructured`, the `--no-extensions --extension` argv the
harness passes to pi, and the live judge loop under `--auto-rejudge`.

```bash
./scripts/smoke-real-pi.sh          # SPENDS TOKENS: 2–4 Pi subject processes + up to 3 Pi judge calls
```

Schema 3 cannot claim authenticated in-process provenance while an arbitrary subject
extension shares Pi's process, so the gate deliberately uses two probes rather than
laundering both claims through one run. The extension probe exercises structured JSONL
and `--extension`, verifies the `Agent` tool and trace privacy limits, then requires
`skill_delivered: ERROR` and zero judge calls. The extension-free probe requires an
authenticated exactly-once prompt observation, an initial judgment, and `grade
--auto-rejudge` retaining delivery plus a real second-opinion panel. Each subject
invocation has one blank-response retry available, hence the four-process ceiling.

**Worth running even though the suite is green.** It caught `grade` silently
dropping the `objective` field from `results.yaml` — a gated scenario reading as
"no assertions declared" — while 1,036 tests passed. The round-trip suite
(`packages/core/test/field-roundtrip.test.ts`) now covers that class, but the
smoke run is what found it.

Each smoke probe is **one draw on a cheap model, not a measurement**: its
`results.yaml` is gitignored so a throwaway scorecard never lands in the repo.

`run`'s own release exit code is deferred rather than allowed to end the script;
the artifact assertions are the gate. The extension probe verifies its expected
objective ERROR and judge suppression after the subject returns. The extension-free
probe necessarily incurs its initial judge during `run`, then verifies delivery PASS
before authorizing `grade --auto-rejudge`; `grade` must carry that evidence unchanged.

What the gate fails on is mostly harness, not model: the spec's only content
needle is a sentinel no model can emit. **Mostly, not entirely** — the delegation
itself (`require_subagents` selection) and `task_contains` are the subject's
behaviour, and a provider outage reddens the first of them. So read the failing
assertion rather than assuming either cause. A `NOT READY` scorecard from `run` is
separate and expected: reported, not fatal.

The release pins are `openai-codex:gpt-5.6-luna` for the subject and
`openai-codex:gpt-5.6-sol` for the judge, explicitly authorized for this smoke.
They are distinct models but remain same-family, so this run is path verification—not
independent efficacy evidence. Pi has no entitlement preflight: either model can still
be unavailable at invocation time. `SMOKE_MODEL` and `SMOKE_JUDGE` override them.
The first preflight after any spec edit may report `stale` findings from earlier
local runs. The release smoke treats every nonzero lint exit as fatal before spend;
clear that gitignored litter by deleting `scripts/smoke/skills/*/tests/results/`
(not by `regate`, which can cost a judge call when a gate verdict flips).

### Smoke gate: deliberately skipped for 0.10.0

Recorded rather than silently omitted, because "mandatory" above is otherwise a claim this
release did not honour.

The gate's value is the three paths no fake can exercise: the streaming JSONL reader in
`runStructured`, the `--no-extensions --extension` argv the harness passes to pi, and the live
judge loop under `--auto-rejudge`. **This release touches none of them.** The diff is confined to
the `pi-daddy-v1` event adapter, a new closed-schema evaluator, the vendored producer contract,
two offline scripts, tests and docs — nothing in the pi invocation path, the judge path, or
`results.yaml`'s shape.

What was run instead, all free and offline: build, typecheck, 1,289 tests across 79 files, all
three dogfood lint roots at 0 findings, `mutation-test` 15/15, and
`node scripts/check-pi-daddy-contract.mjs` 4/4 both against the vendored copy and against a real
pi-daddy checkout read with `git show`. The adapter suite was additionally run against a `PATH`
with no `pi` on it, which is the CI condition.

The residual risk is stated plainly: if this change somehow broke pi invocation, only the smoke
gate would have caught it. Run it before the next release that touches the harness↔pi boundary.

## Publish the verified archives, in dependency order

Publish only the tarballs named and digested by
`release-artifacts/release-manifest.json`. Do not rebuild or pack between reading
that manifest and publishing. From the repository root:

```bash
VERSION=$(node -p "require('./package.json').version")
npm publish "./release-artifacts/skill-harness-core-${VERSION}.tgz" --access public
npm publish "./release-artifacts/skill-harness-adapters-${VERSION}.tgz" --access public
npm publish "./release-artifacts/skill-harness-cli-${VERSION}.tgz" --access public
npm publish "./release-artifacts/skill-harness-${VERSION}.tgz"
```

Each package must land before the next because the workspaces pin exact internal
versions. Publishing a workspace directory directly is deliberately refused by its
`prepack` guard: it would reintroduce state-dependent packing after the archive was
verified. There is no per-package fallback. If `release:pack` cannot produce all four
archives, stop rather than reconstructing its steps by hand.

The release script performs the package staging before invoking the guarded `prepack`:
core receives the public schemas and license, adapters and the meta-package receive the
license, and CLI receives `assets/report.template.html` plus
`assets/report.grade.js`. Every destination is checked before replacement, so a symlink
or non-regular file cannot turn staging into an external write. CLI continues copying
only `report.*`, so the README demo assets do not enter the package.

Do **not** publish `@skill-harness/pi-extension` — it is `private: true` and ships
to pi users via `pi install git:...`, not the npm registry.

## Verify after publishing

```bash
npm view skill-harness version            # expect the VERSION published above
npm i -g skill-harness && skill-harness --help
npx @skill-harness/cli lint --help
```

## After publishing — land the release on `main`, then tag it

**Every step below is mandatory.** Skipping one leaves the repo disagreeing with
what it ships. This was missed on two releases in a row (`v0.2.0` and `v0.2.1`
were both tagged on an unmerged `release-*` branch), which is why it is part of
the runbook rather than folklore.

### 1. Merge the release branch to `main`

The version bump lives on `release-<version>`. Until that branch reaches `main`,
a fresh clone of `main` reports a different version than the registry serves:

```bash
gh pr create --base main --head release/0.12.0 \
  --title "chore(release): 0.12.0" --body "Version bump, two-probe smoke, and runbook."
gh pr merge --merge   # or fast-forward main if there is nothing to reconcile
```

### 1b. Bump consumer pins when the results format grows

0.12.0 introduces **results schema 3** for authenticated delivery observations,
per-repetition criterion votes, and recomputable panel outcomes. Older readers do
not understand that evidence or its `NOT-MEASURED` semantics, so every consumer
that reads schema-3 results must upgrade to skill-harness ≥ 0.12.0.

The rule remains: **a `results.yaml` written by version X needs version ≥ X to
lint or rewrite it.** Bump every exact consumer pin to `v0.12.0`; consumers using
`@latest` receive the compatible reader when the release tag moves.

A repo tracking `@latest` gets that automatically **once the release is tagged** —
which is the one ordering trap left: results produced by a local checkout of
`main` that is ahead of the newest tag can out-run CI. Either tag the release
before committing results generated from it, or generate them from the released
tag.

A repo on an exact pin needs that pin bumped as part of the release.

Schema-1 and schema-2 evidence remains readable with its historical meaning; do
not migrate or rewrite it merely to adopt schema 3.

### 2. Tag the release, and move `latest`

```bash
git checkout main && git pull
git tag v0.12.0 && git push origin v0.12.0     # the immutable release tag
git tag -f latest && git push -f origin latest   # the ref the docs point at
```

Moving `latest` is what keeps `AGENTS.md`, both READMEs and `docs/USAGE.md` free
of version numbers — they say `@latest`, so a release needs no doc edits at all.
Only this file names concrete versions.

**There is deliberately no `v1`.** It existed until 0.3.0 and was removed. The
usual case for a moving *major* tag (`actions/checkout@v4`) assumes behaviour
inside the major is compatible. `lint` is a **gate**: every release that adds a
check makes a repo that passed yesterday fail today — 0.3.0 added three. A tag
promising "stable major, moves forward" advertises a stability a linter cannot
honour. `latest` moves just as much but promises only "the newest release", which
is true, and the docs tell consumers to pin a release tag when they want to
choose *when* new checks land.

Consumers that pin need their pin bumped as part of the release
(`.github/workflows/ci.yml`, the `ref:` on the skill-harness checkout). Consumers
tracking `latest`, including the current `principal-pi-skills` workflow as corrected
in the 0.11.0 notes above, receive the compatible reader when `latest` moves.

For a repo that genuinely tracks `@latest`, the release reaches CI the moment the tag
moves, so **push the tag when you are ready for that gate to change**, not mid-flight
on unrelated work.

Either way, re-run the skills whose results the new version invalidates: a
release that changes what a gate measures leaves the committed scorecard
describing the old measurement.

## Verification performed before the 0.2.1 update to this runbook (2026-08-04)

- `npm run build` from the repo root succeeded and left the tree clean.
- Confirmed `dist/` is gitignored for `core`/`adapters`/`cli` (`git ls-files
  packages/core/dist` → empty), which is what makes the build step above
  mandatory. The 0.1.x runbook claimed `dist/` was committed; it is not, and
  publishing from a fresh clone without building would have shipped an empty
  tarball.
- All four inter-package deps confirmed pinned at exactly `0.2.1`
  (`adapters`→`core`, `cli`→`core`+`adapters`, `skill-harness`→`cli`), which is
  what makes the dependency order above mandatory.
- `npm pack --dry-run -w <pkg>` re-run for all four publishable packages.
  Confirmed:
  - `@skill-harness/core` and `@skill-harness/adapters` tarballs contain only
    `dist/**` + `package.json` + `LICENSE` + `README.md` — no `src/`, `test/`,
    or `node_modules/`.
  - `@skill-harness/cli`'s tarball (9 files) additionally contains
    `assets/report.template.html` and `assets/report.grade.js` flat under
    `assets/` (not nested `assets/assets/`), staged by its `prepack` script.
  - `skill-harness` (the unscoped meta package) contains only `bin.js` +
    `package.json` + `LICENSE` + `README.md` (4 files).
- The `-w` workspace-flag form was confirmed working against this repo on the
  earlier 0.1.0 run (npm 11.9.0) and the `--dry-run` packs above used it again.

For the 0.2.1 release these were re-confirmed against the bumped tree, and the
publish itself was run (see the `v0.2.1` tag).

For 0.3.0 (published 2026-08-04) all of the above were re-run against the bumped
tree — build clean, four exact `0.3.0` inter-package pins, pack contents unchanged
in shape (core 49 files, adapters 7, cli 9 incl. the two `assets/` files, unscoped
4). Two notes for next time:

- **This release inverted the runbook's order** — merge and tag happened first and
  the publish came days later, leaving the registry on 0.2.1 while `main` and the
  `v0.3.0`/`latest` tags said 0.3.0. Nothing broke, because a consumer tracking the
  git `@latest` tag reads the repo rather than the registry, but for the window in
  between `npm i -g skill-harness` served code older than the docs described.
  Publish first, as written above.
- **`npm view <pkg> version` lags the publish.** Immediately after `+ skill-harness@0.3.0`
  it still reported 0.2.1, because `view` reads `dist-tags` and that document is
  CDN-cached; the version was already in `npm view <pkg> versions`. Re-query with
  `--prefer-online` (or a throwaway `--cache` dir) before concluding the dist-tag
  failed to move — it resolved on its own within a minute here, and
  `npm dist-tag add` was not needed.

## Verification performed for 0.3.1 (published 2026-08-05)

- `npm run build:ext` clean; 505 tests pass; `npm pack --dry-run` re-run for all
  four packages: core 49 files / 65.7 kB, adapters 7 / 3.1 kB, cli 9 / 20.1 kB,
  unscoped 4 / 2.3 kB — same shape as 0.3.0, cli back to its pre-GIF size.
- **`npm version --workspaces` does not update inter-package pins.** It bumped all
  five `version` fields to 0.3.1 and left every `@skill-harness/*` dependency
  pinned at `0.3.0`, so `cli@0.3.1` would have shipped depending on `core@0.3.0` —
  a new version number in front of the old, buggy code. Pins were corrected by
  hand in `adapters`, `cli`, `skill-harness` **and `pi-extension`'s
  `devDependencies`**, which is easy to miss because it is the one package that is
  never published.
- **That mismatch also poisons the lockfile.** With versions at 0.3.1 and pins at
  0.3.0, `npm install` cannot satisfy the pins from the workspace, so it silently
  downloads the *published* 0.3.0 tarballs into nested `node_modules` — meaning
  build and tests run against the released code, not the local tree. Fixed by
  correcting the pins, deleting the nested `@skill-harness` dirs and reinstalling;
  verify with `grep -c 'registry.npmjs.org/@skill-harness' package-lock.json`,
  which must be **0**.
- Next release: bump versions and pins together (`npm version --workspaces`
  followed by a pin sweep), then re-run that grep before building.

### What went wrong anyway, and the two guards that would have caught it

The publish itself was clean and all four packages verified from a fresh install.
Two process failures around it are worth not repeating:

- **CI was red on the release commit and the release was merged regardless.** The
  status was read from `gh run watch … | tail -3; echo $?`, which reports **`tail`'s**
  exit status, not `gh`'s — it prints `exit=0` whatever the run did. Read the
  conclusion instead, and never through a pipe:

  ```bash
  gh run view <id> --json conclusion,jobs --jq '.conclusion, (.jobs[] | "\(.name): \(.conclusion)")'
  ```

- **The failing test was the pi-extension bundle-freshness check, and it was right.**
  `dist/index.js` had been built while duplicate `@skill-harness/*` copies were still
  in nested `node_modules` (fallout from the version/pin mismatch above). esbuild
  inlines each copy separately, so the committed bundle was 5418 lines where a clean
  rebuild is 4574. Checking the *lockfile* was not enough — the duplicates were on
  disk. Before committing a bundle, reproduce CI:

  ```bash
  npm ci && npm run build && npm test     # npm ci wipes node_modules; npm install does not
  ```

  Fixed in `cdfcaba`. npm was never affected: `pi-extension` is `private: true` and
  the four published packages are built by `tsc`, not this bundle. The stale artifact
  was what pi users get from `pi install git:...`, which is why `latest` was moved
  forward to `cdfcaba` while `v0.3.1` stayed on the published tree.

## Verification performed for 0.3.2 (prepared 2026-08-05, unpublished at time of writing)

Prepared on `release-0.3.2`. The publish itself is still the user's step — this
section records what was checked so the publish is the only unverified part.

- **Bumped versions and pins in one sweep**, per the note 0.3.1 left behind: a
  single `sed 's/"0.3.1"/"0.3.2"/g'` across the root and all five package manifests
  catches the `version` fields *and* the `@skill-harness/*` pins in `adapters`,
  `cli`, `skill-harness` and `pi-extension`'s `devDependencies` together, which is
  what `npm version --workspaces` fails to do. Verified: 12 occurrences moved, none
  left at 0.3.1.
- **`SKILL.md`'s frontmatter `version:` is a sixth place the version lives**, and no
  previous release note mentioned it — it was still `0.3.1` on a tree bumped
  everywhere else. It is the manifest pi reads when the harness is installed as a
  skill, so a stale value misreports the installed version to the agent using it.
  Bump it with the manifests, and confirm with
  `grep -rn '0\.3\.1' --include='*.md' --include='*.json' . | grep -v node_modules`
  before committing: the only hits left should be historical prose (this runbook's
  context sections, `docs/ROADMAP.md`, `docs/posts/`).
- `grep -c 'registry.npmjs.org/@skill-harness' package-lock.json` → **0** after
  `npm install`, so the workspace satisfies its own pins and nothing resolves to a
  published tarball.
- Reproduced CI before committing: `npm ci && npm run build && npm test` — 516
  tests pass, `npm run typecheck` clean, and the tree afterwards contained *only*
  the manifest/lockfile changes. That last part matters: it confirms
  `packages/pi-extension/dist/index.js` is already fresh (the bundle embeds no
  version string, so a patch bump does not stale it) and that the bundle-freshness
  test was really exercised against a clean `node_modules`.
- `npm pack --dry-run` re-run for all four publishable packages. Shape unchanged
  from 0.3.1 — core 49 files / 66.8 kB, adapters 7 / 3.1 kB, cli 9 / 20.5 kB (both
  `assets/report.*` flat, not nested), unscoped 4 / 2.3 kB. The small core/cli
  growth is the `aggregationMismatch` code plus `liftNoneBadge` in
  `assets/report.grade.js`.
- **Read CI's conclusion without a pipe**, the guard 0.3.1 added after a red release
  commit was merged on a `tail`-masked exit status:

  ```bash
  gh run view <id> --json conclusion,jobs --jq '.conclusion, (.jobs[] | "\(.name): \(.conclusion)")'
  ```

## Verification performed for 0.6.0 (published 2026-08-06)

- Versions **and** pins bumped across the root and all five manifests plus `SKILL.md`'s
  frontmatter `version:`. `grep -c 'registry.npmjs.org/@skill-harness' package-lock.json`
  → **0**.
- CI reproduced from a clean install: `npm ci && npm run build && npm run build:ext &&
  npm test` — **662 tests pass** (50 files); `npm run typecheck` clean; `lint all` against
  the golden fixture reports 0 findings and exits 0; `--version` → `0.6.0`; `stability` is
  in `--help`.
- **Validated against the real corpus, read-only.** `stability all --skills
  ~/prepos/principal-pi-skills` reports **6 boundary cells across 7 skills** — including
  the reported `plan`/DS A5 case (`PASS!→FAIL!`, both runs unanimous, labelled as across a
  SKILL.md edit) and a second one nobody had noticed (`plan`/glm C2, `FAIL!→PASS→FAIL`,
  2 flips in 2 steps). `plan`/DS D1 correctly comes back as **not** a flip: its
  `../../agents/plan.md` changed between the runs, and the note says so. Six notes over a
  ~140-run corpus is the signal-to-noise this only pays for if it stays rare.
  `collectReport` on the same tree attaches the `⇄` marker to exactly those cells.
- New suites: `packages/core/test/stability.test.ts` (22 — flip/volatility/path, the
  unanimous-flip flag, every rejection reason, mode and tag isolation, the three states,
  the scorecard and review-matrix surfaces) and
  `packages/cli/test/stability-cmd.test.ts` (8 — the command's output, `--all`, the
  `--window` guard, and lint's `ℹ`/`::notice`/exit-0 behavior).
- `npm pack --dry-run` for all four: core **63 files / 103.6 kB** (one new module,
  `stability`), adapters 7 / 4.3 kB, cli 9 / 24.9 kB, unscoped 4 / 2.3 kB.
- `packages/pi-extension/dist/index.js` regenerated with `npm run build:ext` and committed.
- **After publishing:** all four packages report `0.6.0`, `dist-tags.latest` moved (the
  unscoped package again lagged the scoped three by under a minute — expected, see 0.5.0).
  From a clean temp dir, `npx skill-harness@0.6.0 stability plan --skills <corpus>` prints
  the three real boundary cells, so the published tarball carries the new module and its
  CLI wiring. Tags `v0.6.0` and `latest` both point at the merge commit `d6dbc18`.

## Verification performed for 0.5.0 (published 2026-08-06)

- Versions **and** pins bumped across the root and all five manifests plus `SKILL.md`'s
  frontmatter `version:`. `grep -c 'registry.npmjs.org/@skill-harness' package-lock.json`
  → **0**.
- CI reproduced from a clean install: `npm ci && npm run build && npm run build:ext &&
  npm test` — **632 tests pass** (48 files); `npm run typecheck` clean; `lint all` against
  the golden fixture reports 0 findings. `--version` prints `0.5.0`; the `--help` header
  and `defaults:` block carry the new scored-mode/delivery paragraph.
- **The 0b workflow was rehearsed against real committed data, without touching the other
  repo.** One `release-2-force` run dir from `principal-pi-skills` (`plan`, glm-5p2,
  2026-08-05T13-46-47Z) was copied to a scratch tree and rescored with the built CLI:
  `mode=force (not scored)` → `B (83%) 10/12 NOT READY`, `0 verdict(s) moved`,
  `label: release-2-force` and the absent `harness_cli_version` both preserved (a rescore
  must not invent provenance a run never had). `lint` on the same copy reports exactly one
  `consistency … rescore (free, offline)` finding per unscored force run, and none after.
- New suites: `packages/core/test/force-scoring.test.ts` (12 tests — the scoring-mode
  truth table, run/rescore/grade/regate on force runs, the lint remedy, red-vs-force
  lift) and `packages/core/test/canary.test.ts` (16 — anchor selection, pass/fail/skip,
  abort-before-spend, the version record). `pi.test.ts` gained the delivery tripwire and
  `pi --version` cases; `trends.test.ts` the per-mode series.
- `npm pack --dry-run` for all four: core **61 files / 93.9 kB** (was 59 / 84.5 — one new
  module, `canary`), adapters 7 / 4.3 kB, cli 9 / 23.3 kB (both `assets/report.*` flat),
  unscoped 4 / 2.3 kB.
- `packages/pi-extension/dist/index.js` regenerated with `npm run build:ext` and committed
  (`bundle.test.ts` is what fails if it goes stale — it did, once, before this step).
- **After publishing:** all four packages report `0.5.0` on the registry and
  `dist-tags.latest` moved (the unscoped `skill-harness` lagged the scoped three by about
  a minute — worth knowing before assuming a failed publish). `npx skill-harness@0.5.0
  --version` → `0.5.0` from a clean temp dir, and `npx skill-harness@0.5.0 lint` runs
  against a real skill tree. Tags `v0.5.0` and `latest` both point at the merge commit
  `ac6030e` on `main`.

## Verification performed for 0.4.0 (prepared 2026-08-05, published)

- Versions **and** pins bumped in one `sed` sweep across the root and all five manifests,
  plus `SKILL.md`'s frontmatter `version:` (the sixth home 0.3.2 discovered).
  `grep -c 'registry.npmjs.org/@skill-harness' package-lock.json` → **0**.
- CI reproduced from a clean install: `npm ci && npm run build && npm run build:ext &&
  npm test` — **591 tests pass**; `npm run typecheck` clean; `lint all` against the golden
  fixture reports 0 findings.
- `--version` prints the bumped value; `--help` header carries it; the `defaults:` line
  shows `claude-code:claude-opus-4-8`.
- **`regate` is in `--help` and refuses cleanly with no args.** Its unit suite covers the
  four per-rep cases, the gates-hash refresh, transcript regeneration + `.pre-regate.txt`
  preservation, the `vitest`/`post_test` refusal, and the missing-artifact refusal.
- `npm pack --dry-run` re-run for all four: core **59 files / 84.5 kB** (was 49 / 66.8 —
  the five new core modules: `regate`, `downgrade`, `version`, `defaults`,
  `judge-policy`), adapters 7 / 3.1 kB, cli 9 / 22.4 kB (both `assets/report.*` flat),
  unscoped 4 / 2.3 kB. Check the count against this rather than against 0.3.x's 49.
