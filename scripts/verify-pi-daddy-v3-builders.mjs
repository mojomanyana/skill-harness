#!/usr/bin/env node
/**
 * Free/offline real-builder verifier for the immutable pi-daddy ledger-v3 pin.
 * Requires dependencies already installed in both checkouts. No models/network.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HARNESS = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACT = join(HARNESS, "contracts", "pi-daddy", "ledger", "v3");
const pinned = JSON.parse(readFileSync(join(CONTRACT, "PINNED.json"), "utf8"));
if (process.argv.length !== 3) {
  console.error("usage: node scripts/verify-pi-daddy-v3-builders.mjs <clean-pi-daddy-checkout>");
  process.exit(2);
}
const checkout = resolve(process.argv[2]);
if (!isAbsolute(checkout)) throw new Error("producer checkout must resolve absolutely");
const packageRoot = join(checkout, "packages", "pi-daddy");
const capture = (cwd, command, args) => execFileSync(command, args, { cwd, encoding: "utf8" }).trim();
const run = (cwd, command, args) => execFileSync(command, args, { cwd, stdio: "inherit" });
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sha = (value) => createHash("sha256").update(value).digest("hex");
const clone = (value) => JSON.parse(JSON.stringify(value));
const line = (value) => `${JSON.stringify(value)}\n`;

assert(capture(checkout, "git", ["rev-parse", "HEAD"]) === pinned.commit, "producer HEAD does not match the immutable v3 pin");
assert(capture(checkout, "git", ["rev-parse", "HEAD^{tree}"]) === pinned.tree, "producer tree does not match the immutable v3 pin");
assert(capture(checkout, "git", ["status", "--porcelain=v1", "--untracked-files=all"]) === "", "producer checkout must be clean");
for (const [relative, artifact] of Object.entries(pinned.artifacts)) {
  const source = execFileSync("git", ["-C", checkout, "show", `${pinned.commit}:${artifact.source}`], { encoding: "utf8" });
  assert(sha(source) === artifact.sha256, `${artifact.source} differs from pinned digest`);
  assert(source === readFileSync(join(CONTRACT, relative), "utf8"), `${relative} is not byte-exact producer content`);
}

console.log(`pi-daddy ledger-v3 real-builder verifier — ${pinned.repository} @ ${pinned.commit}`);
run(checkout, "npm", ["run", "build"]);
run(HARNESS, "npm", ["run", "build"]);
const ledger = await import(`${pathToFileURL(join(packageRoot, "dist", "ledger.js")).href}?pin=${pinned.commit}`);
const refusals = await import(`${pathToFileURL(join(packageRoot, "dist", "refusals.js")).href}?pin=${pinned.commit}`);
const generator = await import(`${pathToFileURL(join(packageRoot, "scripts", "generate-ledger-v3-contract.ts")).href}?pin=${pinned.commit}`);
const adapter = await import(`${pathToFileURL(join(HARNESS, "packages", "adapters", "dist", "trajectory.js")).href}?pin=${pinned.commit}`);
const runtime = await import(`${pathToFileURL(join(HARNESS, "packages", "adapters", "dist", "pi-daddy-ledger-v3.js")).href}?pin=${pinned.commit}`);
assert(runtime.PI_DADDY_LEDGER_V3_CONTRACT_COMMIT === pinned.commit, "built v3 adapter carries a different producer commit");
assert(runtime.PI_DADDY_LEDGER_V3_SCHEMA_SHA256 === pinned.schema_sha256, "built v3 adapter carries a different schema digest");

let positive = 0;
let negative = 0;
const normalize = (label, built) => {
  const record = clone(built);
  const events = adapter.normalizePiDaddyLedger(line(record));
  assert(events.length > 0, `${label}: no normalized events`);
  assert(events.every((event) => event.source === "pi-daddy-v3"), `${label}: v3 was reinterpreted as another version`);
  if (record.event !== "workflow_fact") {
    assert(events.every((event) => event.execution_id === record.executionId), `${label}: execution occurrence identity lost`);
    assert(events.every((event) => event.parent_execution_id === record.parentExecutionId), `${label}: parent execution identity lost`);
  } else {
    assert(events[0].workflow_fact_id === record.factId, `${label}: workflow fact identity lost`);
  }
  positive += 1;
  return { record, events };
};
const rejected = (label, record) => {
  let message = "";
  try { adapter.normalizePiDaddyLedger(line(record)); } catch (error) { message = String(error?.message ?? error); }
  assert(message.length > 0, `${label}: mutation was ACCEPTED`);
  negative += 1;
};
const execution = (index) => `exec:00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const fact = (index) => `fact:00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const resolution = (effective = [], denied = [], clipped = [], gatedBlocked = []) => ({ effective, denied, clipped, gatedBlocked, universal: [], subsumedBy: [] });
const correlation = {
  schema_version: "1.0", run_id: "run-v3-builder", task_id: "task-v3-builder", workspace_id: "workspace-v3",
  context_id: "context-v3", phase: "verify", assurance: "critical", assurance_effective: "critical",
  policy_label: "policy-v3", assurance_source: "policy", assurance_scope: { type: "selectors", selectors: ["src/**"] },
  activated_at: "2026-08-28T12:00:00.000Z", plan_digest: "1".repeat(64), definition_digest: "2".repeat(64),
  task_digest: "3".repeat(64), base_sha: "4".repeat(40), head_sha: "5".repeat(40), tree_sha: "6".repeat(40),
  event_seq: 21, last_change_seq: 18, last_authority_seq: 20, check_receipt_id: "7".repeat(64),
};
const now = (n) => new Date(Date.parse("2026-08-28T12:00:00.000Z") + n * 1000);

console.log("\nproducer-generated canonical fixtures");
const generated = generator.buildLedgerV3ContractFixtures();
for (const [name, built] of Object.entries(generated)) {
  const producerBytes = readFileSync(join(packageRoot, "contracts", "ledger", "v3", "fixtures", name), "utf8");
  const vendoredBytes = readFileSync(join(CONTRACT, "fixtures", name), "utf8");
  assert(JSON.stringify(JSON.parse(producerBytes)) === JSON.stringify(built), `${name}: committed producer fixture is not current builder output`);
  assert(producerBytes === vendoredBytes, `${name}: vendored fixture differs from builder-produced source`);
  normalize(name, built);
}
console.log(`  ✓ ${Object.keys(generated).length} canonical fixtures reproduced by production builders`);

console.log("\nproduction builder matrix");
for (const [index, code] of refusals.REFUSAL_CODES.entries()) {
  const built = ledger.buildRecord({
    executionId: execution(100 + index), parentExecutionId: null, parentId: "d0", childId: `d0.refusal.${index}`,
    depth: 1, requested: ["tool:read"], parentGrant: ["tool:read"], result: resolution([], [], ["tool:read"], []),
    blocked: true, reason: `contract-${code}`, executor: "process", taskDigest: "9".repeat(64), correlation,
    refusal: { code, message: `contract-${code}`, details: { case_index: index, retryable: false } }, now: now(index + 1),
  });
  const result = normalize(`refusal ${code}`, built);
  const refusal = result.events.find((event) => event.type === "child_spawn_refused");
  assert(refusal?.refusal_code === code, `${code}: refusal code lost`);
  assert(result.events.every((event) => event.type !== "capability_granted"), `${code}: refusal became a grant`);
}
for (const [index, outcome] of ledger.WORKSPACE_LEASE_OUTCOMES.entries()) {
  normalize(`lease ${outcome}`, ledger.buildWorkspaceLeaseEvent({
    executionId: execution(200 + index), parentExecutionId: execution(1), childId: `d0.lease.${index}`,
    workspaceId: "workspace-v3", root: "/work/v3", access: index % 2 ? "read" : "write", outcome,
    recovered: index % 3 === 0 ? false : index % 3 === 1 ? true : "unknown", correlation, now: now(100 + index),
  }));
}
for (const [index, state] of ledger.CHILD_LIFECYCLE_STATES.entries()) {
  const result = normalize(`lifecycle ${state}`, ledger.buildChildLifecycleEvent({
    executionId: execution(300 + index), parentExecutionId: execution(1), childId: `d0.lifecycle.${index}`, state,
    executor: "process", ...(["starting", "running"].includes(state) ? { deadlineAt: "2026-08-28T12:30:00.000Z" } : {}),
    ...(state === "failed" ? { exitCode: 124, signal: "SIGTERM", timedOut: true, aborted: true, truncated: true } : {}),
    correlation, now: now(120 + index),
  }));
  if (["starting", "running"].includes(state)) assert(result.events[0].deadline_at === "2026-08-28T12:30:00.000Z", `${state}: deadline lost`);
}
for (const [index, [provenance, state]] of [["planned", "pending"], ["observed", "observed"], ["controller_validated", "completed"]].entries()) {
  normalize(`workflow ${provenance}`, ledger.buildWorkflowFactEvent({
    factId: fact(400 + index), source: "principal-pi-skills", provenance, kind: "workflow_phase", subject: "review", state,
    correlation, now: now(140 + index),
  }));
}
console.log(`  ✓ ${refusals.REFUSAL_CODES.length} refusals, ${ledger.WORKSPACE_LEASE_OUTCOMES.length} leases, ${ledger.CHILD_LIFECYCLE_STATES.length} lifecycle states, and workflow facts`);

console.log("\nnon-vacuous mutations");
const baseLease = clone(generated["workspace-lease.json"]);
const baseLifecycle = clone(generated["child-lifecycle.json"]);
const baseDecision = clone(generated["capability-decision.json"]);
const baseReceipt = clone(generated["check-receipt.json"]);
rejected("version", { ...baseLease, ledgerVersion: 4 });
rejected("execution ancestry", { ...baseLifecycle, parentExecutionId: baseLifecycle.executionId });
rejected("correlation", { ...baseLease, correlation: { ...baseLease.correlation, future_field: "x" } });
const noDeadline = { ...baseLifecycle, state: "running" }; delete noDeadline.deadlineAt; rejected("lifecycle", noDeadline);
rejected("refusal", { ...baseDecision, refusal: { ...baseDecision.refusal, code: "FUTURE_REFUSAL" } });
rejected("check receipt", { ...baseReceipt, receiptId: "bad" });
rejected("tree", { ...baseReceipt, treeSha: "" });
rejected("freshness", { ...baseLease, correlation: { ...baseLease.correlation, event_seq: "21" } });
const changedTree = normalize("changed tree identity", { ...baseReceipt, treeSha: "c".repeat(40) });
assert(changedTree.events[0].digests.tree === "c".repeat(40), "tree mutation did not change normalized identity");
const changedFreshness = normalize("changed freshness identity", { ...baseLease, correlation: { ...baseLease.correlation, event_seq: 22 } });
assert(changedFreshness.events[0].attributes.event_seq === 22, "freshness mutation did not change normalized identity");
console.log(`  ✓ ${negative} fail-closed mutations plus non-vacuous tree/freshness identity changes`);

console.log("\nlegacy compatibility");
const v2 = JSON.parse(readFileSync(join(HARNESS, "contracts", "pi-daddy", "ledger", "v2", "fixtures", "workspace-lease.json"), "utf8"));
assert(adapter.normalizePiDaddyLedger(line(v2)).every((event) => event.source === "pi-daddy-v2"), "frozen v2 dispatch changed");
const legacy = ledger.buildRecord({ parentId: "d0", childId: "d0.legacy", depth: 1, requested: ["tool:read"], parentGrant: ["tool:read"], result: resolution(["tool:read"]), blocked: false, executor: "process", now: now(200) });
assert(adapter.normalizePiDaddyLedger(line(clone(legacy))).every((event) => event.source === "pi-daddy-0.17"), "unversioned 0.17 dispatch changed");
console.log("  ✓ frozen v2 and unversioned 0.17 remain readable");

assert(capture(checkout, "git", ["status", "--porcelain=v1", "--untracked-files=all"]) === "", "producer build changed its clean checkout");
console.log(`\nPASS — ${positive} real-builder positive cases, ${negative} fail-closed mutations; v3 occurrence/joins preserved. No model or judge calls.`);
