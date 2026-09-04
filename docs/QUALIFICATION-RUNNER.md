# qualification-runner-v1

`qualification-runner-v1` is the separately versioned, source-built execution and
accounting boundary for Principal Pi qualification packets. It does not replace the
ordinary `run → grade → review` loop. It owns one lower-level question: **was this
particular externally declared invocation launched at most once, under the declared
OAuth/environment policy, and what durable artifacts did it leave?**

No measurement or holdout is embedded here. Product, engine, producer, runner, arms,
private input, and measurement identity are external inputs.

A prospective configuration may select `qualification-judge-panel-policy-v1`. This does
not turn the runner into a rubric owner: it makes the judging methodology explicit and
reuses skill-harness's clean-vote collapse. Every saved subject artifact gets two initial
judge invocations; two matching clean votes confirm it; a clean 1–1 split authorizes one
third invocation; a clean 2-of-3 majority tie-breaks it. ERROR, ambiguous, and internally
contradictory answers are retained but are not votes. Fewer than two matching clean votes
is `inconclusive`, which blocks acceptance without being relabeled as behavioral FAIL.

## Coordinator lifecycle

Create a closed `qualification-config-v1` JSON file and one
`qualification-invocation-request-v1` file per intended call. The public schemas are:

- `schemas/qualification-config-v1.schema.json`
- `schemas/qualification-invocation-request-v1.schema.json`
- `schemas/qualification-judge-panel-result-v1.schema.json`
- `schemas/qualification-cell-result-v1.schema.json`

Each request pre-binds `continuation_authority_sha256` and an RFC3339
`continuation_authority_expires_at`. Generate at least 32 random bytes outside the
spool, put only their SHA-256 in the request, and retain the raw capability as a private
mode-0600 recovery file until the invocation is terminal. Then use the source-built
binary pinned by that configuration:

```bash
# Reservation only: validates pins/config/input and consumes zero calls.
node bin/skill-harness.js qualification prepare \
  --spool /absolute/spool \
  --config /absolute/qualification-config.json \
  --request /absolute/invocation-request.json \
  --expected-config-sha256 "$APPROVED_CONFIG_SHA256"  # required in production

# Auth metadata check, atomic accounting claim, and one detached supervisor.
node bin/skill-harness.js qualification start \
  --spool /absolute/spool --id invocation-id

# Read once, or wait for the SAME invocation. Neither operation launches anything.
node bin/skill-harness.js qualification status \
  --spool /absolute/spool --id invocation-id
node bin/skill-harness.js qualification poll \
  --spool /absolute/spool --id invocation-id --wait-ms 300000

# Validate canonical state, hash chains, terminal receipts, and artifact bytes.
node bin/skill-harness.js qualification validate --spool /absolute/spool

# Offline: collapse already-terminal judge member invocations and then aggregate reps.
node bin/skill-harness.js qualification panel --spool /absolute/spool \
  --panel-id scenario-arm-r0 --members judge-r0-1,judge-r0-2[,judge-r0-3]
node bin/skill-harness.js qualification cell --spool /absolute/spool \
  --cell-id scenario-arm

# Durable operator abort. Reason is a bounded identifier, never free-form secrets.
node bin/skill-harness.js qualification abort \
  --spool /absolute/spool --id invocation-id --reason operator-request
```

`start` launches a detached local supervisor and waits only for its durable claim.
The caller may exit while the supervisor continues until the configured deadline.
A controller timeout is not authority to restart it. `status` and `poll` always read
the same invocation. `panel`, `cell`, and `validate` launch no model or judge: they
reopen validated receipts/artifacts and write or verify canonical derived evidence.
A third panel member is valid only after the first two clean votes split. That gate runs
before OAuth readiness and before the atomic launch claim, so an unneeded tie-break consumes
zero calls. A two-member clean split is not publishable as a final immutable panel; record it
after the authorized third member terminates.

## State and crash behavior

Each invocation has one canonical lifecycle:

```text
prepared → launch-claimed → running → terminal
```

Terminal status is one of:

```text
completed · failed · timed-out · aborted · refused · invalid-artifact
```

