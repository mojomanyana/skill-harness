# qualification-runner-v1

`qualification-runner-v1` is the separately versioned, source-built execution and
accounting boundary for Principal Pi qualification packets. It does not replace the
ordinary `run → grade → review` loop. It owns one lower-level question: **was this
particular externally declared invocation launched at most once, under the declared
OAuth/environment policy, and what durable artifacts did it leave?**

No measurement or holdout is embedded here. Product, engine, producer, runner, arms,
private input, and measurement identity are external inputs.

## Coordinator lifecycle

Create a closed `qualification-config-v1` JSON file and one
`qualification-invocation-request-v1` file per intended call. The public schemas are:

- `schemas/qualification-config-v1.schema.json`
- `schemas/qualification-invocation-request-v1.schema.json`

Then use the source-built binary pinned by that configuration:

```bash
# Reservation only: validates pins/config/input and consumes zero calls.
node bin/skill-harness.js qualification prepare \
  --spool /absolute/spool \
  --config /absolute/qualification-config.json \
  --request /absolute/invocation-request.json

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

# Durable operator abort. Reason is a bounded identifier, never free-form secrets.
node bin/skill-harness.js qualification abort \
  --spool /absolute/spool --id invocation-id --reason operator-request
```

`start` launches a detached local supervisor and waits only for its durable claim.
The caller may exit while the supervisor continues until the configured deadline.
A controller timeout is not authority to restart it. `status` and `poll` always read
the same invocation.

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
continue without explicit `--continuation-authority`; only the authority digest is
recorded. Once a launch-attempt record exists, the process is never launched again.
Ambiguous interruption therefore fails closed rather than replaying a paid call.

Linux process receipts include PID, kernel boot ID, and `/proc/<pid>/stat` start ticks.
Timeout and abort signal the recorded process group only while that occurrence identity
still matches. Other platforms retain PID liveness but do not claim equivalent reuse
protection. stdout and stderr stream to durable `.partial` files, are bounded by the
arm's output limit, and are retained after failure. Truncation is explicit. A terminal
timeout/abort cannot later be replaced by success.

Operational cleanup is coordinator-owned: first run `qualification validate`, retain
the canonical spool with the packet evidence, and remove only disposable inert/test
spools. Never delete a nonterminal production spool as a substitute for aborting it.

## Exactly-once call accounting

The fixed v1 policy is:

| Scope | Subject | Judge |
|---|---:|---:|
| Wave A target | 54 | 54 |
| Complete-program target | 642 | 642 |
| Hard ceiling | 700 | 700 |
| Initial post-fix count | 0 | 0 |

Rules:

1. `prepare` is a reservation and does not count.
2. The atomic `launch-claimed` accounting event counts exactly once.
3. Spawn failure, refusal, timeout, truncation, invalid output, adapter failure, and
   artifact-validation failure stay counted.
4. No qualification-runner code retries an invocation automatically.
5. Duplicate invocation IDs and duplicate accounting events fail closed.
6. The global spool lock serializes the pre-claim ceiling check and append, so
   concurrent starts cannot cross 700.
7. `holdout-author` and `holdout-reviewer` are always non-measurement and retain their
   own role counts. Subject, judge, calibration, and canary roles are also explicit;
   the selected subject/judge arm determines the relevant call ceiling.
8. `counts_as_measurement` is recorded per invocation and per accounting event. It
   does not make a holdout-author/reviewer call into measurement.

The ledger proves consistency relative to the trusted local files it reads. It does
not prove that a local owner did not replace the entire spool.

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

Before accounting, the runner executes Pi's supported metadata command without
`--credentials`:

```text
pi auth check --provider openai-codex --model <exact-model> --json
```

It requires `status: ready`, the exact provider, and `authType: oauth`. Before that
probe, the production boundary checks the selected Pi agent directory: `auth.json`
must be a private regular file with an `openai-codex` OAuth entry; every stored
credential must be OAuth; and the dedicated directory may not carry non-empty
`models.json` overrides or embedded provider credentials. Use a
dedicated OAuth-only `PI_CODING_AGENT_DIR` when a normal developer profile also holds
API keys. The persisted evidence contains classifications, executable digest, and
environment **names** only—never token/key bytes or credential hashes. Readiness is
explicitly not successful model execution; the completed JSONL artifact must
separately attest execution.

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
Raw arm arguments cannot add an unpinned resource or set provider, model, thinking,
mode, session, API key, metered override, or fallback.

## Post-run provider/model attestation

The runner treats Pi JSONL `message_end.message` as the authoritative completed
identity. Completion requires at least one assistant message and requires every
reported provider/model pair to equal the requested pair. Missing identity,
provider/model substitution, explicit provider/model fallback events, malformed JSONL,
or output truncation produces `invalid-artifact`. A subscription refusal remains
`refused`; it never becomes behavioral evidence. Authentication readiness and model
execution are separate receipt fields.

The terminal receipt binds requested and observed identities, exact attempt count,
process identities, deadline/effective timeout, exit/signal, output byte counts and
digests, artifact path/type/size/digest, authentication-evidence digest, and accounting
event digest. `qualification validate` reopens regular non-symlink files and checks the
bytes again.

## External arms and source-built pins

Configuration binds:

- principal-pi-skills repository, commit, tree, package digest and bytes;
- skill-harness repository, commit, tree, and all public package digests;
- pi-daddy repository, commit, tree, version and ledger version;
- qualification-runner version and executable path/digest;
- subject/judge arm kind, exact provider/model/auth mode;
- executable path/digest, fixed arguments, allowed environment names;
- timeout, output limit, artifact policy, call targets and ceilings.

Production execution additionally verifies that the running CLI is the configured
source-built runner executable. The inert example under
`examples/qualification-runner-v1/` generates a valid `mode: test` configuration with
fake repositories/models and `counts_as_measurement: false`. It is not a packet or a
measurement identity.

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
byte-vendored from pi-daddy `591abb4…`; the independent verifier rebuilds the producer
and reproduces fixtures through its real production builders.

## Explicit non-claims

This implementation makes none of these claims:

- no production signer authenticity or cryptographic authentication;
- no remote attestation of Pi, OpenAI, an account, or a model;
- no protection against a malicious owner with write access to the repository/spool;
- no general OS, filesystem, network, process, or credential containment;
- no proof that OAuth readiness means a future request will succeed;
- no proof of model efficacy, quality, or qualification outcome;
- no qualification measurement, holdout authoring/review, subject, judge,
  calibration, or canary has been executed by implementing or testing this runner.

The boundary is trusted-local-process integrity with deterministic fail-closed checks.
Use an OS containment system if containment is required.
