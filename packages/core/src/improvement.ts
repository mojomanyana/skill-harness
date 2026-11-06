import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { readAuthoring } from "./authoring.js";

export interface ImprovementInput {
  change: string;
  appliesWhen: string;
  doesNotApplyWhen: string;
  reconsiderWhen: string;
  evidence: { reference: unknown; excerptSha256: string; bytes: number };
}
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  );
const bounded = (value: unknown, label: string): string => {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    Buffer.byteLength(value) > 2000 ||
    /[\x00-\x08\x0b\x0c\x0e-\x1f]/u.test(value)
  )
    throw Error(`Invalid ${label}`);
  return value;
};
function noLinks(path: string) {
  for (let selected = resolve(path); ; selected = dirname(selected)) {
    try {
      if (lstatSync(selected).isSymbolicLink())
        throw Error("Improvement storage cannot follow symlinks");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (dirname(selected) === selected) break;
  }
}
function boundedFile(path: string) {
  noLinks(path);
  const fd = openSync(
    path,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0),
  );
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.size > 1024 * 1024)
      throw Error("Improvement target must be a bounded regular file");
    const buffer = Buffer.alloc(Number(info.size) + 1);
    let size = 0;
    while (size < buffer.length) {
      const count = readSync(fd, buffer, size, buffer.length - size, null);
      if (!count) break;
      size += count;
    }
    const after = fstatSync(fd),
      named = lstatSync(path);
    if (
      size !== info.size ||
      after.size !== info.size ||
      after.mtimeMs !== info.mtimeMs ||
      named.ino !== info.ino ||
      named.dev !== info.dev ||
      named.isSymbolicLink()
    )
      throw Error("Improvement target changed during read");
    return buffer.subarray(0, size);
  } finally {
    closeSync(fd);
  }
}
function exactKeys(value: unknown, keys: string[]): asserts value is Record<string, any> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join("|") !== [...keys].sort().join("|")
  )
    throw Error("Invalid improvement record shape");
}
/** Only opaque Bookie handles may survive inspection after source access changes. */
function validateReference(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid evidence reference");
  const ref = value as Record<string, unknown>;
  const digest = (id: unknown) => typeof id === "string" && /^sha256:[a-f0-9]{64}(?![\s\S])/.test(id);
  if (ref.kind === "context") {
    exactKeys(
      ref,
      ref.inputIds === undefined ? ["kind", "bundleId"] : ["kind", "bundleId", "inputIds"],
    );
    if (!digest(ref.bundleId)) throw Error("Invalid evidence context identity");
    if (
      ref.inputIds !== undefined &&
      (!Array.isArray(ref.inputIds) ||
        ref.inputIds.length < 1 ||
        ref.inputIds.length > 16 ||
        new Set(ref.inputIds).size !== ref.inputIds.length ||
        ref.inputIds.some(
          (id) => typeof id !== "string" || !/^(?:PRJ|TSK|DOC|RSC|DSN|ACT|EVD|PER)-[0-7][0-9A-HJKMNP-TV-Z]{25}(?![\s\S])/.test(id),
        ))
    ) {
      throw Error("Invalid evidence input identity");
    }
  } else if (ref.kind === "producer") {
    exactKeys(ref, ["kind", "registrationId", "part"]);
    if (
      !digest(ref.registrationId) ||
      !["final", "partial", "manifest"].includes(ref.part as string)
    )
      throw Error("Invalid evidence producer identity");
  } else {
    throw Error("Unsupported evidence reference");
  }
}
function validateStored(proposal: any, name: string, skillPath: string) {
  exactKeys(proposal, [
    "schema",
    "purpose",
    "name",
    "target",
    "change",
    "appliesWhen",
    "doesNotApplyWhen",
    "reconsiderWhen",
    "evidence",
    "untrusted",
    "accepted",
    "modelQualityEvaluated",
    "trainingEligible",
  ]);
  exactKeys(proposal.target, ["path", "sha256"]);
  exactKeys(proposal.evidence, ["reference", "excerptSha256", "bytes"]);
  if (
    proposal.schema !== 1 ||
    proposal.purpose !== "skill-improvement-proposal" ||
    proposal.name !== name ||
    proposal.target.path !== skillPath ||
    !/^[a-f0-9]{64}$/.test(proposal.target.sha256) ||
    proposal.untrusted !== true ||
    proposal.accepted !== false ||
    proposal.modelQualityEvaluated !== false ||
    proposal.trainingEligible !== false
  )
    throw Error("Invalid improvement record or approval claim");
  for (const key of ["change", "appliesWhen", "doesNotApplyWhen", "reconsiderWhen"])
    bounded(proposal[key], key);
  if (
    !/^[a-f0-9]{64}$/.test(proposal.evidence.excerptSha256) ||
    !Number.isSafeInteger(proposal.evidence.bytes) ||
    proposal.evidence.bytes < 1 ||
    proposal.evidence.bytes > 24000 ||
    Buffer.byteLength(stable(proposal.evidence.reference) ?? "") > 4096
  )
    throw Error("Invalid improvement evidence");
  validateReference(proposal.evidence.reference);
}