The spool uses same-directory temporary files, file `fsync`, atomic rename/link, and
an atomic terminal-receipt directory. Lifecycle and accounting records are canonical
JSON with contiguous sequence numbers and SHA-256 chains. This detects accidental or
unreconciled deletion, insertion, reordering, duplication, and mutation. It is not a
signature and a malicious local owner can rewrite a record and its hashes.

The accounting event is the atomic launch claim. A crash after that claim remains a
consumed call. If the lifecycle write was interrupted, a later supervisor refuses to
continue without `start --continuation-authority-file <0600-one-use-file>`. The outer
request pre-commits a one-time capability digest and expiry. The CLI consumes and
removes the matching private file, sends the raw capability over a private inherited
descriptor, and records only its digest—never raw argv, environment, or spool text.
Arbitrary text, a mismatched invocation capability, reuse, and expiry fail closed. If
no immutable launch-attempt exists, that authority may finish the already-consumed
launch path. Once
a launch-attempt exists, it is never launched again: continuation terminates any still
matching recorded child occurrence and publishes a failed (or explicitly aborted)
terminal receipt from retained evidence. It never converts ambiguous output into
success. A stale `abort` is itself explicit reconciliation authority and terminalizes
the consumed invocation without replay. If the one-time continuation was already
consumed and its supervisor is later lost, abort remains the only reconciliation path.
A live external supervisor with no child is occurrence-terminated by abort before the
claim is terminalized; bounded Git subprocesses prevent pin checks from hanging forever.

Terminal receipt publication and lifecycle publication are separate atomic writes. If
a crash lands between them, `status`, `poll`, `abort`, `start`, or `validate` first
checks the receipt against accounting, launch, auth, occurrence, output, and artifact
bytes, then idempotently appends the missing lifecycle terminal event.

Production execution is Linux-only. Linux process receipts include PID, kernel boot ID,
and `/proc/<pid>/stat` start ticks. Timeout, abort, and descendant cleanup enumerate
process-group members and signal only still-matching recorded occurrences; they never
signal a bare reused numeric process-group ID. Test mode can exercise other platforms
but makes no production occurrence-safety claim there. stdout and stderr stream to
durable `.partial` files, are bounded by the arm's output limit, and remain at those
paths after every terminal status. Truncation is explicit. A terminal timeout/abort
cannot later be replaced by success.

Operational cleanup is coordinator-owned: first run `qualification validate`, retain
the canonical spool with the packet evidence, and remove only disposable inert/test
spools. Never delete a nonterminal production spool as a substitute for aborting it.

## Judge-panel configuration

The rule is data, not an implementation default. Select it together with OAuth-directory
policy v2, terminal receipt v3, and the panel accounting policy:

```json
{
  "oauth_directory_policy": "qualification-oauth-directory-policy-v2",
  "terminal_receipt_version": "qualification-terminal-receipt-v3",
  "judge_panel": {
    "schema_version": "qualification-judge-panel-policy-v1",
    "initial_judge_calls": 2,
    "agreement": "two-matching-clean-votes",
    "split": "one-conditional-tie-break",
    "max_judge_calls": 3,
    "error": "record-as-non-vote",
    "unresolved": "inconclusive-blocks-acceptance",
    "behavioral_failure": "record-and-continue-read-only-board",
    "integrity_failure": "halt",
    "wave_a_call_budget": { "artifacts": 54, "minimum": 108, "maximum": 162 },
    "complete_program_call_budget": { "artifacts": 642, "minimum": 1284, "maximum": 1926 }
  },
  "board": {
    "schema_version": "qualification-board-v1",
    "read_only": true,
    "cells": [{
      "id": "scenario-arm",
      "scenario_id": "scenario",
      "measurement_identity_sha256": "<64 hex>",
      "scenario_version": "1",
      "stimulus_sha256": "<64 hex>",
      "rubric_sha256": "<64 hex>",
      "subject_input_sha256": "<64 hex>",
      "subject_arm": "subject-arm",
      "judge_arms": ["judge-arm", "judge-arm", "judge-arm"],
      "panels": [{ "id": "scenario-arm-r0", "repetition": 0 }],
      "critical": false,
      "pass_threshold": 1
    }]
  },
  "accounting": {
    "wave_a": { "subject": 54, "judge": 162 },
    "complete_program": { "subject": 642, "judge": 1926 },
    "ceilings": { "subject": 700, "judge": 2100 },
    "initial": { "subject": 0, "judge": 0 }
  }
}
```

