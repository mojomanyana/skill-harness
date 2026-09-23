import type { Args } from "./cli.js";
import { cmdArchiveLearning } from "./archive-learning.js";

/** Retained learning and consent lifecycle; no worker or model calls. */
export async function cmdArchive(args: Args): Promise<void> {
  const operation = args._[0];
  if (operation === "weekly" || operation === "trust" || operation === "access") {
    cmdArchiveLearning(args);
    return;
  }
  throw new Error("usage: archive weekly|trust|access --state /private/dir --request file");
}