/** Records a proposal only. It does not change a skill, authoring answers, labels or adoption state. */
export function recordImprovementProposal(root: string, name: string, input: ImprovementInput) {
  const state = readAuthoring(root, name);
  const skillPath = join(state.skillDir, "SKILL.md");
  const targetSha256 = sha(boundedFile(skillPath));
  if (
    !input.evidence ||
    !/^[a-f0-9]{64}$/.test(input.evidence.excerptSha256) ||
    !Number.isSafeInteger(input.evidence.bytes) ||
    input.evidence.bytes < 1 ||
    input.evidence.bytes > 24000
  )
    throw Error("Improvement requires bounded exact evidence identity");
  validateReference(input.evidence.reference);
  const reference = stable(input.evidence.reference);
  if (!reference || Buffer.byteLength(reference) > 4096)
    throw Error("Evidence reference exceeds bound");
  const body = {
    schema: 1,
    purpose: "skill-improvement-proposal",
    name,
    target: { path: skillPath, sha256: targetSha256 },
    change: bounded(input.change, "change"),
    appliesWhen: bounded(input.appliesWhen, "applicability"),
    doesNotApplyWhen: bounded(input.doesNotApplyWhen, "exclusions"),
    reconsiderWhen: bounded(input.reconsiderWhen, "reconsideration"),
    evidence: {
      reference: JSON.parse(reference),
      excerptSha256: input.evidence.excerptSha256,
      bytes: input.evidence.bytes,
    },
    untrusted: true,
    accepted: false,
    modelQualityEvaluated: false,
    trainingEligible: false,
  };
  const bytes = stable(body) + "\n",
    id = sha(bytes);
  const directory = join(resolve(root), ".skill-harness", "authoring", name, "improvements");
  noLinks(directory);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, id + ".json");
  let status = "recorded";
  try {
    writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if (!boundedFile(file).equals(Buffer.from(bytes)))
      throw Error("Existing improvement record conflicts");
    status = "reused";
  }
  return {
    status,
    id,
    path: file,
    proposal: body,
    providerCalls: 0,
    next: "Use the existing authoring draft, calibration, comparison and explicit adoption workflow. Reuse only evidence whose exact dependencies still match.",
  };
}

/** Reopens only this named proposal and reports whether its target still matches. No discovery scan. */
export function inspectImprovementProposal(root: string, name: string, id: string) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw Error("Invalid improvement identity");
  const state = readAuthoring(root, name),
    directory = join(resolve(root), ".skill-harness", "authoring", name, "improvements");
  const bytes = boundedFile(join(directory, id + ".json"));
  if (sha(bytes) !== id) throw Error("Improvement identity changed");
  const proposal = JSON.parse(bytes.toString("utf8"));
  validateStored(proposal, name, join(state.skillDir, "SKILL.md"));
  // Authored proposal text can derive from protected memory. Inspection exposes
  // handles and applicability status, not a second unguarded memory replay path.
  return {
    id,
    name,
    sourceReference: proposal.evidence.reference,
    targetMatches: sha(boundedFile(proposal.target.path)) === proposal.target.sha256,
    sourceCurrentness: "requires-resolver",
    adoption: "not-authorized",
    providerCalls: 0,
  };
}