Omission preserves historical single-draw configuration and record bytes. The externally
approved board binds exact cell IDs, measurement/scenario/stimulus/rubric/subject-input
identity, subject arm, each judge ordinal's arm, panel/repetition membership, Criticality,
and thresholds; derived commands do not accept caller-authored replacements. A panel-enabled
judge request must additionally bind `panel.id`, `member_ordinal`,
`subject_invocation_id`, and `subject_artifact_sha256`.

## Exactly-once call accounting

The historical single-draw v1 policy is:

| Scope | Subject | Judge |
|---|---:|---:|
| Wave A target | 54 | 54 |
| Complete-program target | 642 | 642 |
| Hard ceiling | 700 | 700 |
| Initial post-fix count | 0 | 0 |

A configuration selecting `qualification-judge-panel-policy-v1` instead records the
maximum authorized call budget: Wave A subject 54 / judge 162, complete program subject
642 / judge 1926, hard ceilings subject 700 / judge 2100. Its panel policy records the
minimum too: 108 judge calls for 54 Wave A artifacts and 1284 for 642 complete-program
artifacts. The exact realized count is the accounting ledger's event count: 2 per artifact,
plus exactly 1 for each clean initial split. A range is necessary because the third call is
conditional; treating the maximum as calls already consumed would be as false as omitting
those calls from the ceiling.

Rules:

1. `prepare` is a reservation and does not count.
2. The atomic `launch-claimed` accounting event counts exactly once.
3. Spawn failure, refusal, timeout, truncation, invalid output, adapter failure, and
   artifact-validation failure stay counted.
4. No qualification-runner code retries an invocation automatically.
5. Duplicate invocation IDs and duplicate accounting events fail closed.
6. The global spool lock serializes the pre-claim ceiling check and append, so
   concurrent starts cannot cross 700.
7. `subject` and `judge` roles are always measurement. `holdout-author`,
   `holdout-reviewer`, `calibration`, and `canary` are always non-measurement. Every
   role retains its own count; the selected subject/judge arm determines the relevant
   call ceiling.
8. `counts_as_measurement` is explicit but not requester-discretionary: request,
   invocation, and accounting validation all enforce that fixed role matrix.
9. A panel is not one invocation. Every member has a distinct invocation ID, OAuth
   readiness evidence, launch claim, accounting event, process occurrence, artifact, and
   terminal receipt. Panel collapse launches nothing and cannot erase a consumed claim.
10. Panel judge requests bind panel ID, ordinal, subject invocation ID, and validated
    subject-artifact SHA-256. `qualification-invocation-v4` carries that binding under
    terminal-receipt-v3's immutable invocation digest.

The ledger proves consistency relative to the trusted local files it reads. It does
not prove that a local owner did not replace the entire spool.

## Behavioral failure versus collection halt

The configured policy separates two decisions. As in ordinary skill-harness repetition
aggregation, a declared threshold cannot weaken Critical semantics: every settled Critical
repetition must pass. A settled panel FAIL, including a Critical FAIL, sets cell acceptance
to `fail` and `critical_failure: true` where applicable, but a
predetermined read-only behavioral board records `collection: continue`. Execution order
therefore cannot decide how much of the board exists. An unresolved panel records
`acceptance: inconclusive`; it is not a behavioral FAIL. Authorization, identity,
authentication, accounting-ceiling, corruption, receipt/artifact-integrity, or launch
failures remain operational failures and may halt collection. “Wave fails acceptance” and
“runner must stop collecting valid independent evidence” are deliberately different axes.

Final validation compares the complete persisted panel/cell set with the externally
approved board declaration. Missing, extra, duplicated, or wrong-repetition evidence fails
closed; a caller cannot duplicate a passing panel, omit a failing repetition, or weaken a
Critical threshold through `qualification cell` flags.

Each persisted cell has a first-class `disagreement` block:

