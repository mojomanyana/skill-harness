# Pinned pi-daddy ledger v2 contract (consumer copy)

Byte-exact copies of pi-daddy's canonical `ledgerVersion: 2` contract, taken from
the immutable Handoff B producer commit
`3070152efd4633bc40f5065e892d5eee8372ffc8`. `PINNED.json` records repository
`mojomanyana/pi-daddy`, the exact commit, schema/refusal source paths, the schema
digest, and a SHA-256 for every vendored artifact.

| File | What it is |
|---|---|
| `ledger-event.schema.json` | The producer's closed JSON Schema (draft 2020-12) union, discriminated by `event`. |
| `fixtures/*.json` | The four deterministic examples pi-daddy generates through its production builders. |
| `refusals.ts` | The producer's canonical `REFUSAL_CODES` source, byte-exact. |
| `pi-daddy-README.md` | pi-daddy's own contract notes, verbatim (renamed so it does not shadow this file). |
| `PINNED.json` | Producer repository/commit, source paths, schema digest, and per-artifact SHA-256. |

## Why the copy exists

The adapter used to restate this contract in its own words. A restatement is where
drift hides: a refusal code the producer had added (`GRANT_ID_MALFORMED`) read as
"unsupported", a field the closed schema forbids rode through unnoticed, and the
harness required a receipt's measured `treeSha` to equal the controller's
`correlation.tree_sha` — which pi-daddy's own canonical receipt does not satisfy.

So the schema is now *interpreted*, not transcribed:

- `packages/adapters/src/pi-daddy-ledger-v2.ts` is the runtime copy of the schema,
  generated from these bytes. It is a module rather than a file read so it survives
  the committed esbuild bundle and needs no published data asset.
- `packages/adapters/src/closed-schema.ts` evaluates a record against it before any
  semantic normalization, and **refuses** a schema keyword it cannot enforce rather
  than silently validating less than the contract declares.
- The runtime refusal set is derived directly from `#/$defs/refusalCode` in that
  generated schema; there is no adapter-owned list. The vendored `refusals.ts` proves
  which producer source was pinned, and the real-builder verifier imports its compiled
  `REFUSAL_CODES` and checks set equality with both schema and adapter.
- `packages/adapters/test/pi-daddy-contract.test.ts` asserts these digests, that the
  runtime copy still equals these bytes, and that every vocabulary the adapter restates
  is set-equal to its place in this schema, in both directions — refusal field/detail-type
  names, event discriminators, approval sources and scopes, lease
  outcomes and access, lifecycle states, executors, and the correlation field whitelist
  including which of its fields are numeric. Add a new one to the
  `V2_RESTATED_VOCABULARIES` manifest in `trajectory.ts`, never as a loose
  `new Set([...])` the drift test cannot see. A vocabulary the harness deliberately holds
  as a *subset* goes in `V2_VOCABULARY_SUBSETS` and is containment-asserted instead.

Free and offline; no model or judge calls. The vendored check needs only this
checkout; the integration verifier needs dependencies already installed in both
clean checkouts and then builds both repositories itself:

```bash
node scripts/check-pi-daddy-contract.mjs
node scripts/vendor-pi-daddy-contract.mjs ../pi-daddy 3070152efd4633bc40f5065e892d5eee8372ffc8 11 --check
npm run verify:pi-daddy-contract -- ../pi-daddy
```

The verifier refuses a dirty pi-daddy checkout or any producer HEAD other than the
pin. It imports production `buildRecord`, the three runtime event builders, and
`REFUSAL_CODES`; validates every builder-produced wire record against the pinned
schema; then checks normalization, join identity, all refusal codes, legacy dispatch,
approvals/digests, every lease outcome, lifecycle flags, receipt identity, and
fail-closed mutations. It never reads current pi-daddy `main` and never fetches at
runtime.

## Harness-only requirements that survive schema validation

The producer's schema is the floor, not the ceiling. These are the harness's own and
are enforced *after* a record is admitted by the contract:

- **`correlation.run_id` and `correlation.task_id` are required.** pi-daddy permits an
  uncorrelated v2 line — `correlation` is optional in the closed schema — but an event
  the harness cannot join to run/task evidence is not usable as trajectory evidence,
  so it fails as unjoinable rather than being silently dropped.
- **A check receipt's `treeSha` must look like a git object id** (40 or 64 hex). The
  schema only bounds it as a non-empty string.
- **Correlation byte bounds and secret-shaped values.** 512 characters per string,
  4 KiB for `assurance_scope`, 32 KiB in total, and a value that redacts differently
  than it was written is refused. The producer enforces these at runtime; JSON Schema
  cannot express them.
- **Semantic relations** — capability partitioning, approval/refusal coherence, lease
  and receipt causal order, chronology per run/task/workspace/child stream.

## Re-pinning to a newer producer commit

```bash
node scripts/vendor-pi-daddy-contract.mjs ../pi-daddy <commit> [pr-number]
node scripts/vendor-pi-daddy-contract.mjs ../pi-daddy <commit> [pr-number] --check
npm run build                        # the checks below refuse stale dist
npm test -- pi-daddy-contract        # digests, drift assertions, vocabulary conformance
node scripts/check-pi-daddy-contract.mjs ../pi-daddy <commit>
npm run verify:pi-daddy-contract -- ../pi-daddy
```

The vendor script reads artifacts with `git show` (never the working tree), rewrites
the copies/digests, and regenerates the runtime schema module. `--check` performs the
same generation in memory and fails on any byte difference. Update
`EXPECTED_PRODUCER_COMMIT` in the conformance test in the same change, so bumping the
pin is a deliberate edit rather than a silent one. CI checks pi-daddy out at the
literal immutable SHA (not a tag, npm `latest`, or `main`) and runs the real-builder
verifier before the ordinary build/test and dogfood jobs may proceed.
