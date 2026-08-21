# Next session — start here

*Written 2026-08-20, at the close of the 0.9.0 release session. Read this before
`docs/ROADMAP.md`: the roadmap says where the project is going, this says what is
half-finished and what will bite you.*

## Where things stand

`skill-harness@0.9.0` is **published, merged and tagged** — `v0.9.0` on `96b9554`,
`latest` moved to the same commit, all four packages on the registry and verified by
installing into an empty project rather than by trusting the publish output. CI is
green. 1,245 tests across 78 files. Working tree clean, no open PRs.

**0.9.0 shipped workflow-level assurance.** `assert.trajectory` gates over normalized
workflow events (`require`, `forbid`, `ordered`, `correlate`, `approvals`,
`freshness`, `coverage`, `forbid_after`, `unique`), where a missing correlation field
is ERROR and never a pass. `compare` runs a paired reference/candidate setup and
*refuses* any run whose two sides differ in spec bytes, fixtures, extensions, system
prompt, model, mode, judge or repetition plan — preflighted before the first subject
call, so an unfair comparison costs nothing. `mutation-test` proves the new gate
classes can turn red, 15/15, offline and free. `critical:` scenarios now demand every
clean repetition. Cost/latency fields are recorded, and three JSON schemas are a
public export subpath (`@skill-harness/core/schemas/*.json`).

**Unpublished pi-daddy adapter repair:** branch `fix/pi-daddy-v2-ledger` starts at
`a0c6d96959e7e373381ddbc8b7113ffa8b66e069` and is pinned to pi-daddy 0.18.0 commit
`dde8eeb5632113d4a54705e16dc22ce70740fd4f`. The adapter now recognizes public
`ledgerVersion: 2` records before the unversioned fallback and normalizes all four 0.18 variants:
`capability_decision`, `workspace_lease`, `child_lifecycle`, and `check_receipt`. Unversioned 0.17
`GrantRecord` remains supported. The old `schema_version` / `record_type` fixture was hypothetical,
not pi-daddy evidence, and has been removed. Remaining compatibility exception: specs still select
this adapter with the historical name `pi-daddy-v1`; changing that public selector would require a
migration. V2 events without `correlation.run_id` and `correlation.task_id` fail closed because the
harness cannot join them to workflow evidence. Correlation now enforces pi-daddy's pinned whitelist and
size/type bounds, non-authoritative workspace labels are not promoted, malformed identity/executor values
are rejected, absent facts stay absent, blocked decisions emit no grants, nested native attributes are
sanitized, capability/approval/refusal relations fail closed, and only the matching append-after-release
receipt inversion is accepted within each run/task/workspace/child causal stream. Free validation on the
branch: build/typecheck green, 1,269 tests across 78 files,
all three dogfood lint roots at 0 findings, and mutation-test 15/15.

**What is deliberately not claimed.** There is **no OS sandbox** — core exports a
`SandboxBackend`/`withSandbox` seam with fake-backed tests, and temp fixture
directories and git workspaces are *not* containment. The principal digest chain is an
integrity check, not attestation: it detects torn or edited saved logs, but an
unsandboxed subject that can rewrite and rehash a whole ledger can fabricate one. Any
report must keep saying containment is unavailable until a real backend exists.

**The pre-publish smoke gate works now, and did not before.** `scripts/smoke-real-pi.sh`
had four defects, each of which made it report something other than what it measured:
a retired model alias, run-dir selection by model tag (so it could assert against a
*previous* run), never reaching its own assertions (step 1 exited non-zero on any
non-shipping scorecard under `set -e`), and gating the objective *after* the judge
spend though `grade` only carries that verdict. It has now reached all four stages
once, exit 0, on pi 0.84.2 — for 2242/457 subject tokens (`cost_usd 0.00049`) and 3
judge calls, matching its own disclosure. Treat that single run as what it says it is:
one draw on a cheap model, not a measurement.

## Open work, in the order I would do it

### 1. `principal-pi-skills` — 100 paid re-runs, re-measured today

Sister repo, on disk at `../principal-pi-skills` (HEAD `2c53559`). Measured with the
0.9.0 binary, free and offline:

```bash
node bin/skill-harness.js lint all --skills ../principal-pi-skills
# 7 skill(s), 101 finding(s), 32 note(s)
```

**100 findings demand a paid `run`; 1 wants a `re-grade`; zero have a free remedy** —
no `regate`, no `rescore`. The previous handoff said 56 re-runs measured 2026-08-09,
so this has nearly doubled; the number has now moved three times, which is the
argument for re-measuring rather than planning against any figure written here.

This needs a deliberate, budgeted wave, not an afternoon. Decide the scope first —
which skills, which models, how many reps — because the whole 100 at `reps: 3` is a
large bill and most of it is staleness from skill edits rather than anything the
harness changed.

Still unadopted there, both deferred on purpose and both still the right call:
`assert.trace` needs a real captured `.trace.jsonl` to verify tool names against (a
gate that silently never fires is worse than no gate), and `require_subagents` needs
pi-mono's subagent extension vendored into `.pi/extensions/` — a decision about
carrying someone else's code, not a mechanical step.

### 2. One real sandbox backend

