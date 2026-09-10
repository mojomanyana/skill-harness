# External evidence archive primitives (P03, partial)

`packages/adapters/src/evidence-archive.ts` provides explicit external ingestion and reading. It neither launches nor observes a worker and never writes sessions, grants or control ledgers. No producer fields or pi-daddy contract parity are inferred.

- `retainArchiveSource(root, input)` accepts supplied bytes (maximum 8 MiB), an opaque source ID, parser ID/version, and an explicit `exact`, `redacted`, or `reference-only` retention choice. The caller must already have permission and an applicable retention/redaction policy. This API does not confer permission, discover files, redact content, or authenticate caller claims.
- Objects and manifests are content-addressed. Files are private; a completed object is linked into place before its manifest. Existing mismatched content is rejected rather than overwritten. Re-ingestion is idempotent. Only the invocation's own staging file is cleaned; interrupted staging files are not recovered as evidence.
- `readArchiveSource(root, manifestId)` verifies retained manifest/content identity and byte length. Missing manifest/content, intentionally unretained bytes and invalid/inaccessible evidence remain distinct from available bytes. A redacted source stays labeled redacted. Availability is not exact replay, acceptance, branch identity or proof of redaction correctness.
- `parseArchivedJsonl(bytes)` retains source order and duplicate records, reports byte offsets, malformed complete lines, and an unterminated trailing portion. “Complete” means newline-delimited JSON syntax coverage only. Values still require a versioned semantic adapter; no active branch, timestamp ordering, outcome or authority is inferred. Original bytes remain available separately.

Use an explicitly owned private local directory. Existing symlink ancestors and final-file symlinks are refused; regular files and bounded reads are required. This is not a sandbox or protection against a hostile same-user process changing directory ancestry concurrently. No default raw-content capture or candidate export is enabled. Reference-only metadata still exposes content digests, so even that choice requires a suitable policy.

## Immutable ingestion checkpoints

`ingestArchiveSnapshot(root, input)` adds a durable checkpoint for explicitly supplied snapshots, with an optional `previousCheckpointId`. Repeated identical observations return the same checkpoint and no new records. Exact byte-prefix growth preserves record IDs and resumes a pending line; source replacement starts a distinct lineage. Parser/representation changes and missing previous bytes explicitly break continuity. Duplicate logical labels/timestamps remain separate source records, not separate inferred outcomes.

`readArchiveCheckpoint(root, checkpointId)` reconstructs state without modifying the source or calling any worker. It rechecks retained source identity and recomputes byte/syntax coverage rather than trusting cursor counts. Persist the returned checkpoint ID in the caller's managed ingestion job. There is no automatic watcher or mutable latest-pointer service. The declared parser metadata is separate from the actual `jsonl-syntax-v1` reader; this reader does not validate native event semantics. Active branch stays null and acceptance stays not-assessed.

## Explicit policy CLI

`archive ingest --policy <file> --source <id> [--previous <checkpoint>]` captures one explicitly allowed source. `archive inspect --policy <file> --source <id> --checkpoint <id>` reports checkpoint metadata only. Neither command exports payload bytes, writes worker sessions, runs a worker, or calls a model. Exit zero means the operation succeeded, **not** complete evidence: inspect `sourceStatus`, `syntax`, gaps and `acceptance`.

The selected policy is canonical `JSON.stringify` JSON in an owner-only regular file (mode0600). It has exactly:

```json
{"version":"archive-policy-v1","id":"local","revision":"1","sourceRoot":"/owned/private/producer","archiveRoot":"/owned/private/consumer","maxBytes":1048576,"retention":"exact","expiresAt":"2099-01-01T00:00:00.000Z","sources":[{"id":"source-1","path":"events.jsonl","parser":{"id":"jsonl","version":"1"}}]}
```

Use actual owned absolute roots and a deliberately chosen expiry, not these example paths/date. Source roots and files must be private, operator-owned and symlink-free. Relative source paths are allowlisted; traversal, known agent/auth paths, inline policy overrides, unknown keys, expired policy and oversize sources are refused. A digest-only policy receipt binds each checkpoint to the exact configuration bytes without retaining local policy paths. The policy is operator-selected configuration, **not** a signed approval or protection against a hostile same-user agent. Redacted mode expects already-redacted input; it does not perform or certify redaction. No automatic capture, retention deletion or public export is enabled.

