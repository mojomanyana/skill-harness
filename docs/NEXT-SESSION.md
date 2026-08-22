# Next session — start here

*Written 2026-08-21 at the close of the 0.10.0 release session. Read this before
`docs/ROADMAP.md`: the roadmap says where the project is going, this says what is
half-finished and what will bite you. Release notes live in `PUBLISHING.md` — this file
deliberately does not restate them.*

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
