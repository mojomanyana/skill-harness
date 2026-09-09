# Prepared subscription HTTP entry — not execution approval

The production-capable path is **separate** from `exchangeSdk` / `inertCodexSdkStreams`.
Those APIs remain invalid-credential/inert-only. `executeCodexQualification` accepts a
frozen five-role charter and a separate, expiring trusted-host approval bound to its
hash **and one exact journal path**. No approval is derived from the manifest, a model,
a fixture, a checksum or a panel vote. The CLI defaults to no execution; production
requires explicit `--execute-approved` and a separate approval file. Current campaign
manifest has no approval and unresolved canonical/account/host evidence, so it cannot
enter live execution.

## Implemented path

- Before credential/transport effects: fixed subscription endpoint/provider, closed
  charter, canonical alias/unknown refusal, unchanged policy/hash/path, expiry,
  separate fixture/live port kinds, model bindings and bounded aggregate reservations.
- Reuses the existing host journal. Claims reserve request/response maxima before SDK
  dispatch; no refund/retry after failed or stranded claims. Conservatively allocated
  byte maxima may exhaust a smaller approved aggregate budget before the fifth call.
  The client enforces request/response bytes, call count, per-call and experiment elapsed
  deadlines, and one in-flight request. No server generation/token cap is invented.
- Actual SDK serializer/decoder still receives **only an invalid credential**. The
  trusted native connector obtains OAuth through its separate port after final wire
  validation; the actual credential is never supplied to SDK hooks or subject frames.
- `createCodexOAuthFilePort` lazily reads only the explicitly approved file, using an
  existing bounded/no-follow regular-file reader (64KiB). The whole JSON is parsed in
  trusted host memory; only the `openai-codex` OAuth entry is returned. API-key entries,
  command/env helpers, missing/expired credentials and account mismatches refuse.
  No refresh/login/write/fallback. OAuth snapshot memory is not an erasure guarantee.
- `createCodexHttpsPort` uses native HTTPS and a private agent, fixed POST/host/port/path,
  bundled trust roots, hostname verification, no custom SDK headers/proxies/redirects,
  no WebSocket or retry. Unsafe proxy/CA/TLS environment refuses before credential use
  through the entrypoint. Host write completion and status/body hash are recorded;
  neither claims provider receipt or backend internals. Non-200 bodies are hashed,
  then replaced with sanitized error text before SDK decoding or persistence.
- One proposer and subject precede objective-eligible anonymous judge exchanges.
  Existing `collapseVotePanel` alone selects the optional clean-split fifth call.
  The panel is advisory; no controller dispatch, grant or adoption consumes a vote.
  Completed executions return the retained result without new credential/HTTP effects.

## Executable interface (NOT run live during preparation)

```sh
node examples/codex-local-boundary/qualification.mjs --prepare /private/manifest.json
# Only after separate exact bounded approval and all unresolved fields are supplied:
node examples/codex-local-boundary/qualification.mjs --execute-approved /private/manifest.json /private/approval.json
```

The private document contains `charter`, `journalPath`, and `executionApproval: null`.
The separate approval binds `scope: subscription-live`, `charterSha256`, `journalPath`,
`approvalId` and `expiresAt`. SDK source fingerprints are verified before loading it;
this is not transitive runtime attestation. A trusted launcher must also verify the
inspected harness source/runtime and actual approval provenance. In-process ports and
approval data are trusted-host capabilities, not an arbitrary-caller security sandbox.
The low-level HTTPS port is not the public approval gate: privileged host code must
enter through the frozen entrypoint, not call that capability directly.

Fixture approvals require fixture evidence and fixture credential/HTTP port kinds.
They cannot enter the production CLI. Evidence records execution/transport kind and
always retains `liveQualified: false`; a successful real call would still not grant
native acceptance or automatic qualification.

## Exact remaining qualification limits

Shared lineage is disclosed correlation, not a ban or proof of independent training.
Current installed model labels and fixture mappings do not establish production
canonical alias resolution. The executable manifest leaves that evidence unresolved;
it does not fabricate a resolver, account binding or root approval.

