import { closeSync, fsyncSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CandidateObservation } from "./jev-candidate.js";
import { evidenceReferences, sha256, type EvidenceRef, type VerifiedEvidence } from "./jev-evidence.js";

export const JEV_PROVIDER = "jev";
export const JEV_MODEL = "typesafe/jev-1.13";
export const JEV_WORKFLOW_LIMIT = 3;
export const JEV_QUESTION = "Given the stated stage, unresolved engineering uncertainty, requirements and selected evidence, is the proposed next action justified? Assess that action only, not final acceptance or whether mandatory later review is complete.";
export const JEV_SOURCE_KIND = "skill-harness-selected-decision-v2";

export interface HandoffPacket {
  candidate: string;
  requirements: string;
  evidence: string;
  stage: "design" | "implementation" | "verification";
  nextAction: string;
  uncertainty: string;
  evidenceRefs?: EvidenceRef[];
}

export function requireIdentity(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > 256)
    throw new Error(`${name} must be a nonempty runtime identity of at most 256 characters`);
}

/** Construct the exact outbound input, with stable field order and no caller-selected question. */
export function prepareHandoff(value: HandoffPacket) {
  for (const field of ["candidate", "requirements", "evidence", "stage", "nextAction", "uncertainty"] as const) {
    if (typeof value[field] !== "string" || !value[field].trim() || value[field].length > 32000)
      throw new Error(`${field} must be a nonempty bounded string`);
    // Hashing/reconstructing malformed UTF-16 would silently replace input bytes.
    if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value[field]))
      throw new Error(`${field} must contain valid Unicode`);
  }
  if (!["design", "implementation", "verification"].includes(value.stage)) throw new Error("Invalid JEV decision stage");
  const input = JSON.stringify({
    candidate: value.candidate, stage: value.stage, nextAction: value.nextAction, uncertainty: value.uncertainty,
    requirements: value.requirements, evidence: value.evidence,
  });
  if (Array.from(input).length > 16000)
    throw new Error("The complete selected handoff packet must not exceed 16000 characters");
  return Object.freeze({ input, question: JEV_QUESTION, inputSha256: sha256(input) });
}

export function createHandoffSource(options: {
  packet: ReturnType<typeof prepareHandoff>;
  sessionId: string;
  toolCallId: string;
  consent: unknown;
  authorization: unknown;
  evidence?: VerifiedEvidence[];
  candidateObservation?: CandidateObservation;
}) {
  requireIdentity(options.sessionId, "Pi sessionId");
  requireIdentity(options.toolCallId, "Pi toolCallId");
  const source = {
    schema: 2,
    kind: JEV_SOURCE_KIND,
    sessionId: options.sessionId,
    toolCallId: options.toolCallId,
    frozenAt: new Date().toISOString(),
    input: options.packet.input,
    inputSha256: options.packet.inputSha256,
    question: JEV_QUESTION,
    provider: JEV_PROVIDER,
    model: JEV_MODEL,
    consent: options.consent,
    authorization: options.authorization,
    provenance: "tool-selected-input",
    candidateIdentity: options.candidateObservation ? "principal-runtime-observed" : "caller-claimed",
    candidateObservation: options.candidateObservation ?? null,
    sourceBinding: options.evidence?.length ? "local-reference-digests-verified" : "unassessed",
    evidenceRefs: evidenceReferences(options.evidence ?? []),
    evidenceClaims: "unassessed",
    inputArtifact: { path: "input.txt", sha256: options.packet.inputSha256, encoding: "utf8" },
    redaction: "unassessed",
    rights: "unassessed",
    labelStatus: "unlabeled",
    trainingEligible: false,
    exportEligible: false,
    publicCaptureVerified: false,
  };
  const bytes = JSON.stringify(source, null, 2) + "\n";
  return Object.freeze({ source, bytes, sha256: sha256(bytes) });
}