```json
{
  "judge_calls": 7,
  "clean_votes": 7,
  "split_artifacts": 1,
  "artifacts_with_two_clean_initial_votes": 3,
  "unresolved_artifacts": 0,
  "judge_split_rate": 0.3333333333333333
}
```

Each artifact panel also records `initial_split` and `minority_rate` (`0` when unanimous,
`1/3` for a clean 2–1 panel). `qualification validate` recomputes derived files from fully
validated member receipts and artifact bytes; a hand-edited aggregate is rejected.

## OAuth-only execution boundary

A production arm is accepted only with:

```text
provider       openai-codex (exact, case-sensitive)
authentication chatgpt-oauth
fallback       false
metered_override false
```

Direct `openai`, provider aliases, API-key auth, unknown configuration fields,
provider/model flags hidden in arm arguments, duplicate arms, and unpinned repository
or executable identities are rejected before launch.

OAuth-directory inventory is prospectively versioned. A historical
`qualification-config-v1` with no `oauth_directory_policy` retains the original
`qualification-oauth-directory-policy-v1` bytes, digest, invocation, auth-evidence,
and terminal-receipt semantics: `models-store.json` remains undeclared there. A new
configuration selects this repair explicitly at the top level:

```json
"oauth_directory_policy": "qualification-oauth-directory-policy-v2"
```

Unknown values fail closed. The field participates in the canonical configuration
digest; v2 prepared records use `qualification-invocation-v2` and put the policy in
their self-digest. A spool already bound to an omitted-policy configuration cannot be
rebound: create and externally approve a superseding configuration, use a new spool,
and prepare new invocation IDs. Historical records are never upgraded or interpreted
as v2 merely because newer runner code reads them.

Before accounting, the runner executes Pi's supported metadata command without
`--credentials`:

```text
pi auth check --provider openai-codex --model <exact-model> --json
```

It requires `status: ready`, the exact provider, and `authType: oauth`.

Policy v2 closes the direct-entry inventory to exactly these basenames:

| Entry | Status |
|---|---|
| `auth.json` | required; exactly one `openai-codex` OAuth credential |
| `models.json` | optional; if present, an empty object (no routing/credential override) |
| `models-store.json` | optional before first Pi launch; allowed Pi-generated runtime state afterward |

Every present allowed entry is no-follow `lstat`ed and then opened with `O_NOFOLLOW`
against the opened directory occurrence. It must be a regular non-symlink file, owned
by the effective qualification UID, exact mode `0600`, and have one hard link where
the platform reports link counts. The basename is runner-owned and the resolved file
must be a direct child of the canonical bound directory—no traversal, path alias, or
alternate spelling. The directory is a real non-symlink directory at its canonical
absolute path, owned by the effective UID, exact mode `0700`. On Linux POSIX-ACL
filesystems the group mode class is the ACL mask, so `0700` also excludes effective
non-owner ACL access. Rich filesystem ACL models not reflected by `stat` mode are not
enumerated; run on the documented Linux/local-filesystem boundary and treat a richer
ACL filesystem as outside this claim.

`models-store.json` is metadata-only. The runner does **not** read, parse, copy,
relocate, rewrite, delete, or content-hash it. Each validation records a fixed
three-entry canonical inventory with basename, present/absent state, file type,
UID/GID, mode, device/inode, link count, size, modification/change nanoseconds, and
validation timestamp (nullable only where unsupported). The points are before OAuth
readiness, after readiness, under the launch lock immediately before the accounting
claim, again at final pre-spawn validation, and after child termination before any
artifact can be accepted. The next invocation starts with the same closed validation,
so a valid retained runtime-state entry is accepted. `qualification-auth-evidence-v2`
records the readiness pair; immutable checkpoint records bind claim/prelaunch; and
`qualification-terminal-receipt-v2` records the policy and all five inventories.

Auth and optional `models.json` occurrences remain stable from readiness through
launch. An authorized Pi auth subprocess or model child may create or atomically
replace `models-store.json`; the next checkpoint binds the resulting occurrence, and
its inode is deliberately not required to survive that authorized execution. An
unexpected/invalid terminal entry makes the output artifact ineligible. The consumed
accounting claim remains exactly once and the invocation is not retried.