JS timers and bounded buffers are client controls, not hard CPU/RSS/PID enforcement or
preemption of synchronous trusted code. Production-host supervision/resource and egress
qualification remains external and unmeasured. No cgroup/profile/security setup is
added, and the original P11 aggregate-reservation rule is not replaced by an invented
universal cgroup layout. Server generation may continue after client cancellation.

The supported response profile remains one text output (including normal text parts,
progress and completion framing). Reasoning/tool/multiple-output streams remain
unsupported, not empty qualified successes. Ordinary Pi extension-bearing/runtime
injection rejection and the frozen qualification runner are unchanged.

## Guarded-subject ownership boundary

The standalone qualification CLI still generates frozen frames in the trusted host; it
has not silently switched to a producer-owned subject. A separate opt-in adapter,
`startCodexProducerIpc`, now connects an existing host owner to the finished producer
contract pinned in `examples/codex-local-boundary/producer-ipc-pin.json`. Its caller
supplies the original producer API/owner/permit/binding, original signal and deadline,
plus host-only SDK and transport capabilities. This is not a new approval gate or
credential loader: the trusted launcher must validate approval/charter before creating
those capabilities. The fixed digest profile is not relaxed:


1. Existing producer experiment reservation/execution ID binds a host charter hash and
   one allowed invocation ID; the child gets only the bounded `{id, sequence}` frame
   capability, no OAuth, URL, arbitrary model payload or host socket capability.
2. Existing original child/cancellation handles and held-admission reconciliation own
   lifetime, readiness and settlement; timeout/failure stays counted, never retried.
3. Host claim/response references return as evidence only. No judge result changes
   producer dispatch/grants/acceptance. Resource ownership and actual IPC correlation
   require positive/negative tests in the SAME producer checkout under separate scope.

The completed producer b17f36f contract and tests implement this separate fixed emitter.
The child has already exited before the host exchange; the host receives a one-use
buffered replay of actual original stdout after EOF, NOT a live bidirectional pipe or a
reconstructed host-authored ticket. The resource hold spans the child and host serial
lifetimes. The SDK/model execution is NOT placed inside that child namespace.

The adapter returns actual host journal claim/observation IDs, forwards original source
cancellation, and preserves original started/readiness/child/result/inspect handles.
It gates host completeness, eligible output and judge emission until original completion
acknowledges matching ownership/reference/frame evidence. Its completion rejects a
claimed completed result with mismatched/unknown settlement; observation timeout is
never substituted for completion. Failed calls remain counted; rebinding/retry refuses.
These records live in the existing host journal only. References never change producer
dispatch, grants or acceptance; `liveQualified` remains false.

`producer-ipc-proof.mjs` connects the pinned real producer child, original resource
budget, installed SDK and fake HTTP for success, cancellation, HTTP failure and changed
charter refusal. It runs in the existing network-unshared/no-home fixture mounts, with
an additional read-only `/producer` exact source snapshot and read-only retained root
and package dependency mounts. It uses Node26 type stripping on pinned source, not
historical producer dist or an installed-package claim. Missing mount-point and TypeBox
mount failures were retained and repaired in the private fixture, without installation
or source/security changes. No live TLS/provider/credential call is made.

### Explicit producer-backed five-role entry

`executeProducerCodexQualification(path, charter, approval, ports, source)` is the opt-in
five-role composition. The existing `executeCodexQualification` and standalone CLI remain
host-framed. Results identify `sourceKind`; a persisted source declaration cannot be
rebound to another source or silently reused by the other entry.

`source` supplies `{producer, owner, bindings, signal}` from ONE pinned b17 module graph:
`producer` includes `producerIpcDemand`, `createProducerIpcHost`, `startProducerIpc`;
`owner` is the original `openResourceBudget` object; `bindings` are five closed original
bindings in charter order with unique execution IDs and the same budget/order/experiment.
They include the final charter hash. The caller provides the existing budget owner; the
entry does not create a budget or credential loader. The trusted launcher must pin source
before supplying capabilities. Objects and declarations are not authenticated attestation.

