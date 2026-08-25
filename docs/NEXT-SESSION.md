# Next session — start here

*Written 2026-08-21 at the close of the 0.10.0 release session. Read this before
`docs/ROADMAP.md`: the roadmap says where the project is going, this says what is
half-finished and what will bite you. Release notes live in `PUBLISHING.md` — this file
deliberately does not restate them.*

## Pi-daddy 0.19.0 ledger-v2 contract re-pin — current handoff

**State:** deterministic synchronization branch `fix/pi-daddy-c364-contract-repin`,
started from exact skill-harness `main`
`fb56cc8d39ebf16ab3b7e662db63b63357bb659e`. The producer pin is exact pi-daddy
`c364a6717e3d5e369ecd3298b9cbb595eb94d9b2` / 0.19.0; both remote mains were
verified at those revisions before the branch was created.

The producer's closed refusal vocabulary moves from 31 to 32 codes by adding
production-reachable `WORKSPACE_NOT_AUTHORIZED`. The regression fixture is generated
by production `planDelegation` and mapped through production `buildRecord`; it retains
the denied `workspace:production` identity, full structured refusal, nested
correlation, and run/task joins. The real-builder matrix is 47 positive cases and 10
fail-closed mutations, with all 32 refusal codes preserved. The exact package and
dist-manifest SHA-256 values are recorded in `PINNED.json` alongside the source paths
and seven vendored artifact digests.

This is contract synchronization only. No model or judge calls, release, publish,
tag, merge, or OS-sandbox claim belongs to it.

**PR #63 review follow-up:** independent review first found that a reused ignored
`packages/cli/dist/cli.js` could retain mode 0755 through TypeScript and produce a
different archive than a clean 0644 build. A whole-change re-review then found three
more release-control defects: nested output symlinks could escape to an external target,
package inputs such as `package.json`/README were not comprehensively checked, and the
manifest did not bind source or toolchain identity.

The repaired mandatory `npm run release:pack` path now requires clean tracked source,
records exact commit/tree and Node/npm versions, validates every existing output
component without following links, recreates only known generated roots, and compares an
explicit source inventory with npm's dry-run plan, actual pack metadata, and real tar
paths/types/modes/sizes/bytes. Failures remove all four expected archives and completion
evidence; the manifest is written last by same-directory temporary-file rename. Raw
workspace pack/publish remains fail-closed. Hostile regressions cover direct/nested/
chained/dangling output links, package-input links/FIFOs/missing files, declaration and
npm inventory drift, actual tar mutation, dirty source, stale candidate/toolchain
manifests, and removed CLI normalization. The lock now resolves runtime `js-yaml` to
4.3.1, clearing the production-only audit without a broad audit fix. The dependency
floor changes only core's package metadata; final authorized archive SHA-256 values are
core `549d86e2952d0d224448ee50aafbd8665eee7331b9bbfe7e5d5bd284eb80a2fc`,
adapters `eae95b06a255dbd14e6cfbfaa5da25c0d9cb4ae337c49cd730d513f3680ca9cc`, CLI
`f4800a8c0a784016b6c094ea5155ea2383dfb6ff2c8bb47489332ff8f047d343`, and meta
`e52fa3665c641973fc5a870b54694e7e71922c05be630a830fb5953e040ec830`.

## Previous cross-repository pi-daddy v2 contract repair — historical handoff

