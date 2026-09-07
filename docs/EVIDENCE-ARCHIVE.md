# External evidence archive primitives (P03, partial)

`packages/adapters/src/evidence-archive.ts` provides explicit external ingestion and reading. It neither launches nor observes a worker and never writes sessions, grants or control ledgers. No producer fields or pi-daddy contract parity are inferred.

- `retainArchiveSource(root, input)` accepts supplied bytes (maximum 8 MiB), an opaque source ID, parser ID/version, and an explicit `exact`, `redacted`, or `reference-only` retention choice. The caller must already have permission and an applicable retention/redaction policy. This API does not confer permission, discover files, redact content, or authenticate caller claims.
- Objects and manifests are content-addressed. Files are private; a completed object is linked into place before its manifest. Existing mismatched content is rejected rather than overwritten. Re-ingestion is idempotent. Only the invocation's own staging file is cleaned; interrupted staging files are not recovered as evidence.
- `readArchiveSource(root, manifestId)` verifies retained manifest/content identity and byte length. Missing manifest/content, intentionally unretained bytes and invalid/inaccessible evidence remain distinct from available bytes. A redacted source stays labeled redacted. Availability is not exact replay, acceptance, branch identity or proof of redaction correctness.
- `parseArchivedJsonl(bytes)` retains source order and duplicate records, reports byte offsets, malformed complete lines, and an unterminated trailing portion. “Complete” means newline-delimited JSON syntax coverage only. Values still require a versioned semantic adapter; no active branch, timestamp ordering, outcome or authority is inferred. Original bytes remain available separately.

Use an explicitly owned private local directory. Existing symlink ancestors and final-file symlinks are refused; regular files and bounded reads are required. This is not a sandbox or protection against a hostile same-user process changing directory ancestry concurrently. No default raw-content capture or candidate export is enabled. Reference-only metadata still exposes content digests, so even that choice requires a suitable policy.

## Not yet delivered

P02 manifest ingestion and exact producer pin/fixture parity, native execution/call/session joins, persistent source checkpoints, approved operational retention/redaction/access policy, branch ancestry and coverage projection, and credential-safe candidate export remain pending. The primitive may be used with synthetic fixtures independently, but does not complete P03 or qualify a live integration.

## Deterministic checks

From the campaign harness checkout (no package manager/lifecycle invocation needed):

```sh
node node_modules/vitest/vitest.mjs run packages/adapters/test/evidence-archive.test.ts
node node_modules/typescript/bin/tsc -b packages/core packages/adapters packages/cli
```

Mutation-testing machinery was removed by explicit user instruction; its old requirements are withdrawn, not passed. Ordinary behavioral tests remain.