All charter/separate approval/path/SDK/port/source checks precede reservation or source
launch/credential effects. Then one original `reserveBatch` reserves all five demands.
Queued slots count as active: this requires original capacity for five held reservations,
NOT five concurrent HTTP calls. Bindings' charged bytes are not SDK request bytes: the
existing host separately accounts call/request/response reservations. The fifth slot is
reserved even when no tie-break is used; skipped slots are cancelled through their
original, unclaimed permits. Attempts and charged bytes are never refunded.

Each role passes actual original child bytes through `startCodexProducerIpc`, always
sequence1. Only original acknowledged completion permits advancing. A bounded failing
`result` can stop observation, never settle/release a possibly handed-off permit or
advance to a judge. Unknown queued cancellation also blocks a finished record. Cached
finished results cause no reservation/call; any unfinished charter, including reservation
pending before its first host claim, refuses resume. A failing/stranded run is not retried.

`producer-qualification-proof.mjs` exercises ten scenarios using the exact source, actual
children, original owner and installed SDK with inert HTTP: four-call success, reserved
fifth tie, early objective failure, cancellation, HTTP failure, required settlement-sync
failure, stranded re-entry, changed charter, host aggregate exhaustion and producer
aggregate exhaustion. Required-sync failure can leave visible settlement bytes while
acknowledgement is unknown; visible active0 is not successful ownership. The original
failed compressed-wire fixture is retained; it was corrected to decode actual zstd wire
bytes, without changing SDK/source transport. No real credential or network call occurs.

### Independent trusted-host process supervision

`superviseTrustedHost(child, {wallMs, settlementMs, maxOutputBytes, signal})` in core
monitors an already admitted, caller-owned detached Linux worker after its spawn event.
It reuses qualification-runner's PID/boot/start occurrence checks and same-group cleanup
utilities WITHOUT changing the Pi runner's launch/auth/attestation route. It never spawns,
authorizes or retries a worker. An independent responsive parent can stop a blocked worker
JavaScript loop with occurrence-checked TERM/KILL, including when TERM is ignored.

The monitor counts/discards combined stdout/stderr (no raw content or output hashes),
records exit/timeout/abort/output-limit/unknown evidence, and refuses duplicate monitoring.
Leader exit triggers same-group cleanup attempts. `completed` means leader exit0, closed
pipes and completed cleanup calls—not proof that arbitrary escaped descendants, hostile
code or an uninterruptible kernel task are contained. Unknown settlement retains the
original child occurrence for the caller; it never releases producer reservations.
Its observation always says `acceptance: not-assessed`. Supervisor death and parent-event-
loop blockage are not handled by this in-process observer; it is not crash recovery.

`supervised-producer-proof.mjs` demonstrates the concrete arrangement: an outer fixture
parent launches the existing ten-scenario actual-producer/installed-SDK proof as one
trusted Node worker, with an empty environment, and monitors it independently. The worker
continues to own the original producer graph/budget/journal; monitoring does not transfer
those capabilities. Both remain in the existing no-home/network-unshared fixture boundary.

Original scope6 requires total bounds, P06 explicitly permits a limited non-shell profile,
and P11 requires whole-experiment reservations/no duplicate effects. These do not impose
universal cgroups or numerical server-token limits. Existing client budgets plus original
ownership and this parent supervision support a narrowly bounded TRUSTED extension-free
SDK route. They do not satisfy P06's arbitrary-worker denied-write test, P10 archive-only
confinement, general shadow isolation, hard aggregate CPU/RSS/PID/money, remote termination,
or extension-bearing P09 qualification. Keep those distinct claims separate rather than
making every stronger guarantee a gate for useful trusted-host observations.

This proves local IPC/ownership wiring, not live qualification of the five-call manifest,
canonical/account authenticity, hard aggregate host resources, remote termination or
native-P01 acceptance. The existing fixed digest operations still require null
model/effort/skills. No peer publication or further model call follows from these tests.

## Evidence scope

Portable tests mock credential/HTTP ports and native HTTPS I/O. The separate
`subscription-proof.mjs` runs the actual installed SDK in the documented network-unshared,
no-home fixture mounts with fake OAuth and HTTP ports. Neither is a real TLS handshake,
credential read, subscription entitlement check or live model result. No installation,
provider/auth/catalog probe, publication or merge is implied.