**State:** product-fix branch in progress; no release action is authorized. The exact
starting state was clean `main` at
`1434ac319c915022f5c635d2130dedad742d5efe` (`v0.11.0`, equal to `origin/main`). PR
[#53](https://github.com/mojomanyana/skill-harness/pull/53) was already merged, so this
is a successor branch, `fix/pi-daddy-v2-refusal-contract`, rather than a rewrite of its
published head `43564f1c6e9e97515469a01b5542b5435b66c9db`. Starting from current main deliberately
includes the reviewed 0.10.0 closed-schema/generated-contract repair and the unrelated
0.11.0 provider/arms release; no later `main` change was merged or cherry-picked after
the branch point. The implementation commit is
`87598f1218be260ef9427972c75bd38997f47f2b`; the review handoff is
[PR #62](https://github.com/mojomanyana/skill-harness/pull/62). The PR's immutable
final head is recorded in the final response/GitHub metadata because a commit cannot
contain its own SHA.

**Immutable cross-repository inputs:** principal-pi-skills
`2c53559f4b5f4b193c503ba4a1b04e76c51b0aef`; pi-daddy Handoff B
`3070152efd4633bc40f5065e892d5eee8372ffc8`; skill-harness Handoff A
`43564f1c6e9e97515469a01b5542b5435b66c9db`. The consumer pin is now explicitly
repository `mojomanyana/pi-daddy`, schema source
`packages/pi-daddy/contracts/ledger/v2/ledger-event.schema.json`, refusal source
`packages/pi-daddy/src/refusals.ts`, and schema SHA-256
`69c3a6856481b9250587c5785a8aadda87baba6cb03c79b209cff4f55f70a81c`.

**Builder-produced reproduction before the fix.** In clean detached checkouts of
pi-daddy Handoff B and skill-harness Handoff A, pi-daddy's production `buildRecord`
created a blocked v2 capability decision using its production `REFUSAL_CODES` member
`GRANT_ID_MALFORMED`. TypeBox accepted the wire record against pi-daddy's checked-in
v2 schema. Passing that exact JSONL line to Handoff A's `normalizePiDaddyLedger`
returned verbatim:

```text
invalid pi-daddy v2 capability_decision at line 1: refusal has unsupported code "GRANT_ID_MALFORMED"
```

**Root cause and repair mapping.** Handoff A had copied the producer's refusal
vocabulary and omitted a published member. The adapter now derives accepted refusal
codes directly from the generated immutable schema; the producer's refusal source is
also vendored byte-exact and digest-pinned. The deterministic vendor command supports
`--check`. `scripts/verify-pi-daddy-builders.mjs` refuses any dirty/non-pinned producer
checkout, builds both repositories, imports production builders and `REFUSAL_CODES`,
validates builder output against the pin, and checks all codes, legacy dispatch,
approvals/correlation/digests, every lease outcome, lifecycle flags, receipt identity,
and fail-closed mutations. CI checks out the producer at the literal SHA and makes the
ordinary build/test and dogfood jobs wait for this gate.

**Complete free evidence.** The authoritative harness pass used Node `v20.20.2` / npm
`10.8.2`: `npm ci` completed (59 packages; npm reported the existing 8 audit findings),
`npm run build`, `npm run typecheck`, and `npm run build:ext` passed; `npm test` passed
**1,372/1,372 tests across 86 files**; `mutation-test` detected 15/15 trajectory
mutations; both required lint roots reported one skill and 0 findings; `git diff
--check` passed. A direct refusal-vocabulary mutation made the new targeted contract
test fail (4 failures, including the all-codes and `GRANT_ID_MALFORMED` cells) and was
restored. Node `v24.19.0` / npm `11.17.0` separately passed the same 1,372 tests with no
worker-teardown difference.

The real-builder verifier ran on Node 24 (pi-daddy requires Node >=22.19) against a
clean detached checkout at the exact pin: **46 builder-produced positive cases**, all
31 production refusal codes, 9 lease outcomes, 3 lifecycle states, and receipt/
approval/digest/legacy mappings passed; **10 fail-closed mutations** were rejected;
every v2 normalized event retained run/task joins. The deterministic vendor `--check`
and the direct vendored conformance check also passed. No model or judge calls.

Four public packages were packed on Node 20 and installed together with `npm install
--offline` into an empty probe. `skill-harness --version` returned `0.11.0`:

| package | tarball SHA-256 |
|---|---|
| `@skill-harness/core` | `2be702f14c544cdb03ff8617e5dee90f8039bbdf7e0e527d2c833c1868c129f6` |
| `@skill-harness/adapters` | `292cde8ac211dc39ca172f066fd34f731ccdde59fc0651bd57fa7d8bd94b634a` |
| `@skill-harness/cli` | `dd95dd0caa1f6013fa06c944c0445285a147a1f4a5fbc8becb960232c237ffd9` |
| `skill-harness` | `91d379a7a6cc8d1aba347bfa1ebe50dfbab2efb20b4464774f6dc0ce96c5e026` |

**Changed files:** `.github/workflows/ci.yml`, `AGENTS.md`, `PUBLISHING.md`,
`contracts/pi-daddy/ledger/v2/{PINNED.json,README.md,refusals.ts}`,
`docs/{ASSURANCE-WORKFLOWS.md,NEXT-SESSION.md}`,
`package.json`, `packages/adapters/src/{pi-daddy-ledger-v2.ts,trajectory.ts}`,
`packages/adapters/test/pi-daddy-contract.test.ts`,
`packages/pi-extension/dist/index.js`, and
`scripts/{check-pi-daddy-contract.mjs,vendor-pi-daddy-contract.mjs,verify-pi-daddy-builders.mjs}`.

Remaining paid/model evidence is unchanged: the principal-pi-skills remeasurement and
future Codex arms waves in this document remain owner-authorized-later work. None is
needed to validate this deterministic contract repair and none was run. **No OS sandbox
was added. No publish, tag, GitHub Release, merge, or paid/model run occurred.**

## Where things stand

`skill-harness@0.10.0` is **published, merged and tagged.** `v0.10.0` and `latest` both point at
`5dfbc7a`, all four packages are on the registry, and `main` reports the same version the
registry serves. Verified by installing `skill-harness@0.10.0` into an empty project rather than
by trusting the publish output — `--version`, `list`, and the presence of the new adapter
modules in the shipped tarball. CI green on `main`. 1,289 tests across 79 files. Working tree
clean, no open PRs.

**0.10.0 pinned the pi-daddy v2 adapter to the producer's canonical contract.** Full notes and
the consumer checklist are in `PUBLISHING.md`; the short version is that the adapter used to
restate pi-daddy's `ledgerVersion: 2` contract in its own code, and measured against the
producer's own builder fixtures it disagreed three ways at once — rejecting the canonical
`check_receipt`, rejecting a refusal code from the producer's own enum, and letting an undeclared
top-level field through. The contract is now *interpreted*: `contracts/pi-daddy/ledger/v2/`
vendors the producer's schema and four fixtures byte-exact with per-artifact SHA-256, and
`packages/adapters/src/closed-schema.ts` validates a record against those bytes before semantic
normalization.

It took the minor, not a patch, because an undeclared top-level field now **fails closed** where
0.9.0 accepted it. That is a gate getting stricter, which is the same reason this project has no
moving `v1` tag.

**What is deliberately not claimed.** Unchanged, and conformance to a contract does not touch any
of it. There is **no OS sandbox** — core exports a `SandboxBackend`/`withSandbox` seam with
fake-backed tests, and temp fixture directories and git workspaces are *not* containment. The
principal digest chain is an integrity check, not attestation: it detects torn or edited saved
logs, but an unsandboxed subject that can rewrite and rehash a whole ledger can fabricate one.
Any report must keep saying containment is unavailable until a real backend exists.

**The 0.10.0 smoke gate was deliberately skipped, and `PUBLISHING.md` says so** in its own
section rather than leaving "mandatory" as a claim the release did not honour. The three paths it
uniquely covers — `runStructured`'s streaming JSONL reader, the `--no-extensions --extension`
argv, and the live `--auto-rejudge` judge loop — are all in the harness↔pi and judge boundaries,
and 0.10.0 touched neither. **Run it before the next release that does.** Its last recorded run
reached all four stages, exit 0, on pi 0.84.2 for 2242/457 subject tokens (`cost_usd 0.00049`)
and 3 judge calls. Treat that as one draw on a cheap model, not a measurement.

## Merged since 0.10.0: the Codex + arms axis (unreleased)

`main` is now `5888830` and carries a body of work that is **merged but not released** —
the registry still serves 0.10.0 and `package.json` still says 0.10.0. PRs
[skill-harness#58](https://github.com/mojomanyana/skill-harness/pull/58) and
[principal-pi-skills#32](https://github.com/mojomanyana/principal-pi-skills/pull/32) both
merged 2026-08-22. Verified on merged `main`: build clean, `npm run typecheck` PASS,
**1,368 tests across 85 files**, and the invariant below unmoved.

**What it adds.** Provider failure is classified as infrastructure `ERROR` on both run
paths rather than scored as model behaviour, and survives `grade`/`regrade`. `run
--structured` populates the subject half of `ScenarioMetrics` — tokens, `subject_cost_usd`,
wall time — which no run had ever written, because `runStructured` only fired for a
declared trace/trajectory gate and no scenario in the corpus declares one. And the pi-daddy
**arms axis**: `<skills-root>/tests/arms.yaml`, a `--arm` flag, the arm carried in the
run-dir tag, definition seeding, refusals, and a per-run ledger counted into the record.
`docs/CODEX-ARMS-RUNBOOK.md` is the console guide.

**Wave 0 has never run.** It is blocked on one thing: the `openai-codex` OAuth token in
`~/.pi/agent/auth.json` is invalidated. **`pi auth check` is not the gate** — it reported
`{"status":"ready","authType":"oauth"}` against that same dead token, because it verifies a
credential exists and refreshes, not that it works. Use the runbook's one-call probe. Note
also that `--mode json` is the *worse* diagnostic here: it reports a generic
`provider_transport_failure` and exits **0**, while text mode exits 1 and prints the real
message.

**Still unverified and load-bearing:** whether pi binds a thinking level from a `:suffix`
on `--model` (`openai-codex:gpt-5.6-sol:medium`). The spike died on the dead token, so this
is open, not merely untested. If it does not bind, the run silently uses the provider's
**default** thinking level while the run dir, the record, and every later comparison all
say `medium`. Fallback if needed: an optional third segment in `parseModelRef` plus
`--thinking` in `pi.ts`'s `common` array — sized, not designed.

**Do not release on the strength of this.** Nothing in the axis has been exercised against
a live model. The arm's delivery proof — the ledger event count — has never once fired.
Publishing an A/B axis whose proof has never produced a non-zero reading would be a claim
resting on unit tests alone. Hold 0.11.0 until Wave 0 reports at least one real ledger
event.

### The invariant that must keep holding

```bash
node bin/skill-harness.js lint all --skills ../principal-pi-skills
# 7 skill(s), 101 finding(s), 32 note(s) (do not fail the gate)
```

Measured **seven** times across this work, including after the corpus's `arms.yaml` landed
and after the merge. Movement means an arm leaked into a result digest — treat any change
as a bug in this work, not as corpus drift, until proven otherwise.

### What the PR reviews caught, because the pattern repeats

The branch was reviewed per-task, then whole-branch, then again on the PRs. The PR round
found **11 findings in the tool and a critical one in the corpus**, and two of them would
have destroyed a Wave 0 spend without the pilot being able to detect it:

- **Every `results.yaml` rewriter dropped the `arm` block.** `regrade`, `regate`, `rescore`
  and the review UI rebuilt the draft field-by-field, so grading an arm run *deleted*
  `definitions` and `ledger_events` — and since the ledger it counts is gitignored, that
  destroyed the only surviving proof the run delegated. Carried now, for the same reason
  `harness_cli_version` and `source_hashes` are.
- **One pi crash could unwind a whole wave.** `--structured` routes every scenario through
  `runStructured`, which throws on a stream with no terminal events; `runRep` had only a
  `finally` and `runPool` is fail-fast, so a mid-wave crash meant no `results.yaml` and
  every completed verdict lost. An adapter throw is now one rep's infrastructure ERROR with
  the same one-shot retry a blank assistant turn gets.

**The corpus finding is the one to learn from.** As first merged, the arm's
`PI_GRANTS_GRANT` could not delegate *at all* — no `tool:delegate` (so a governed session
registers no spawn tool), no `agent:` capability (so `maySpawnDefinition` refuses all six
definitions), and not a superset of the seeded ceilings (so the four `bash`-declaring
definitions are hard `CAPABILITY_ESCALATION` refusals, not narrowings). It would have run
green, tagged `+pi-daddy`, and measured the control with extra steps.

`require_definitions` could not catch any of it, and that is the lesson: **it counted
definition files COPIED, not definitions reachable.** The same mistake appeared twice more
in the same review — the count was satisfied by two seed dirs sharing a basename whose
files overwrote each other, and `require_definitions: six` silently parsed to `0`,
disabling the refusal entirely. A refusal that validates the wrong quantity is a gate that
cannot fire, which is the exact failure it was written to prevent. When adding a threshold,
state what it proves and then check that it proves *that*.

Two more worth knowing before touching this code:

- **The provider-failure marker used to be forgeable.** The text path wrote it *after* the
  assistant body, so a model emitting the same line at column 0 turned a FAIL into ERROR
  and muted the judge on every re-grade. It now goes in the transcript **preamble**, ahead
  of the first `>>> ` header, and the reader stops scanning there. **Transcripts written
  before that change carry the old placement and will no longer short-circuit on re-grade.**
- **`.pi/` exclusion was too broad.** It was excluded from the captured diff and the
  snapshot for *all* runs including the control, hiding legitimate model writes there.
  Narrowed to `.pi/skills/`.

**A hazard worth recording:** across the implementation plan, seven specified tests turned
out to be unable to fail — fixtures that never contained the string they claimed to reject,
one that tripped an unrelated pre-existing `ERROR` path instead of the one under test, one
built on unverified string surgery, one whose mutation was unreachable because the fixture
carried no diagnostics to begin with, vacuous post-run filesystem assertions defeated by
workspace teardown, and a byte-identical clone that `stability` could never flag as
anything but identical. Every one was caught by the mandatory mutation step; none by
reading the passing suite. And the durable pattern across every review round: **the code
added in a late fix round was consistently the least-covered on the branch.** Keep the
mutation step non-negotiable, and give fix-round code the same test scrutiny as the
original.
## Wave 0 ran. Read this before planning Wave 1.

The arms axis has now been exercised against a live model: `review`, 22 scenarios,
`openai-codex:gpt-5.6-terra:high`, `--mode force`, 3 reps, both arms, twice on the governed
side. Results are committed in `../principal-pi-skills` (`review/tests/results/
pi-openai-codex-gpt-5.6-terra-high{,+pi-daddy}/`) and written up in
`docs/posts/2026-08-23-the-spawn-that-only-said-starting.md`.

```
                          grade            S6     subject in-tokens   delegations
control                   A 95% 21/22      FAIL          87,660            n/a
arm · herdr · 0.18.1      A 95% 21/22      FAIL         123,088       1 (hung)
arm · subprocess · 0.19.0 A 95% 21/22      FAIL         123,677             0
```

**Three things Wave 0 settled, so nobody re-derives them:**

1. **The `:suffix` thinking level binds.** `openai-codex:gpt-5.6-terra:high` works —
   `parseModelRef` splits on the first colon and pi's pattern parser takes the rest. A valid
   level resolves silently; only an invalid one (`:banana`) falls through to "custom model id"
   and is rejected by the provider. The spec's `--thinking` fallback is not needed.
2. **Sol is not available on a ChatGPT-account subscription**, nor are `gpt-5.4` or
   `gpt-5.3-codex-spark`. Available: `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`,
   `gpt-5.4-mini`. `pi --list-models` is a catalog, not an entitlement check — it lists all
   seven. So a "three model" comparison is really Terra + Luna.
3. **An arm MUST pin `PI_GRANTS_HERDR: "0"`.** It is three-state in pi-daddy and *absent
   means probe*, so a machine with `herdr` on `PATH` silently gets pane-based execution, which
   cannot work behind `pi -p` — the pane never reaches the readiness `herdr agent start`
   waits for. Wave 0's first arm hung exactly there for the full 300s adapter timeout. Fixed
   in the corpus's `arms.yaml`; the general rule is that **a measurement harness is the one
   caller that must never accept a probed default.**

**And the finding that matters most, which is about the skill and not the arm:** `S6` passed
**once in nine attempts** across all three runs, failing identically each time — handing over
a rewrite when the scenario asks it to recommend the already-minimal original be kept. `S6` is
in the critical set, so 21/22 at 95% still reports NOT READY. `lint` had already flagged it as
a boundary cell. On this model `review` reliably fails the one scenario that tests restraint.

### Wave 1 — scope it to the skills that actually delegate

**Do not run Wave 1 as the spec sketched it.** `review` is single-turn code review: nothing
about it wants a sub-agent, and the governed arm was therefore a pure surcharge — zero
behavioural difference and **+40% subject input tokens**. That cost isolates cleanly: the two
arm runs differ by 0.5% in input tokens despite one delegating and one not, so the 40% is the
*context* cost of carrying three delegation tools plus six available definitions on every rep,
paid whether anything spawns or not. Governance is billed by the turn, not by the delegation.
Five more skills of that shape buys five more surcharges and no signal.

The skills worth the spend are the ones whose definitions delegate: **`plan` and `debug`**,
which have `principal-plan.md` / `principal-debug.md` agent files, and whose specs carry
`system_prompt_file` D-series scenarios that run *as* those definitions. In Wave 0 the single
delegation attempt in 132 governed reps came from exactly such a scenario (`review`'s `D2`,
which runs as `principal-review.md`). That is the only channel through which governance has
been observed to engage at all.

Suggested next wave, in this order:

```bash
# control, then governed, one skill at a time — check the ledger between them
node bin/skill-harness.js run plan  --skills ../principal-pi-skills \
  --mode force --model openai-codex:gpt-5.6-terra:high --structured --label w1-plan-control
node bin/skill-harness.js run plan  --skills ../principal-pi-skills \
  --mode force --model openai-codex:gpt-5.6-terra:high --structured --arm pi-daddy \
  --label w1-plan-pi-daddy-pd<version>
# then the same two for `debug`
```

`plan` is 13 scenarios and `debug` is 12, so at 3 reps that is ~150 subject executions for all
four runs. **Read `ledger_events` in each governed `results.yaml` before drawing any
conclusion.** Zero means the model declined to delegate and the comparison is a cost
measurement only — which is a legitimate finding, but it is not a finding about governance
changing behaviour, and Wave 0 is the cautionary example of how similar those look.

Note `debug` and `plan` also carry `mode: seeded` scenarios (9 and 7 across the corpus), so
those runs will exercise the seeded arm path — the one whose `.pi/skills` staging was the
Critical finding in PR #58's review. Wave 0 never touched it, because `review` has no seeded
scenarios.

### Close the arm's provenance gap before the next wave

`results.yaml`'s `arm` block records extension **paths**, not versions or content digests. Two
runs with byte-identical `arm:` blocks can therefore have executed different extension code —
and that is not hypothetical: Wave 0's first arm ran pi-daddy 0.18.1 and the re-run ran 0.19.0,
with nothing in either record saying so. It was papered over by putting the version in
`--label`, which works exactly until someone forgets.

This is the same shape as the incident `harness_cli_version` exists to prevent: pi 0.80.x
wrapped a `--skill` prompt with the skill body, 0.83.0 switched to progressive disclosure, and
two waves of runs became indistinguishable from a naked-model baseline with nothing in the
artifacts to show it. One dependency further out, same failure. A content digest per declared
extension, recorded in the `arm` block, closes it.

## Open work, in the order I would do it

### 1. `principal-pi-skills` — 100 paid re-runs

Sister repo, on disk at `../principal-pi-skills` (HEAD `378627e` — it moved: PR #32 merged
the arm declaration and its delivery guard). Re-measured on merged `main`, free and offline:

```bash
node bin/skill-harness.js lint all --skills ../principal-pi-skills
# 7 skill(s), 101 finding(s), 32 note(s) (do not fail the gate)
```

**100 findings demand a paid `run`; exactly 1 wants a judge-only `grade`** (`plan/A2`, whose
rubric moved since the newest `kimi-k3` run); zero have a free remedy — no `regate`, no
`rescore`. This is **unchanged from the 0.9.0 measurement**, which is itself worth knowing: the
figure moved three times before that and has now held still across a release, so the earlier
advice to re-measure rather than plan against a written number stands, but the number is
currently stable.

Most of the 100 are `SKILL.md`-changed and scenario-set-drift staleness from edits in that repo,
not anything the harness did. Try `restamp` before assuming a wave is needed — it upgrades
records whose model-visible text provably has not moved. Then decide scope deliberately: which
skills, which models, how many reps. The whole 100 at `reps: 3` is a large bill.

Still unadopted there, both deferred on purpose and both still the right call: `assert.trace`
needs a real captured `.trace.jsonl` to verify tool names against (a gate that silently never
fires is worse than no gate), and `require_subagents` needs pi-mono's subagent extension
vendored into `.pi/extensions/` — a decision about carrying someone else's code, not a
mechanical step. Note that pi-daddy trajectory evidence is **also** unadopted there, which is
why 0.10.0's behaviour change invalidates no committed scorecard.

### 2. One real sandbox backend

The bounded follow-up named in `docs/ASSURANCE-WORKFLOWS.md`: add a single Linux backend
(container or bubblewrap) behind the existing seam, wire an explicit CLI flag, capture its
workspace diff, and test denied network / process / filesystem access on supported hosts. Until
it exists the seam is a fake and the docs must keep saying so.

### 3. Small and free: `pi_version` is only ever asserted by the paid script

`pi_version` is only ever an *input* in the suite. `execution-trace.ts:208` sets it from
`meta.piVersion`, and every test hands it a literal — `"0.83.0"` appears **26 times across 12
test files** (the previous handoff said seven places; it has grown, not shrunk). Nothing checks
the field is populated from a real pi's output; only the smoke script's step 2 does, which costs
money to reach. A ~10-line test over `buildExecutionTrace` would prove the field is wired,
leaving "the real pi reports something" as the only paid part.

### 4. Phase 2 distribution

Untouched, deliberately last, at the owner's call. See `docs/ROADMAP.md`.

## Things that will bite you

### Lessons this project keeps re-learning

- **A positive-only check is not a check.** `scripts/check-pi-daddy-contract.mjs` digested six
  artifacts, normalized four fixtures, printed all green and exited 0 — with the closed-schema
  gate *deleted from the built adapter*. It only ever fed conforming records through, so it could
  not tell "the gate ran" from "the gate is gone". It now carries a negative control. Any check
  that only asserts success is measuring less than it claims.
- **Mutation-check any test you write for this repo.** Two of the fixes in the 0.10.0 review
  round shipped with *no* test at all until a mutation pass caught it, and the `pi-json.ts`
  prefilter test once passed against a deliberately broken source. A test that cannot fail is
  worse than no test, and it always looks right.
- **A claim about another system's format is worth what you checked it against.** The
  never-published `release/0.9.1` branch (`731fb9f`, deleted) claimed the adapter "accepts the
  four `ledgerVersion: 2` variants emitted by the pinned builders". It did not — `check_receipt`
  was rejected outright. Nobody had run the producer's fixtures.

### The pinned pi-daddy contract

- **`packages/adapters/src/pi-daddy-ledger-v2.ts` is generated — never hand-edit it.** Re-pin
  with `node scripts/vendor-pi-daddy-contract.mjs <checkout> <commit> [pr]`, and update
  `EXPECTED_PRODUCER_COMMIT` in `packages/adapters/test/pi-daddy-contract.test.ts` in the same
  change, so the pin cannot move as a side effect.
- **A new schema-derived vocabulary goes in the `V2_RESTATED_VOCABULARIES` manifest**, not a
  loose `new Set([...])` the drift test cannot see. Equality-asserted things belong there;
  `V2_VOCABULARY_SUBSETS` is only for sets the harness deliberately narrows. Two enumerations
  hid outside the manifest for a whole review round, and one of their members was exercised by
  no test at all.
- **`npm run build` before `scripts/check-pi-daddy-contract.mjs`** — it reads `dist` and now
  refuses to report success against a build made from a different contract.
- **The pinned closed schema fires before the adapter's semantic checks**, so a malformed v2
  record's error comes from the contract layer (`closed contract violation — <path> …`), not the
  hand-written check that used to report it. If a test asserting an old message goes red, work
  out *which layer* rejected the record before changing behaviour — several of those checks are
  now redundant defence in depth and are meant to stay.

### Tooling and process

- **`gh pr edit` is broken on this repo.** It prefetches classic Projects and dies with a
  deprecation error, exit 1, **having written nothing**. Use
  `gh api -X PATCH repos/mojomanyana/skill-harness/pulls/<N> -F body=@file.md`, and confirm the
  write landed — the failure mode is a silent no-op.
- **`gh` needs an account switch** for PR writes: `gh auth switch -u mojomanyana`, then back to
  `mojo-cosmic`. It reverts mid-session, so re-run it before every write.
- **An agent working here *can* merge PRs.** This file used to say `gh pr merge` was refused by
  the permission classifier and the merge had to be handed to the human. That was wrong, or has
  stopped being true: `gh pr merge` succeeded first try on PRs #55 and #56 on 2026-08-21 under
  the `mojomanyana` account. Merging is still the owner's call to *authorize* — but once
  authorized, do it rather than handing back a green PR and calling that finished.
- **`npm view <pkg> version` can report the OLD version right after a publish.** Read-after-write
  lag; it said `0.9.0` for the meta package seconds after `+ skill-harness@0.10.0`. This is why
  the runbook says to verify by installing into an empty project, not by reading the registry
  back.
- **The pi-extension bundle is committed.** `packages/pi-extension/dist/index.js` is an esbuild
  artifact under version control. Run `npm run build:ext` and commit it whenever bundled
  core/cli source changes; `bundle.test.ts` fails if it goes stale. Never add pi-extension to an
  emitting `tsc -b` — that clobbers the bundle. Note the ordering trap: the bundle test compares
  against a rebuild from `dist`, so it can pass *before* you `npm run build` and fail after.
- **CI has no `pi` on PATH.** A test that shells out to the adapter passes locally and fails
  there. Run the suite against a PATH without `pi` before trusting it.
- **`pi -p` hangs** unless stdin is `/dev/null`. Silent timeout, looks like a slow model.
  `runPiJson` passes `stdio: ["ignore", …]` for exactly this reason, and there is a test that
  fails if someone changes it.
- **`packages/core/src/trace-gates.ts` contains literal NUL bytes** (its glob sentinels), so
  plain `grep` reports **no matches** on that file and exits 1. Use `grep -a`. It silently
  defeats grep-based auditing of the file most trace-gate questions land in.

### Cost and measurement

- **Digest facets decide cost.** `stimulus:` → `run` (spends), `rubric:` → `grade`, `policy:` →
  `rescore` (free), `gates:` → `regate` (free, *except* a rep whose gate flips fail→pass must be
  judged — it prints the count). `covers` is in **no** digest. Before any spec-wide edit, measure
  `lint` before and after on the same tree.
- **`grade` CARRIES trace gates; only `run` and `regate` compute them.** `regrade.ts` says so and
  `field-roundtrip.test.ts` pins it. Worth knowing before you put an objective assertion after a
  `grade` call: doing exactly that in the smoke script cost two judge calls to re-confirm a
  verdict already on disk, and printed "survived the re-grade" about something nothing had
  re-graded.
- **The smoke gate reports one permanent stale finding** and steps over it by design. The retired
  `deepseek-v4-flash` tag dir can never receive another run, and `lint` checks the newest run of
  every tag, so that finding cannot be cleared by running anything — only by deleting the
  gitignored dir. Staleness does not block the paid run; a `fixture` finding still does.
- **The smoke spec's `task_contains: ["auth"]` is a case-sensitive substring** on text the *model*
  writes, and the turn opens "Authentication", which does not contain `auth`. It has passed on
  luck twice. If the gate reddens there, read it as the model, not the harness — the spec comment
  says so.
- **`docs/posts/` drafts no longer claim version numbers.** Five of them used to announce
  0.7.0–0.11.0 for features that shipped in one release. Don't reintroduce per-post versions.

## What this file used to say, and why it changed

**Revised 2026-08-23.** The previous version described the Codex + arms work as a local,
unpushed branch with no PR and 1,330 tests — all three were true when written and none is
now. Both PRs merged on 2026-08-22, the PR reviews added 11 findings in the tool and a
critical one in the corpus, and the suite is 1,368 across 85 files. That section is
rewritten rather than appended to, because a handoff that describes a branch state which no
longer exists costs the next session a wrong mental model before it reads anything else.
The 0.10.0 material above it is unchanged and still accurate.

The previous version was written at the close of the 0.9.0 session and revised mid-way through
the 0.10.0 one, which left it describing a repo state that no longer existed:

- It headlined `0.9.0` as the current release and reported 1,245 tests, then carried a
  mid-session note that two merges were sitting on `main` unreleased. Both are now released as
  0.10.0.
- It reproduced the 0.9.0 and PR #53 release narratives in full. `PUBLISHING.md` now owns those,
  including a section on why `release/0.9.1` was superseded, so they are cut rather than
  duplicated — this file is for what is half-finished, not for what shipped.
- It stated flatly that **an agent here cannot merge PRs**. That was wrong, and it would have
  cost the next session a pointless hand-off. Corrected above, with the evidence.
- Its `pi_version` item said `"0.83.0"` was hardcoded in "seven places". It is 26 occurrences
  across 12 test files.
- Its sister-repo figure was carried from the 0.9.0 binary. Re-measured on 0.10.0: unchanged at
  101 findings / 32 notes, and the one non-`run` remedy is now named.
