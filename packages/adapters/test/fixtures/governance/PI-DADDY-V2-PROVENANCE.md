# pi-daddy v2 fixture provenance

The v2 fixtures in this directory are pinned to pi-daddy `v0.18.0`, commit
`dde8eeb5632113d4a54705e16dc22ce70740fd4f`.

- `pi-daddy-v2-positive.jsonl` was emitted with that commit's `buildRecord`,
  `buildWorkspaceLeaseEvent`, and `buildChildLifecycleEvent`, in production delegation order. Its
  write-lease/check/release sequence and append-after-release `check_receipt` line follow
  `packages/pi-daddy/src/check-runner.ts` exactly (there is no separate receipt builder); the receipt
  retains the check's earlier end timestamp, so its timestamp precedes the release line before it.
- `pi-daddy-v2-read-lease.jsonl` is builder output for pi-daddy's lock-free
  `access: "read"`, `outcome: "uncontended"` path.
- `pi-daddy-v2-refusal-stale.jsonl` was emitted with `buildRecord` and
  `buildWorkspaceLeaseEvent`, including `StructuredRefusal` and freshness fields.
- `pi-daddy-v2-missing-join.jsonl` was emitted with
  `buildWorkspaceLeaseEvent` without correlation metadata. pi-daddy permits this;
  skill-harness rejects it because it cannot join the event to a workflow run/task.
- `pi-daddy-v2-workspace-not-authorized.jsonl` was generated from pi-daddy 0.19.0
  commit `c364a6717e3d5e369ecd3298b9cbb595eb94d9b2` by driving production
  `planDelegation` through the denied `workspace:production` routing path, then
  mapping that plan through production `buildRecord` exactly as
  `extensions/run-delegation.ts` does. The real-builder verifier regenerates and
  byte-compares this fixture on every contract CI run.
- `pi-daddy-unsupported-version.jsonl` is the positive lease shape with the explicit
  ledger version changed to `3`; no v2 builder can emit an unsupported version.

The removed `pi-daddy-governance-v1.jsonl` fixture used hypothetical
`schema_version` / `record_type` fields. That was never the public pi-daddy 0.18
ledger format and must not be cited as pi-daddy evidence.
