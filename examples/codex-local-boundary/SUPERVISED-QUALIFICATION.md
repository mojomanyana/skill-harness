# One selected producer-backed qualification worker

`qualification-launch.mjs` -> `qualification-worker.mjs` -> original b17 budget/producer
-> `executeProducerCodexQualification`, monitored by `superviseTrustedHost`. This is
not the older host-framed CLI and not a parent around an unrelated test program.

Run in the documented fixed namespace: `/node` (pinned Node26), `/harness` (this source
and retained built packages), `/producer` (exact b17 archive plus read-only retained root
and package dependencies), `/sdk` (pinned installed SDK), `/out` (one fresh evidence root).
Mount `/usr`, `/lib`, `/lib64` read-only, with proc/dev/tmp; clear environment. A subscription
profile additionally binds the host's **resolved regular resolver file** read-only at
`/etc/resolv.conf` (resolve the source symlink on the host, not in the namespace). Do not
mount all of `/etc`, add a DNS server, proxy, CA bundle or alternate destination. The
caller and worker check readable, direct regular-file presence and bounded nonzero size
before any budget or credential use, including `--prepare`. This does not prove valid
resolver contents, DNS reachability, TLS or provider availability. Fixtures need no host
resolver input; the proof uses an inert nonempty file solely for subscription preparation.
TLS continues to use explicit Node bundled roots and hostname verification, not host CA files.
No home or
auth file is mounted in a fixture. The exact host paths/argv are emitted by the local
proof's `command.json`; no command below authorizes execution or installation.

```
/node /harness/examples/codex-local-boundary/qualification-launch.mjs --prepare /out/launch.json
/node /harness/examples/codex-local-boundary/qualification-launch.mjs --fixture /out/launch.json
# FUTURE live invocation only after external facts + separate exact approval:
/node /harness/examples/codex-local-boundary/qualification-launch.mjs --live /out/launch.json /out/approval.json
```

The launch config binds source hashes (including worker, caller, fixture ports, original
producer source, retained compiled harness and four SDK fingerprints), the existing
five-role charter, and fixed namespace paths. Parent and worker independently recheck it.
The parent starts exactly `/node qualification-worker.mjs`, empty environment, detached,
then attaches supervision BEFORE sending one bounded `{id: launchSha256, sequence:1}`
release frame. The original producer emitter still sends only its own invocation-id frame;
it receives no OAuth, endpoint or parent host socket capability.

The worker creates one original experiment budget: five attempts, five queued active
slots and8192 binding bytes. c4 retains the separate five-call/byte/time reservations and
serial completion/settlement gate. The fixture deliberately splits the first two judges,
exercising all five original child/SDK roles. No original permit is reconstructed. Existing
budget/owner/result/process paths refuse re-entry; there is no auto retry or refund.

`--fixture` requires fixture provenance and refuses ANY approval argument. It selects
only inert OAuth/HTTP ports, disables ambient fetch/WebSocket, and runs without network or
an auth mount. `--live` cannot use a fixture config. Its separate approval wrapper requires
version `supervised-producer-approval-v1`, exact `launchSha256`, `approvedLiveCalls:5`, and
an `executionApproval` validated by the existing Codex charter validator (subscription-live
scope, exact charter/journal, actual approval ID, bounded expiry). The manifest's null
approval/zero-current-budget is preparation metadata, never authority; only that separately
supplied five-call approval can authorize a later live invocation.

Live additionally needs actual canonical/account provenance, selected trusted-host scope
and approved network/OAuth mount. Source hashes do not authenticate those facts, a human,
the mount operator, or transitive dependency trust. The external command receipt fixes host
mount paths; the launch hash binds the namespace paths, not an independent mount attestation.
No example fills those facts. Parent supervision is responsive-process lifecycle control,
not hostile-code containment, aggregate hard RAM/CPU/PID, crash recovery or server generation
limits. A process observation never grants native acceptance.

`qualification-launch-proof.mjs <private five-call template> <b17 archive> <retained dependency checkout> <evidence root>`
executes seventeen model-free checks (including the single-request and separate approval-loader checks) against the selected executable: prepare with all blockers,
missing/empty resolver refusal, unapproved live, cross-mode, wrong source, fixture-plus-approval rejection, supervision-refusal without release, actual five-call
producer/SDK success and same-owner re-entry refusal. No broad suite or package installation
is required to exercise this glue.

HTTPS request/response errors retain only an exact allowlisted Node `errorCode` and a
fixed last-entered `phase` (request/lookup/connect/tls/write/response). Unknown codes map
to `unknown`; messages, stacks, headers, URLs, addresses and credentials are never copied.
Phase is progress, not root-cause attribution. Recording failure rejects the exchange.
A historical record containing only `transport-failure` cannot be retrospectively assigned
a DNS/TLS/auth cause from timing.

Response completion retains the original TLS socket captured at headers: Node can detach
`res.socket` before a user's `end` listener. HTTP completion still requires that original socket
to be authorized, host write-finish, complete/unaborted HTTP framing, identity content encoding
and bounded bytes. Redirects and credential/account reflections reject before any body hash,
including on non200 responses and JSON-escaped reflections. Rejected completion records only
a fixed reason; recording failure rejects. Valid completed non200 responses remain failures:
only exact allowlisted `error.param`, `error.type` and `error.code` values are recorded as
`refusal.parameter/type/code`, unknown otherwise. No arbitrary message/body/header values
from those refusals are passed to the SDK; it receives a fixed refusal body. A200 still needs the existing separate
SSE/profile/delivery gates. This improves future evidence, not the classification of an old400
whose body/socket state was not retained.

## Explicit one-request diagnostic (not five-role qualification)

`supervised-producer-single-request-launch-v1` uses the same caller/worker and original
five-permit reservation. Its host admits only the proposer (maxCalls1), its transport has
a one-attempt ceiling, and it returns before any subject/panel execution. The other four
original queued permits are cancelled without refund; all five remain charged. Failure or
unknown original acknowledgement prevents finish. This is not five actual model calls.

The only permitted input is `Return only the integer: 2 + 2.`, proposer `gpt-5.4`/low,
system instruction `Return only the integer answer.`, expected output digest of `4`.
All existing route/TLS/resolver/SDK/profile/canonical/byte/time checks remain. Results are
labelled `single-request-v1`, never a full qualification, panel or adoption instruction.

Live requires separate wrapper version `supervised-producer-single-request-approval-v1`,
exact launchSha256 and approvedLiveCalls1. Its executionApproval has scope
`subscription-single-request`, approvedCalls1, exact charterSha256/owner path, approval ID
and expiry. The ordinary five-role API rejects this scope; the single API rejects ordinary
five-role authority. Fixture scope is separately `fixture-single-request`, and fixture mode
still refuses external approval. Manifest approvalnull/currentbudget0 is not authority.
An unused fresh output directory and exact root execution review are required; never reuse
any spent five-role or diagnostic authority/owner. `httpAttempts` counts bounded transport
attempts, not authenticated provider receipt or generation.

A changed source or mount arrangement needs a fresh
private proposal and separate exact execution authorization; never reuse a spent owner,
approval or reservation.