The validator opens the directory and direct children by occurrence and rechecks names
and metadata before closing them, but userspace validation is not an OS filesystem
sandbox. There is an unavoidable interval between the final check and `spawn`, and an
authorized child can mutate its user-owned directory while it runs. Final validation
makes that mutation visible and fail-closed; it does not provide continuous kernel
containment. An adversarial same-user mutation after the terminal check remains part of
the malicious-local-owner/non-containment non-claim.

The runner deliberately does not copy token bytes into the retained spool. Use a
dedicated OAuth-only `PI_CODING_AGENT_DIR` when a normal developer profile also holds
API keys. Persisted evidence contains classifications, executable digest, filesystem
occurrence metadata, environment **names**, and a random launch-capability digest
only—never token/key bytes or credential hashes. The raw launch capability travels to
the detached supervisor over the same private descriptor boundary and binds the exact
winning sanitized environment to the evidence read under the claim lock.
The auth response may omit model identity; evidence therefore records
`requested_model` with `model_identity_observed: false` (and rejects a contradictory
model if one is returned). Readiness is explicitly not model readiness or successful
model execution; the completed JSONL artifact must separately attest execution.

The child environment starts empty and copies only arm-declared names. API-key,
provider, base-URL, endpoint, organization/project, proxy, cloud-routing, dynamic
loader, and metered-override variables are prohibited from the allowlist. The policy
can either refuse a dirty parent or remove conflicting names and record which names
were removed. Values are never persisted. The supervisor revalidates the already
sanitized environment before spawning the child.

Pi is invoked with runner-owned exact `--provider`, `--model`, `--mode json`,
`--print`, `--no-session`, `--no-context-files`, `--no-extensions`, and `--no-skills`
arguments. Extensions, skills, and system-prompt files are separate arm `resources`
with absolute paths and SHA-256 pins, rechecked at prepare, auth preflight, and launch.
Raw arm arguments are positional-only: every option-looking argument (including
attached short forms such as `-e/path`) is rejected. They cannot add an unpinned
resource or set provider, model, thinking, mode, session, API key, metered override,
or fallback.

## Post-run provider/model attestation

The runner treats Pi JSONL `message_end.message` as the authoritative completed
identity. Completion requires at least one assistant message and requires every
reported provider/model pair to equal the requested pair. Missing identity,
provider/model substitution, explicit provider/model fallback events, malformed JSONL,
or output truncation produces `invalid-artifact`. A subscription refusal remains
`refused`; it never becomes behavioral evidence. The receipt distinguishes
`provider_model_identity_observed` from `successful_execution`, so a refusal can
preserve exact identity while successful execution remains false. Authentication
readiness, identity observation, and execution success are separate facts.

The terminal receipt binds requested and observed identities, exact attempt count,
process identities, deadline/effective timeout, exit/signal, output byte counts and
digests, artifact path/type/size/digest, authentication-evidence digest, and accounting
event digest. `qualification-terminal-receipt-v3` is selected prospectively by an
explicit configuration field and additionally binds the exact governed
`application/json` invocation-input bytes. Its prepared record, input launch claim,
launch attempt, child occurrence, and terminal receipt carry one closed
`qualification-invocation-input-binding-v1` byte count and SHA-256. The runner opens
the private single-link input without following symlinks immediately before accounting
and again immediately before child spawn. Its v3 terminal directory also carries a
closed byte identity computed from the exact canonical durable receipt bytes. Omission
retains historical v1/v2 behavior; no historical invocation or receipt is upgraded.
These checks bind bytes to the governed launch and do not claim that the child
semantically obeyed them.

`qualification validate` reopens regular non-symlink files, requires the
artifact to equal retained stdout, reruns provider/model/fallback/refusal attestation,
and checks that those semantics agree with terminal status and receipt flags—not only
that the bytes match their digest.

## External arms and source-built pins

