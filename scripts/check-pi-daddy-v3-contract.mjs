#!/usr/bin/env node
/** Free/offline direct conformance check for the separately pinned v3 adapter. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACT = join(REPO, "contracts", "pi-daddy", "ledger", "v3");
const pinned = JSON.parse(readFileSync(join(CONTRACT, "PINNED.json"), "utf8"));
const dist = join(REPO, "packages", "adapters", "dist");
if (!existsSync(join(dist, "trajectory.js")) || !existsSync(join(dist, "pi-daddy-ledger-v3.js"))) {
  console.error("build first: npm run build");
  process.exit(2);
}
const adapter = await import(pathToFileURL(join(dist, "trajectory.js")).href);
const runtime = await import(pathToFileURL(join(dist, "pi-daddy-ledger-v3.js")).href);
const sha = (value) => createHash("sha256").update(value).digest("hex");
let failures = 0;
const fail = (message) => { failures += 1; console.log(`  ✗ ${message}`); };
console.log(`pi-daddy ledger v3 contract — vendored ${pinned.repository} @ ${pinned.commit}`);
for (const [relative, artifact] of Object.entries(pinned.artifacts)) {
  const digest = sha(readFileSync(join(CONTRACT, relative)));
  if (digest === artifact.sha256) console.log(`  ✓ ${digest}  ${relative}`);
  else fail(`${relative} digest mismatch`);
}
if (runtime.PI_DADDY_LEDGER_V3_CONTRACT_COMMIT !== pinned.commit || runtime.PI_DADDY_LEDGER_V3_SCHEMA_SHA256 !== pinned.schema_sha256) {
  fail("built adapter does not carry the pinned v3 commit/schema");
} else console.log("  ✓ built adapter carries the pinned v3 commit/schema");
const fixtures = ["capability-decision", "workspace-lease", "child-lifecycle", "check-receipt", "workflow-fact"];
for (const name of fixtures) {
  const record = JSON.parse(readFileSync(join(CONTRACT, "fixtures", `${name}.json`), "utf8"));
  try {
    const events = adapter.normalizePiDaddyLedgerV3(`${JSON.stringify(record)}\n`);
    if (!events.length || events.some((event) => event.source !== "pi-daddy-v3")) fail(`${name} was empty or lossily reinterpreted`);
    else if (record.event !== "workflow_fact" && events.some((event) => event.execution_id !== record.executionId || event.parent_execution_id !== record.parentExecutionId)) fail(`${name} lost execution ancestry`);
    else if (record.event === "workflow_fact" && events[0].workflow_fact_id !== record.factId) fail(`${name} lost workflow fact identity`);
    else if (record.blocked && events.some((event) => event.type === "capability_granted")) fail(`${name} turned a refusal into a grant`);
    else console.log(`  ✓ ${name} → ${events.map((event) => event.type).join(", ")}`);
  } catch (error) { fail(`${name} rejected: ${error.message}`); }
}
try {
  const record = JSON.parse(readFileSync(join(CONTRACT, "fixtures", "child-lifecycle.json"), "utf8"));
  delete record.executionId;
  adapter.normalizePiDaddyLedgerV3(`${JSON.stringify(record)}\n`);
  fail("missing executionId negative control was accepted");
} catch (error) {
  if (/executionId/.test(error.message)) console.log("  ✓ missing execution occurrence identity fails closed");
  else fail(`negative control failed for the wrong reason: ${error.message}`);
}
console.log(failures === 0
  ? "\n5/5 real-builder canonical fixtures accepted; occurrence, refusal, and closed-schema controls active. No model or judge calls."
  : `\n${failures} ledger-v3 conformance failure(s).`);
process.exit(failures ? 1 : 0);
