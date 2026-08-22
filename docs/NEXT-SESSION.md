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

## This branch: `feat/codex-arms-axis` (local, unpushed)

Everything above is `main`/0.10.0 and is unaffected by what follows. This is a second,
unmerged body of work sitting on top of it — a full task-13 release-hygiene pass ran
against it today (build, typecheck, full suite, suite with `pi` off `PATH`, all green:
**1,330 tests across 84 files**, up from 1,289/79). Nothing here is on `main`. Nothing
has been pushed. No PR exists — pushing and opening one is the owner's call, not a
session's to make unilaterally, and this session was explicitly told not to.

**Shipped here:** provider-failure classification as infrastructure `ERROR` on both run
paths; `run --structured` so subject tokens/cost/wall-time are actually recorded (before
this, `--structured`'s absence meant that data was silently never written); the pi-daddy
**arms axis** — `<skills-root>/tests/arms.yaml`, a `--arm` flag, the arm name carried in
the run-dir tag, definition seeding, three refusals for malformed arm input, and a
per-run ledger — plus `docs/CODEX-ARMS-RUNBOOK.md` describing how to spend Wave 0. The
corpus-side half, `arms.yaml` itself, is committed in `../principal-pi-skills` on local
branch `feat/measurement-arms` (`c55784b`) — also unpushed, also the owner's call.

**Wave 0 is blocked on ONE thing:** the `openai-codex` OAuth token in
`~/.pi/agent/auth.json` is invalidated. Re-auth is required before any Wave 0 command can
run for real. Do not trust `pi auth check` as the gate — it reports
`{"status":"ready",...}` against that same dead token. The runbook's one-call probe is
the actual gate; use it.

**Still unverified and load-bearing:** whether pi binds a thinking level from a
`:suffix` on `--model` (e.g. `openai-codex:gpt-5.6-sol:medium`). The spike meant to answer
this died on the dead token above, so it is genuinely open, not just untested. If it does
not bind, the fallback is an optional third segment in `parseModelRef` plus a
`--thinking` flag threaded through `pi.ts`'s `common` array — sized, not designed, so
budget real time for it.

**The measurement-integrity invariant that held throughout, and must keep holding:**

```bash
node bin/skill-harness.js lint all --skills ../principal-pi-skills
# 7 skill(s), 101 finding(s), 32 note(s)
```

Measured four times across this work, including after the corpus's `arms.yaml` landed.
Movement on this number means an arm leaked into a digest — treat any change as a bug in
this work, not as corpus drift, until proven otherwise.

**The finding this work deliberately did NOT fix**, from the spec's §10: `force` mode
appends the whole `SKILL.md`, frontmatter included, to the system prompt — but
`sources.ts`'s `CAPABILITY_KEYS` excludes `allowed-tools`/`tools` from the model-visible
digest on the stated grounds that they are "never rendered into the model's context".
That grounds is false in force mode, for all 7 skills, all 6 agent files, and 59
committed force runs. It is its own issue with its own fix and its own write-up. It was
not fixed here because changing force's delivery would move the ground the Wave 0 numbers
stand on, mid-campaign.

**A gap a future task must close:** `vitest` transpiles through esbuild and never
type-checks, so `npm run typecheck` is the *only* guard against a genuine type error in
this repo — several tasks in this campaign added code that had never been type-checked
until task 13's build-then-typecheck pass ran. The deferred minors immediately below were
accepted rather than fixed for the same reason release hygiene exists: to surface them
for a human, not to quietly wave them through.

**Deferred minors, verbatim, for triage before merge:**

- `providerFailureFromJsonLine` returns on the first matching diagnostic; multiple
  diagnostics in one array is untested.
- The transcript forgery guard is verified by one case, not exhaustively.
- Task 5's four refusal tests (extension-missing, duplicate-name, reserved-name,
  bad-name-shape) were never re-mutation-tested after Task 6 restructured the function
  around them — inspected only.
- Task 8's fix report overstated its regression coverage, naming `regate`/`lint`/
  `sources-split` as covering `runSeeded`'s request path when none of them call it; real
  coverage is `p1-multipliers`, `force-scoring`, and `seeded.test.ts`.
- The runbook's two post-run greps (`metrics:` block, ledger `wc -l`) are corroborated
  against source, not against a live run directory — spot-check them on the first real
  run.

**A hazard worth recording:** across this plan, seven specified tests turned out to be
unable to fail — fixtures that never contained the string they claimed to reject, one
that tripped an unrelated pre-existing `ERROR` path instead of the one under test, one
built on unverified string surgery, one whose mutation was unreachable because the
fixture carried no diagnostics to begin with, vacuous post-run filesystem assertions
defeated by workspace teardown, and a byte-identical clone that `stability` could never
flag as anything but identical. Every one of the seven was caught by the mandatory
mutation step; none was caught by reading the passing suite. Keep that step
non-negotiable — this campaign is the evidence for why.

## Open work, in the order I would do it

### 1. `principal-pi-skills` — 100 paid re-runs

Sister repo, on disk at `../principal-pi-skills` (HEAD `2c53559`). Re-measured today with the
**0.10.0** binary, free and offline:

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
