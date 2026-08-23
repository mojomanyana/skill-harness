#!/usr/bin/env node
/**
 * Direct vendored-contract conformance check.
 *
 * Free, offline, no model or judge calls. It reads pi-daddy's four canonical builder
 * fixtures, closed schema, and byte-pinned refusal source, runs the fixtures through
 * the adapter, and reports the artifact digests it used — so the claim "the harness accepts the producer's
 * contract" can be checked in one command instead of inferred from a test summary.
 *
 *   node scripts/check-pi-daddy-contract.mjs                       # vendored copy
 *   node scripts/check-pi-daddy-contract.mjs ../pi-daddy           # against a real checkout
 *   node scripts/check-pi-daddy-contract.mjs ../pi-daddy <commit>  # a specific commit
 *
 * With a checkout it reads the artifact out of git (never the working tree) and
 * compares those bytes to the vendored digests, which is what makes this a
 * producer-consumer check rather than a self-consistency one.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACT = join(REPO, "contracts", "pi-daddy", "ledger", "v2");
const SOURCE_DIR = "packages/pi-daddy/contracts/ledger/v2";
const FIXTURES = ["capability-decision", "workspace-lease", "child-lifecycle", "check-receipt"];

const [checkout, commitArg] = process.argv.slice(2);
const pinned = JSON.parse(readFileSync(join(CONTRACT, "PINNED.json"), "utf8"));
const commit = commitArg ?? pinned.commit;
const sha256 = (text) => createHash("sha256").update(text).digest("hex");

const read = (relative) => {
  if (!checkout) return readFileSync(join(CONTRACT, relative), "utf8");
  const source = pinned.artifacts[relative]?.source ?? `${SOURCE_DIR}/${relative}`;
  return execFileSync("git", ["-C", checkout, "show", `${commit}:${source}`], { encoding: "utf8" });
};

const dist = join(REPO, "packages", "adapters", "dist", "trajectory.js");
const distSchema = join(REPO, "packages", "adapters", "dist", "pi-daddy-ledger-v2.js");
if (!existsSync(dist) || !existsSync(distSchema)) {
  console.error("build first: npm run build");
  process.exit(2);
}
const { normalizePiDaddyLedger, V2_REFUSAL_CODES } = await import(pathToFileURL(dist).href);
const { PI_DADDY_LEDGER_V2_SCHEMA_SHA256, PI_DADDY_CONTRACT_COMMIT } = await import(pathToFileURL(distSchema).href);

let failures = 0;
const fail = (message) => { failures += 1; console.log(`  ✗ ${message}`); };

console.log(`pi-daddy ledger v2 contract — ${checkout ? `${checkout} @ ${commit}` : `vendored copy of ${commit}`}`);

console.log("\nartifact digests");
for (const [relative, entry] of Object.entries(pinned.artifacts)) {
  const digest = sha256(read(relative));
  const ok = digest === entry.sha256;
  console.log(`  ${ok ? "✓" : "✗"} ${digest}  ${relative}`);
  if (!ok) fail(`${relative} does not match the pinned digest ${entry.sha256}`);
}

// Digesting the vendored files while validating with a stale build would print six
// green checks about bytes nothing under test had read. The compiled schema has to be
// the pinned one, or this check is not measuring what it claims.
console.log("\nbuilt adapter");
if (PI_DADDY_LEDGER_V2_SCHEMA_SHA256 === pinned.schema_sha256 && PI_DADDY_CONTRACT_COMMIT === pinned.commit) {
  console.log(`  ✓ dist schema and producer commit are the pinned artifacts (${PI_DADDY_CONTRACT_COMMIT.slice(0, 12)})`);
} else {
  fail(`dist was built from a different contract (${PI_DADDY_CONTRACT_COMMIT} / ${PI_DADDY_LEDGER_V2_SCHEMA_SHA256}); run npm run build`);
}

console.log("\nrefusal vocabulary");
const schema = JSON.parse(read("ledger-event.schema.json"));
const producerCodes = [...schema.$defs.refusalCode.enum].sort();
const consumerCodes = [...V2_REFUSAL_CODES].sort();
if (JSON.stringify(producerCodes) === JSON.stringify(consumerCodes)) {
  console.log(`  ✓ ${producerCodes.length} codes, no drift (GRANT_ID_MALFORMED ${producerCodes.includes("GRANT_ID_MALFORMED") ? "present" : "ABSENT"})`);
} else {
  fail(`refusal vocabulary drift: producer-only ${producerCodes.filter((code) => !consumerCodes.includes(code)).join(", ") || "none"}; consumer-only ${consumerCodes.filter((code) => !producerCodes.includes(code)).join(", ") || "none"}`);
}

// A positive-only check cannot tell "the gate ran" from "the gate is gone": a `dist`
// built before the closed-schema gate existed accepts all four fixtures and every
// digest above still prints green. So assert a refusal too — this is the exact record
// that rode through before the pin, and it must not any more.
console.log("\nnegative control");
try {
  const smuggled = { ...JSON.parse(read(join("fixtures", "workspace-lease.json"))), assuranceScope: "smuggled" };
  normalizePiDaddyLedger(`${JSON.stringify(smuggled)}\n`);
  fail("an undeclared top-level field was ACCEPTED — the closed-contract gate is not in the built adapter");
} catch (error) {
  if (/closed contract violation/.test(error.message)) {
    console.log("  ✓ undeclared top-level field refused by the closed-contract gate");
  } else if (error.message.startsWith("  ✗")) {
    throw error;
  } else {
    fail(`undeclared field was rejected, but not by the contract gate: ${error.message}`);
  }
}

console.log("\ncanonical fixtures");
for (const name of FIXTURES) {
  const record = JSON.parse(read(join("fixtures", `${name}.json`)));
  try {
    const events = normalizePiDaddyLedger(`${JSON.stringify(record)}\n`);
    console.log(`  ✓ ${name} → ${events.map((event) => event.type).join(", ")}`);
    if (name === "check-receipt") {
      const [event] = events;
      const measured = Boolean(record.treeSha) && event.digests?.tree === record.treeSha;
      const label = Boolean(record.correlation?.tree_sha) && event.digests?.correlation_tree === record.correlation.tree_sha;
      console.log(`    ${measured && label ? "✓" : "✗"} digests.tree=${event.digests?.tree} (receipt)  digests.correlation_tree=${event.digests?.correlation_tree} (label)`);
      if (!measured) fail("digests.tree did not come from the receipt's top-level treeSha");
      if (!label) fail("correlation.tree_sha was not preserved as non-authoritative metadata");
    }
  } catch (error) {
    fail(`${name} rejected: ${error.message}`);
  }
}

console.log(failures === 0
  ? "\n4/4 canonical fixtures accepted; no vocabulary or digest drift. No model or judge calls."
  : `\n${failures} conformance failure(s).`);
process.exit(failures === 0 ? 0 : 1);