function privateDirectory(path: string) {
  try { mkdirSync(path, { mode: 0o700 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error("JEV storage must be a private directory, not a link");
  if (process.platform !== "win32" &&
      ((stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid())))
    throw new Error("JEV storage directory must be owned by the current user with mode 0700");
}

function writeNew(path: string, bytes: string | Buffer) {
  const fd = openSync(path, "wx", 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); }
  finally { closeSync(fd); }
}

/** No project-relative path, transcript lookup, capture claim or dataset-import side effect. */
export function retainHandoffSource(
  source: ReturnType<typeof createHandoffSource>,
  assertCurrent: () => void,
  storageHome = join(homedir(), ".skill-harness"),
  evidence: VerifiedEvidence[] = [],
) {
  assertCurrent();
  privateDirectory(storageHome);
  const root = join(storageHome, "jev-workflow");
  privateDirectory(root);
  const directory = mkdtempSync(join(root, "selection-"));
  const path = join(directory, "selection.json");
  writeNew(join(directory, "input.txt"), source.source.input);
  const freezeEvidence = (prefix: string, refs: VerifiedEvidence[]) => refs.map((ref, index) => {
    const file = `${prefix}-${index + 1}.bin`;
    writeNew(join(directory, file), ref.content);
    return { ...evidenceReferences([ref])[0], retainedPath: file };
  });
  const snapshots = freezeEvidence("decision-evidence", evidence);
  const evidenceBytes = JSON.stringify({ schema: 1, evidenceRefs: snapshots }, null, 2) + "\n";
  const evidenceSha256 = sha256(evidenceBytes);
  writeNew(join(directory, "evidence.json"), evidenceBytes);
  writeNew(path, source.bytes);
  const verifyRetained = (linked?: { path: string; sha256: string }) => {
    if (sha256(readFileSync(path)) !== source.sha256 || sha256(readFileSync(join(directory, "input.txt"))) !== source.source.inputSha256)
      throw new Error("Retained decision-time source changed");
    if (sha256(readFileSync(join(directory, "evidence.json"))) !== evidenceSha256) throw new Error("Retained evidence mapping changed");
    for (const ref of snapshots) if (sha256(readFileSync(join(directory, ref.retainedPath))) !== ref.sha256)
      throw new Error("Retained decision evidence changed");
    if (linked) {
      const bytes = readFileSync(linked.path);
      if (sha256(bytes) !== linked.sha256) throw new Error("Retained engineering record changed");
      for (const ref of JSON.parse(bytes.toString("utf8")).evidenceRefs)
        if (sha256(readFileSync(join(directory, ref.retainedPath))) !== ref.sha256) throw new Error("Retained engineering evidence changed");
    }
  };
  return {
    path,
    verifyRetained,
    linkOutcome(candidate: string, refs: VerifiedEvidence[], toolCallId: string, assertLinkCurrent: () => void, candidateObservation?: CandidateObservation) {
      assertLinkCurrent();
      verifyRetained();
      // Selection identity comes from this retained closure, never a caller-chosen path.
      const identity = { candidate, evidenceRefs: evidenceReferences(refs) };
      const key = sha256(JSON.stringify(identity));
      const evidenceRefs = freezeEvidence(`engineering-${key}`, refs);
      const result = {
        schema: 1, kind: "skill-harness-engineering-evidence-v1",
        source: { path: "selection.json", sha256: source.sha256, inputSha256: source.source.inputSha256 },
        sessionId: source.source.sessionId, toolCallId, candidate,
        recordedAt: new Date().toISOString(), evidenceRefs,
        candidateIdentity: candidateObservation ? "principal-runtime-observed" : "caller-claimed",
        candidateObservation: candidateObservation ?? null,
        sourceBinding: "local-reference-digests-verified", independence: "unassessed",
        trainingEligible: false, exportEligible: false, labelStatus: "unlabeled",
      };
      const outputPath = join(directory, `engineering-${key}.json`);
      writeNew(outputPath, JSON.stringify(result, null, 2) + "\n");
      return { path: outputPath, sha256: sha256(JSON.stringify(result, null, 2) + "\n") };
    },
    writeOutcome(outcome: unknown) {
      assertCurrent();
      writeNew(join(directory, "outcome.json"), JSON.stringify({
        schema: 2, kind: "skill-harness-decision-advice-v2",
        source: { path: "selection.json", sha256: source.sha256 },
        recordedAt: new Date().toISOString(), outcome,
        trainingEligible: false, exportEligible: false, labelStatus: "unlabeled",
      }, null, 2) + "\n");
    },
  };
}
