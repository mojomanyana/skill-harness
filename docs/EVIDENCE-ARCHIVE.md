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

## Not yet delivered

P02 manifest ingestion and exact producer pin/fixture parity, native execution/call/session joins, approved operational retention/redaction/access policy, branch ancestry/semantic coverage projection, and credential-safe candidate export remain pending. The primitive may be used with synthetic fixtures independently, but does not complete P03 or qualify a live integration.

## Deterministic checks

From the campaign harness checkout (no package manager/lifecycle invocation needed):

```sh
node node_modules/vitest/vitest.mjs run packages/adapters/test/evidence-archive.test.ts packages/adapters/test/archive-checkpoint.test.ts
node node_modules/typescript/bin/tsc -b packages/core packages/adapters packages/cli
```

Mutation-testing machinery was removed by explicit user instruction; its old requirements are withdrawn, not passed. Ordinary behavioral tests remain.