The externally approved configuration (and its recorded SHA-256) is the authority for
the engine/runner revision. The runner cannot hardcode the Git commit that will contain
itself without a circular self-reference; instead it requires every identity field,
materializes and rechecks those bytes, requires its externally approved SHA-256 on
production `prepare`, and binds the whole closed configuration into each invocation. A qualification consumer must approve the final exact-head handoff
(commit, tree, four source-built package digests, and runner executable digest) before
`prepare`; accepting an arbitrary caller-authored configuration is outside this local
runner's authorization claim. Product and producer pins are additionally fixed in v1
because those upstream identities were known before this runner revision was built.

Configuration binds:

- the explicit v2 OAuth-directory policy identity (or historical omission for v1);
- principal-pi-skills repository, clean checkout path, commit, tree, package path,
  digest and bytes;
- skill-harness repository, clean checkout path, commit, tree, and paths/digests for
  all four public source-built packages;
- pi-daddy repository, clean checkout path, commit, tree, version, ledger version,
  and production v3 schema digest;
- qualification-runner version and executable path/digest;
- subject/judge arm kind, exact provider/model/auth mode;
- executable path/digest, fixed arguments, allowed environment names;
- timeout, output limit, artifact policy, call targets and ceilings.

Production `prepare` resolves each checkout's origin/HEAD/tree/cleanliness, hashes
package/schema bytes, and verifies runner/arm executable and resource bytes before it
publishes prepared state. The full repository/package/schema pin set is checked again
at auth and after the consumed claim immediately before spawn; executable/resource,
working-directory, and filesystem occurrence identities are also rebound there.
Production execution additionally verifies that
the running CLI is the configured source-built runner executable. The inert example under
`examples/qualification-runner-v1/` generates a valid `mode: test` configuration with
fake repositories/models and a non-measurement `calibration` role. It is not a packet
or a measurement identity.

The public JSON Schemas and runtime parsers share positive/negative CI fixtures. The
schemas enforce closed shape, portable absolute paths, mode/provider/model/auth
constraints, known positional placeholders, exact duplicate objects, and the
role/measurement matrix. Cross-object joins (selected arm ID/kind), duplicate IDs or
kind/path tuples whose other fields differ, sensitive environment-name classification,
fixed production pin equality, and materialized filesystem/Git identity remain runtime
checks and are documented/tested as that explicit semantic boundary.

## pi-daddy ledger v3

`pi-daddy-ledger-v3` is a separate event-source selector. It accepts only explicit
`ledgerVersion: 3` records from the pinned production contract and preserves
`executionId`, explicit nullable `parentExecutionId`, `taskFromExecutionId`, and
`workflow_fact.factId`. Existing `pi-daddy-v1` remains the historical selector for
unversioned 0.17 and frozen ledger-v2 records.

The v3 normalizer retains supplied run/task/workspace/context joins, trusted and
correlation digests, measured receipt tree, event/change/authority sequences, check
receipt identity, lifecycle deadlines, and refusal structure. A refused spawn emits
no capability grants. The v3 schema, positive fixtures, and refusal source are
byte-vendored from pi-daddy Wave 1 commit `4a95243…`; the independent verifier rebuilds the producer
and reproduces fixtures through its real production builders. The pin is reachable from pi-daddy's
merged `main` at `62e9d027514e9fc6d689d505d7ef733a07f1470c`; both commits resolve to tree
`7c006bff213142634f0f911ba9bd6add363ecaae` and have an empty full diff.

## Explicit non-claims

This implementation makes none of these claims:

- no production signer authenticity or cryptographic authentication;
- no internal authorization decision about which future skill-harness engine commit a
  consumer should approve—the externally approved configuration digest is that trust root;
- no remote attestation of Pi, OpenAI, an account, or a model;
- no protection against a malicious owner with write access to the repository/spool;
- no continuous OS-level filesystem race containment; v2 performs repeated
  occurrence checks and terminal fail-closed validation, not a mount namespace or
  kernel policy;
- no general OS, filesystem, network, process, or credential containment;
- no proof that OAuth readiness means a future request will succeed;
- no proof of model efficacy, quality, or qualification outcome;
- no qualification measurement, holdout authoring/review, subject, judge,
  calibration, or canary has been executed by implementing or testing this runner.

The boundary is trusted-local-process integrity with deterministic fail-closed checks.
Use an OS containment system if containment is required.
