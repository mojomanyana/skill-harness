import { createHash } from "node:crypto";
import { closeSync, fsyncSync, lstatSync, mkdirSync, mkdtempSync, openSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const JEV_PROVIDER = "jev";
export const JEV_MODEL = "typesafe/jev-1.13";
export const JEV_WORKFLOW_LIMIT = 3;
export const JEV_QUESTION = "Does this handoff account for every explicitly required acceptance check with successful evidence tied to the reported candidate?";
export const JEV_SOURCE_KIND = "skill-harness-selected-handoff-v1";

export interface HandoffPacket {
  candidate: string;
  requirements: string;
  evidence: string;
}

const digest = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

export function requireIdentity(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > 256)
    throw new Error(`${name} must be a nonempty runtime identity of at most 256 characters`);
}

/** Construct the exact outbound input, with stable field order and no caller-selected question. */
export function prepareHandoff(value: HandoffPacket) {
  for (const field of ["candidate", "requirements", "evidence"] as const) {
    if (typeof value[field] !== "string" || !value[field].trim() || value[field].length > 32000)
      throw new Error(`${field} must be a nonempty bounded string`);
    // Hashing/reconstructing malformed UTF-16 would silently replace input bytes.
    if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value[field]))
      throw new Error(`${field} must contain valid Unicode`);
  }
  const input = JSON.stringify({
    candidate: value.candidate, requirements: value.requirements, evidence: value.evidence,
  });
  if (Array.from(input).length > 16000)
    throw new Error("The complete selected handoff packet must not exceed 16000 characters");
  return Object.freeze({ input, question: JEV_QUESTION, inputSha256: digest(input) });
}

export function createHandoffSource(options: {
  packet: ReturnType<typeof prepareHandoff>;
  sessionId: string;
  toolCallId: string;
  consent: unknown;
  authorization: unknown;
}) {
  requireIdentity(options.sessionId, "Pi sessionId");
  requireIdentity(options.toolCallId, "Pi toolCallId");
  const source = {
    schema: 1,
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
    candidateIdentity: "caller-claimed",
    sourceBinding: "unassessed",
    redaction: "unassessed",
    rights: "unassessed",
    labelStatus: "unlabeled",
    trainingEligible: false,
    exportEligible: false,
    publicCaptureVerified: false,
  };
  const bytes = JSON.stringify(source, null, 2) + "\n";
  return Object.freeze({ source, bytes, sha256: digest(bytes) });
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

function writeNew(path: string, bytes: string) {
  const fd = openSync(path, "wx", 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); }
  finally { closeSync(fd); }
}

/** No project-relative path, transcript lookup, capture claim or dataset-import side effect. */
export function retainHandoffSource(
  source: ReturnType<typeof createHandoffSource>,
  assertCurrent: () => void,
  storageHome = join(homedir(), ".skill-harness"),
) {
  assertCurrent();
  privateDirectory(storageHome);
  const root = join(storageHome, "jev-workflow");
  privateDirectory(root);
  const directory = mkdtempSync(join(root, "selection-"));
  const path = join(directory, "selection.json");
  writeNew(path, source.bytes);
  return {
    path,
    writeOutcome(outcome: unknown) {
      assertCurrent();
      writeNew(join(directory, "outcome.json"), JSON.stringify({
        schema: 1, kind: "skill-harness-handoff-advice-v1",
        source: { path: "selection.json", sha256: source.sha256 },
        recordedAt: new Date().toISOString(), outcome,
        trainingEligible: false, exportEligible: false, labelStatus: "unlabeled",
      }, null, 2) + "\n");
    },
  };
}
