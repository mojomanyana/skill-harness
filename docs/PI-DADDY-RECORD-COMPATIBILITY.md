# Pi-daddy record compatibility

The current source candidate adds the explicit `pi-daddy-record-v1` adapter for
native `.pi/pi-daddy/grants.jsonl` files. The published harness 0.24.2 predates
this reader. Do not silently feed a current envelope or projected current body
to the historical `pi-daddy-ledger-v3` selector.

| Selector | Input contract |
| --- | --- |
| `pi-daddy-v1` | Frozen unversioned 0.17 / ledger-v2 compatibility inputs |
| `pi-daddy-ledger-v3` | Frozen bare ledger-v3 events from the historical producer pin |
| `pi-daddy-record-v1` | Native record-v1 envelopes and their current governance bodies, pinned separately under `contracts/pi-daddy/ledger-record/v1/PINNED.json` |

The new reader is an exported adapter API and source-collector option. It does
not add a CLI command, model call, approval authority, or workflow scoring rule.

```ts
import { collectTrajectorySources } from "@skill-harness/adapters";

const observed = collectTrajectorySources(repositoryPath, [{
  adapter: "pi-daddy-record-v1",
  path: ".pi/pi-daddy/grants.jsonl",
  required: true,
}]);
// Treat every observed.errors entry as unavailable evidence.
```

`normalizePiDaddyRecordLedgerV1(text)` directly reads the same complete native
file. Preserve its original bytes; no manual envelope stripping is required.
Both the envelope and its body must satisfy their pinned closed schemas. The
reader also verifies contiguous sequence numbers, exact previous-line hashes,
canonical record digests, unique record identities and envelope/body kind agreement.
It rejects self-parent execution identities and timestamp reversals within an
execution. It rejects the whole source on damaged or unsupported evidence, including a torn final line.
Producer-valid identities that cannot fit the retained trajectory identity grammar
also report unavailable evidence. For example, native `workspaceId: "feature/x"`
is valid for the producer but cannot fit the normalized ID alphabet
`[A-Za-z0-9._:-]` or its 128-character bound. This patch preserves that existing
normalized contract rather than silently changing or dropping an identity.

Each native body produces one observation with `source: pi-daddy-record-v1`.
Lifecycle states map to `child_started`, `child_running`, `child_completed`, or
`child_failed`. A blocked capability decision maps to `child_spawn_refused`.
Other body kinds retain their native names. Unlike the historical adapter, this
reader does not expand one decision into synthetic per-capability grant or
approval events. Callers selecting this new contract must use its explicit
observation semantics.

Model, thinking, definition, usage, null/zero and native identity fields remain
in redacted/bounded attributes; execution identities and relevant digests are
also normalized. Credential-shaped identity arrays and retained map keys reject
the source instead of silently renaming authority; schema diagnostics redact
credential-shaped paths. Raw source bytes remain the authoritative evidence for any
field redaction truncates. A completed child record is an observed producer
claim, not independent evidence of task correctness, cleanup, or billing.
A hash chain checks internal consistency, not the authenticity of its author.

The pin generator reads immutable producer Git objects:

```sh
node scripts/vendor-pi-daddy-record-v1-contract.mjs /path/to/pi-daddy --check
```

Changing this contract requires a new immutable producer pin, its byte-exact
schema and fixture artifacts, meaningful negative controls, and regenerated
extension bundles. Never permit arbitrary unknown fields or rewrite captured
records to make a contract failure pass. Historical pins remain unchanged.
