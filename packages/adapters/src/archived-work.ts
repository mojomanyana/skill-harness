import { readArchiveSource, retainArchiveSource } from "./evidence-archive.js";
import { projectWorkLedger, type WorkProjectionContext, type WorkFrozen, type WorkProjection } from "./generated/work-v4/reader.js";
import { WORK_V4_READER_COMMIT } from "./generated/work-v4/pin.js";
import { captureWorkCandidates } from "./work-case-archive.js";
import type { WorkDetectionOptions } from "./work-candidates.js";
export type ArchivedWork =
  | { state: "available"; manifestId: string; sourceSha256: string; producerCommit: string; projection: WorkFrozen<WorkProjection> }
  | { state: "missing" | "error"; manifestId: string; reason: string };
/** Pinned producer's actual pure reader/projector, with no append/inspect/file-writing API in the generated facade. */
export function readArchivedWork(root: string, manifestId: string, context: WorkFrozen<WorkProjectionContext> = { selectedSnapshot: null, authority: null }): ArchivedWork {
  const source = readArchiveSource(root, manifestId);
  if (source.status !== "available") return { state: source.status === "missing" ? "missing" : "error", manifestId, reason: "work-source-unavailable" };
  if (source.reference.retention !== "exact" || source.reference.parser.id !== "pi-daddy-work-ledger" || source.reference.parser.version !== "4") return { state: "error", manifestId, reason: "exact-work-v4-source-required" };
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(source.bytes);
    const projection = projectWorkLedger(text, context);
    return { state: "available", manifestId, sourceSha256: source.reference.sha256, producerCommit: WORK_V4_READER_COMMIT, projection };
  } catch { return { state: "error", manifestId, reason: "invalid-work-source-or-context" }; }
}
/** Preserve raw work bytes, derived facts and candidate batch linkage. No authority is read from an archive/context file. */
export function captureArchivedWorkCandidates(root: string, manifestId: string, context: WorkFrozen<WorkProjectionContext>, options: WorkDetectionOptions) {
  const read = readArchivedWork(root, manifestId, context);
  if (read.state !== "available" || read.projection.errors.length || read.projection.scopeState !== "valid") throw new Error("work source/selection incomplete; cannot nominate behavior");
  const cases = captureWorkCandidates(root, read.projection, options);
  const linkage = { version: "archived-work-candidates-v1", workManifestId: manifestId, workSha256: read.sourceSha256, producerCommit: read.producerCommit,
    observationId: cases.observationId, caseBatchId: cases.batchId, candidateIds: cases.candidateIds, authorityBasis: "independently-supplied-host-context", acceptance: "not-assessed" };
  const stored = retainArchiveSource(root, { sourceId: `work-case-link-${read.sourceSha256}`, parser: { id: "archived-work-candidates", version: "1" }, retention: "exact", bytes: Buffer.from(JSON.stringify(linkage)) });
  return { ...linkage, linkageManifestId: stored.manifestId };
}
