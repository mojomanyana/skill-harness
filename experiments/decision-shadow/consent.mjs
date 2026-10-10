import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin, stderr } from "node:process";
import { openSync, writeFileSync, fsyncSync, closeSync } from "node:fs";
import {
  createStorageConsent,
  parseStorageConsent,
  learningDigest,
} from "./learning-data.mjs";
export const STORAGE_QUESTION =
  "Retain this session’s explicitly selected inputs and questions for future LoRA dataset review? This grants storage only, not training or use of JEV predictions as labels.";
export async function requestSessionStorage({
  sessionId = randomUUID(),
  storage,
  promptStorage,
  storageRoot,
} = {}) {
  let answer = storage;
  const question = STORAGE_QUESTION + (storageRoot ? ` Local collection root: ${storageRoot}.` : "");
  if (answer === undefined) {
    if (promptStorage) answer = await promptStorage(question);
    else {
      if (!stdin.isTTY || !stderr.isTTY)
        throw Error(
          "JEV activation requires this session’s storage choice: --storage yes|no (no inherited preference).",
        );
      const rl = createInterface({ input: stdin, output: stderr });
      try {
        answer = /^(y|yes)$/i.test(
          (await rl.question(question + " [y/N] ")).trim(),
        )
          ? "yes"
          : "no";
      } finally {
        rl.close();
      }
    }
  }
  if (answer === true) answer = "yes";
  if (answer === false || answer === null) answer = "no";
  if (!["yes", "no"].includes(answer))
    throw Error("--storage must be yes or no");
  return createStorageConsent({
    sessionId,
    decision: answer === "yes" ? "granted" : "declined",
    interactionId: randomUUID(),
    recordedAt: new Date().toISOString(),
  });
}
export async function retainSelectedSessionData({
  cases,
  consent,
  out,
  assertCurrent = () => {},
}) {
  consent = parseStorageConsent(consent, consent.sessionId);
  if (consent.decision === "declined")
    return {
      retained: false,
      reason: "session-storage-declined",
      trainingReady: false,
    };
  const document = {
    schema: 1,
    kind: "decision-session-selected-data",
    sessionId: consent.sessionId,
    consent,
    consentSha256: learningDigest(consent),
    trainingReady: false,
    trainingEligible: false,
    labelStatus: "unlabeled",
    providerOutputsIncluded: false,
    cases: cases.map(({ hash, ...c }) => ({ caseHash: hash, ...c })),
  };
  // Keep the final consent check and local retention in the same event-loop turn.
  // A concurrent disable/re-enable cannot slip between permission and writing bytes.
  assertCurrent();
  const fd = openSync(out, "wx", 0o600);
  try {
    writeFileSync(fd, JSON.stringify(document, null, 2) + "\n");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  return { retained: true, path: out, trainingReady: false };
}