The bounded follow-up named in `docs/ASSURANCE-WORKFLOWS.md`: add a single Linux
backend (container or bubblewrap) behind the existing seam, wire an explicit CLI flag,
capture its workspace diff, and test denied network / process / filesystem access on
supported hosts. Until it exists the seam is a fake and the docs must keep saying so.

### 3. Small and free: `pi_version` is only ever asserted by the paid script

`pi_version` is only ever an *input* in the suite — passed in as meta and hardcoded
(`"0.83.0"` in seven places) — so nothing checks it is populated from a real pi's
output. Only the smoke script's step 2 does, which costs money to reach. A ~10-line
test over `buildExecutionTrace` would prove the field is wired, leaving "the real pi
reports something" as the only paid part.

### 4. Phase 2 distribution

Untouched, deliberately last, at the owner's call. See `docs/ROADMAP.md`.

## Things that will bite you

- **`grade` CARRIES trace gates; only `run` and `regate` compute them.** `regrade.ts`
  says so and `field-roundtrip.test.ts` pins it. This is worth knowing before you put
  an objective assertion after a `grade` call: doing exactly that in the smoke script
  cost two judge calls to re-confirm a verdict already on disk, and printed
  "survived the re-grade" about something nothing had re-graded.
- **`packages/core/src/trace-gates.ts` contains literal NUL bytes** (its glob
  sentinels), so plain `grep` reports **no matches** on that file and exits 1. Use
  `grep -a`. It silently defeats grep-based auditing of the file most trace-gate
  questions land in.
- **`gh pr edit` is broken on this repo.** It prefetches classic Projects and dies with
  a deprecation error, exit 1, **having written nothing**. Use
  `gh api -X PATCH repos/mojomanyana/skill-harness/pulls/<N> -F body=@file.md`, and
  confirm the write landed — the failure mode is a silent no-op.
- **`gh` needs an account switch** for PR writes: `gh auth switch -u mojomanyana`, then
  back to `mojo-cosmic`. It reverts mid-session, so re-run it before every write.
- **An agent working here cannot merge PRs** — `gh pr merge` is refused by the
  permission classifier. Open the PR, get it green, and hand the merge to the human;
  do not try to route around it.
- **The pi-extension bundle is committed.** `packages/pi-extension/dist/index.js` is an
  esbuild artifact under version control. Run `npm run build:ext` and commit it
  whenever bundled core/cli source changes; `bundle.test.ts` fails if it goes stale.
  Never add pi-extension to an emitting `tsc -b` — that clobbers the bundle.
- **`pi -p` hangs** unless stdin is `/dev/null`. Silent timeout, looks like a slow
  model. `runPiJson` passes `stdio: ["ignore", …]` for exactly this reason, and there
  is now a test that fails if someone changes it.
- **CI has no `pi` on PATH.** A test that shells out to the adapter passes locally and
  fails there. Run the suite against a PATH without `pi` before trusting it.
- **Digest facets decide cost.** `stimulus:` → `run` (spends), `rubric:` → `grade`,
  `policy:` → `rescore` (free), `gates:` → `regate` (free, *except* a rep whose gate
  flips fail→pass must be judged — it prints the count). `covers` is in **no** digest.
  Before any spec-wide edit, measure `lint` before and after on the same tree.
- **The smoke gate reports one permanent stale finding** and steps over it by design.
  The retired `deepseek-v4-flash` tag dir can never receive another run, and `lint`
  checks the newest run of every tag, so that finding cannot be cleared by running
  anything — only by deleting the gitignored dir. Staleness does not block the paid
  run; a `fixture` finding still does.
- **The smoke spec's `task_contains: ["auth"]` is a case-sensitive substring** on text
  the *model* writes, and the turn opens "Authentication", which does not contain
  `auth`. It has passed on luck twice. If the gate reddens there, read it as the model,
  not the harness — the spec comment says so.
- **Mutation-check any test you write for this repo.** Writing the failure-path tests
  for `pi-json.ts`, the prefilter test passed against a deliberately broken source: the
  payload put the event name in single quotes, which `JSON.stringify` escapes, so
  neither the real filter nor the buggy one matched it. A test that cannot fail is
  worse than no test, and this one looked right.
- **`docs/posts/` drafts no longer claim version numbers.** Five of them used to
  announce 0.7.0–0.11.0 for features that shipped in one release. Don't reintroduce
  per-post versions.

## What this file used to say, and why it changed

The previous version was written at the close of the 0.7.0 session and had gone stale
in ways that would mislead a reader rather than merely date it:

- It headlined 0.7.0 as the current release and reported 1,123 tests.
- It described the risk-adaptive workflow implementation as "working tree, not
  published". That work is on `main` and shipped in 0.9.0 — it landed under a commit
  message reading only `tmp-work`, so `PUBLISHING.md`'s 0.9.0 section is where its
  notes actually live.
- Its open-work item #1 was "`runStructured` has no automated test — the largest
  coverage gap". Half of it was already closed by the time it was written
  (`pi-structured.test.ts` mocks `node:child_process` and covers argv, per-turn session
  flags, the no-terminal-event throw and transcript parity with `run()`), and the
  failure paths were closed in 0.9.0 (`pi-json.test.ts`). Its specific complaint that
  the contract test re-declares `SKIPPED_TYPE_RE` as a copy was also already fixed —
  it imports the real regex.
- Its sister-repo figure (56 re-runs) was three measurements out of date.
