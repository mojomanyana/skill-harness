# One selected producer-backed qualification worker

`qualification-launch.mjs` -> `qualification-worker.mjs` -> original b17 budget/producer
-> `executeProducerCodexQualification`, monitored by `superviseTrustedHost`. This is
not the older host-framed CLI and not a parent around an unrelated test program.

Run in the documented fixed namespace: `/node` (pinned Node26), `/harness` (this source
and retained built packages), `/producer` (exact b17 archive plus read-only retained root
and package dependencies), `/sdk` (pinned installed SDK), `/out` (one fresh evidence root).
Mount `/usr`, `/lib`, `/lib64` read-only, with proc/dev/tmp; clear environment. No home or
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
executes eight model-free checks against the selected executable: prepare with all blockers,
unapproved live, cross-mode, wrong source, fixture-plus-approval rejection, supervision-refusal without release, actual five-call
producer/SDK success and same-owner re-entry refusal. No broad suite or package installation
is required to exercise this glue.
