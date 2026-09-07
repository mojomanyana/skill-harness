import { ingestPolicySource, inspectPolicyCheckpoint } from "@skill-harness/adapters";
import type { Args } from "./cli.js";

/** Explicit file ingestion/metadata inspection only; never launches a worker or publishes content. */
export function cmdArchive(args: Args): void {
  const operation = args._[0];
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
