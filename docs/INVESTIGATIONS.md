# Bounded archive/investigation primitives (P10 partial)

`createArchiveReadCapability` issues a frozen, explicit allowlist of content-reviewed archive manifest IDs with call/returned-byte/expiry bounds. Failed admitted reads consume calls. Only selected retained representations are returned; reference-only/missing data cannot become readable evidence. The interface has no write, exec, network, grant or session method. Default representation is redacted, but that label alone does not approve bytes: the host must independently approve the exact IDs for the intended reader/transport. Expiry is checked before/after I/O, not an OS interrupt of blocked I/O. This is a closed API, **not** process containment or proof that a model host has no other tools.

`buildHypothesis` binds a frozen archive, supporting case IDs, population, alternatives, intervention/prediction/downside/disproof/rollback and explicit resource limits. It remains proposed. `authorizeInvestigation` requires a separately supplied host declaration for that exact content identity; a proposal cannot approve itself. The result authorizes investigation only, never adoption, grants or worker execution. The host must establish actual authorization and independent case/availability evidence; caller-context declarations are not signatures.

Scenario promotion has a second explicit boundary:

1. `previewInvestigationScenario` reads the actual existing spec, renders the complete proposed scenario and validates the result. Its digest binds the canonical destination, existing bytes, scenario and rendered block.
2. The user/controller reviews content privacy and selects that exact preview digest in independent host authority. No automatic sanitization/privacy approval is claimed.
3. `applyInvestigationScenario` revalidates hypothesis/preview and authority, then uses existing `appendScenario` with its base hash. It preserves comments and rejects drift. Exact already-applied bytes return idempotent readback; another changed spec is not overwritten or silently retried.

`freezeInvestigation` pins spec/rubric/judge-policy/held-out/configuration identities. Changes invalidate the freeze. `executionReady` is always false here: route qualification, effect boundary, roles and live-run charter remain separate prerequisites. Frozen hashes are integrity under the host's preserved records, not hostile-storage attestation.

`selectWeeklyInvestigation` produces one deterministic exploratory sample for a week/population/policy and frozen archive. Reordered identical inputs reuse it; changed inputs cannot silently reschedule that slot. The host persists selections and their source snapshots; no daemon or model call is started.

Remaining P10 work: actual restricted model-host integration/transport, authorized live retro, deployed scheduling, verified case/authority store integration and approved evaluation execution. These primitives do not complete P10 or qualify P09/P06. No model result, scenario write or approval becomes adoption.

```sh
node node_modules/vitest/vitest.mjs run packages/core/test/investigation.test.ts packages/adapters/test/archive-read-capability.test.ts
```

Tests use synthetic owned specs/archive data and fixed host declarations; they are not live authorization or qualification.
