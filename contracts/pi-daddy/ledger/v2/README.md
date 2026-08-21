# Pinned pi-daddy ledger v2 contract (consumer copy)

Byte-exact copies of pi-daddy's canonical `ledgerVersion: 2` contract, taken from
producer commit `1948b9406c13c9730f2fc103e68023d6e58c5e85` (pi-daddy `main`, merged
PR #11). `PINNED.json` records the commit, the source path of every file, and its
SHA-256.

| File | What it is |
|---|---|
| `ledger-event.schema.json` | The producer's closed JSON Schema (draft 2020-12) union, discriminated by `event`. |
| `fixtures/*.json` | The four deterministic examples pi-daddy generates through its production builders. |
| `pi-daddy-README.md` | pi-daddy's own contract notes, verbatim (renamed so it does not shadow this file). |
| `PINNED.json` | Producer commit + per-artifact SHA-256. |

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
- `packages/adapters/test/pi-daddy-contract.test.ts` asserts these digests, that the
  runtime copy still equals these bytes, and that every vocabulary the adapter restates
  is set-equal to its place in this schema, in both directions — refusal codes, event
  discriminators, approval sources and scopes, lease outcomes and access, lifecycle
  states, executors, and the correlation field whitelist. Add a new one to the
  `V2_RESTATED_VOCABULARIES` manifest in `trajectory.ts`, never as a loose
  `new Set([...])` the drift test cannot see.

Free and offline; no model or judge calls. Run it directly with:

```bash
node scripts/check-pi-daddy-contract.mjs                                    # vendored copy
node scripts/check-pi-daddy-contract.mjs ../pi-daddy <producer-commit>      # a real checkout, read from git
```

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
npm run build                        # the check below reads dist and refuses a stale one
npm test -- pi-daddy-contract        # digests, drift assertions, four-fixture conformance
node scripts/check-pi-daddy-contract.mjs ../pi-daddy <commit>
```

The script reads the artifact out of `git show` (never the working tree), rewrites
these files and the digests, and regenerates the runtime schema module. Update
`EXPECTED_PRODUCER_COMMIT` in the conformance test in the same change, so bumping the
pin is a deliberate edit rather than a silent one.
