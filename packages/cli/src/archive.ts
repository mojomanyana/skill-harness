import { ingestPolicySource, inspectPolicyCheckpoint, observeArchiveSource } from "@skill-harness/adapters";
import type { Args } from "./cli.js";
import { cmdArchiveLearning } from "./archive-learning.js";

/** Explicit file ingestion/metadata inspection only; never launches a worker or publishes content. */
export async function cmdArchive(args: Args): Promise<void> {
  const operation = args._[0];
  if (operation === "weekly" || operation === "trust" || operation === "access") { cmdArchiveLearning(args); return; }
  if (operation === "watch") {
    if (args._.length !== 1 || Object.keys(args.flags).some(key => !["policy", "source", "previous", "interval-ms", "max-polls"].includes(key))) throw new Error("unsupported archive watch option");
    const required = (key: string) => { const value = args.flags[key]; if (typeof value !== "string" || !value) throw new Error(`archive watch requires --${key}`); return value; };
    const signal = new AbortController(), abort = () => signal.abort();
    process.on("SIGINT", abort); process.on("SIGTERM", abort);
    try {
      const result = await observeArchiveSource({ policyPath: required("policy"), sourceId: required("source"),
        previousCheckpointId: args.flags.previous === undefined ? undefined : required("previous"),
        intervalMs: args.flags["interval-ms"] === undefined ? 1000 : Number(required("interval-ms")), maxPolls: Number(required("max-polls")), signal: signal.signal,
        onObservation: observation => console.log(JSON.stringify({ checkpointId: observation.checkpointId, policySha256: observation.policySha256, syntax: observation.syntax })),
      });
      console.log(JSON.stringify(result));
    } finally { process.removeListener("SIGINT", abort); process.removeListener("SIGTERM", abort); }
    return;
  }
  if (args._.length !== 1 || !["ingest", "inspect"].includes(operation)) {
    throw new Error("usage: archive ingest|inspect --policy <file> --source <id> [--previous <checkpoint> | --checkpoint <id>]");
  }
  const allowed = operation === "ingest" ? ["policy", "source", "previous"] : ["policy", "source", "checkpoint"];
  for (const key of Object.keys(args.flags)) if (!allowed.includes(key)) throw new Error(`unsupported archive option: ${key}`);
  const required = (key: string) => {
    const value = args.flags[key];
    if (typeof value !== "string" || !value) throw new Error(`archive requires --${key}`);
    return value;
  };
  const policy = required("policy"), source = required("source");
  const result = operation === "ingest"
    ? ingestPolicySource(policy, source, args.flags.previous === undefined ? undefined : required("previous"))
    : inspectPolicyCheckpoint(policy, source, required("checkpoint"));
  // Successful storage/reporting is not successful work: missing/partial fields are never promoted to acceptance.
  console.log(JSON.stringify(result, null, 2));
}