## Pinned producer semantic ingestion

`ingestRetainedExecution` and `readRetainedExecution` now consume execution-retention2.0 pinned to pi-daddy `7c78769c47177b1972b09e1f5c5474ad44cd2cac`. The source-owned validator, exact schema and six fixtures are generated through `scripts/vendor-execution-retention.mjs`; no historical selector is repinned. Actual blob bytes—not a producer's retained flag—determine availability. Re-reading rechecks deleted/corrupt content. Bounded mismatched bytes remain forensic input, not valid evidence.

`projectRetainedExecutions` groups by execution identity, preserves exact public-call/parent joins, reports conflicts/cycles/missing parents, and does not infer accepted work or active branch. The versioned schema and actual-adapter fixture for downstream views are in [`contracts/execution-archive/v1`](../contracts/execution-archive/v1/README.md). Semantic ingestion requires an explicit exact-content policy and policy-authorized blob bytes. Policy-v1 never follows content references. The explicit `archive-policy-v2` form requires `contentPolicy` on each source: `manifest-only` or `referenced-blobs`. The latter is allowed only for parser `pi-daddy-execution-retention` version `2.0` with exact retention. It follows only strictly validated content-addressed sibling basenames, at most the six producer content kinds, each bounded by both the policy's per-file limit and the producer limit. Missing blobs remain missing; unsafe paths/permissions are refused. Native ingest/inspect use the existing CLI and return metadata with unknown active branch/partial coverage/no acceptance. Returned `checkpointId` identifies the semantic snapshot; no implicit upgrade of policy-v1 occurs.

## Actual archived work-v4 projection

`readArchivedWork` now uses the pinned producer's actual pure builders/parser/projector, not a hand-reconstructed P04 display summary. `scripts/vendor-work-v4-reader.mjs` copies the exact7c78769 contract/dependencies and mechanically removes only append/inspect functions and their filesystem imports from the facade. Generated source is never edited manually. Existing retention and historical ledger selectors remain separate.

The source must be exact retained bytes tagged `pi-daddy-work-ledger` version `4`. Selection and authority are separate programmatic host inputs; authority is never loaded from the archived wire or a context file. Missing/redacted/invalid sources remain unavailable or diagnostically unresolved. `captureArchivedWorkCandidates` links the retained raw ledger, real derived projection and silent case batch. The producer Layout A fixture still resolves two attempts/three variants without inventing acceptance under absent authority. This does not authenticate host declarations or qualify a live observer.

## Bounded external observation

`archive watch --policy <file> --source <id> --max-polls <1..128> [--interval-ms <1..60000>] [--previous <checkpoint>]` now observes the explicitly allowed file in a separate operator process. Policy identity is pinned before capture and checked before every source read; policy drift/expiry stops observation rather than following a new destination. Source failures and optional consumer loss are durable gaps. Every poll retains an immutable observer receipt; only final receipts claim terminal observation. A restart can use the returned last checkpoint and never silently resets a missing/corrupt cursor.

SIGINT/SIGTERM stop this observer, not a worker. The API accepts an AbortSignal and a synchronous optional metadata consumer. Capture never waits on an asynchronous consumer; its unsupported outcome is explicitly unobserved. Poll count/interval and byte limits are bounded, but synchronous filesystem I/O is not an OS deadline and no zero-overhead claim is made. This is file observation, not a native-session hook, active-branch proof or authenticated live transport. A real separate Node producer continued and completed after the compiled watcher stopped in the owned process fixture.

## Not yet delivered

A deployed archive/content-redaction policy, automatic source discovery, trusted live-branch/acceptance authority, and credential-safe candidate export remain pending. The bounded explicit watcher and semantic APIs are not automatically deployed or qualified as live Pi/Herdr observation. The primitive may be used with synthetic fixtures independently, but does not complete P03 or qualify a live integration.

## Deterministic checks

From the campaign harness checkout (no package manager/lifecycle invocation needed):

```sh
node node_modules/vitest/vitest.mjs run packages/adapters/test/evidence-archive.test.ts packages/adapters/test/archive-checkpoint.test.ts
node node_modules/typescript/bin/tsc -b packages/core packages/adapters packages/cli
```

Mutation-testing machinery was removed by explicit user instruction; its old requirements are withdrawn, not passed. Ordinary behavioral tests remain.
