#!/usr/bin/env node
/**
 * Free/offline producer-consumer verifier for the immutable pi-daddy v2 pin.
 *
 * Prerequisite: dependencies already installed in both checkouts (`npm ci`). The
 * verifier performs no network fetch. It verifies a clean producer checkout at the
 * exact pin, builds both repositories, imports pi-daddy's production builders and
 * REFUSAL_CODES, validates builder output against the pinned schema, and normalizes
 * every case through the built skill-harness adapter.
 *
 *   node scripts/verify-pi-daddy-builders.mjs /path/to/pi-daddy
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HARNESS = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACT = join(HARNESS, "contracts", "pi-daddy", "ledger", "v2");
const pinned = JSON.parse(readFileSync(join(CONTRACT, "PINNED.json"), "utf8"));
const rawArgs = process.argv.slice(2);
const writeRegressionFixture = rawArgs.includes("--write-regression-fixture");
const [checkoutArg, ...extraArgs] = rawArgs.filter((arg) => arg !== "--write-regression-fixture");
if (!checkoutArg || extraArgs.length > 0) {
  console.error("usage: node scripts/verify-pi-daddy-builders.mjs <clean-pi-daddy-checkout> [--write-regression-fixture]");
  process.exit(2);
}
const checkout = resolve(checkoutArg);
const workspaceRefusalFixture = join(HARNESS, "packages", "adapters", "test", "fixtures", "governance", "pi-daddy-v2-workspace-not-authorized.jsonl");
const producerPackage = join(checkout, "packages", "pi-daddy");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const command = (cwd, file, args, options = {}) => execFileSync(file, args, { cwd, encoding: "utf8", stdio: options.capture ? "pipe" : "inherit" });
const capture = (cwd, file, args) => command(cwd, file, args, { capture: true }).trim();
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const clone = (value) => JSON.parse(JSON.stringify(value));
const line = (value) => `${JSON.stringify(value)}\n`;

assert(isAbsolute(checkout), "producer checkout path must resolve absolutely");
const head = capture(checkout, "git", ["rev-parse", "HEAD"]);
assert(head === pinned.commit, `pi-daddy checkout is at ${head}; expected immutable pin ${pinned.commit}`);
const dirtyBefore = capture(checkout, "git", ["status", "--porcelain=v1", "--untracked-files=all"]);
assert(dirtyBefore === "", "pi-daddy checkout must be clean before verification");

for (const [relative, artifact] of Object.entries(pinned.artifacts)) {
  const sourceBytes = command(checkout, "git", ["show", `${pinned.commit}:${artifact.source}`], { capture: true });
  const vendoredBytes = readFileSync(join(CONTRACT, relative), "utf8");
  assert(sha256(sourceBytes) === artifact.sha256, `${artifact.source} differs from pinned digest ${artifact.sha256}`);
  assert(sourceBytes === vendoredBytes, `${relative} is not the byte-exact producer artifact`);
}
assert(pinned.schema_sha256 === pinned.artifacts["ledger-event.schema.json"].sha256, "top-level schema digest disagrees with artifact digest");

console.log(`pi-daddy real-builder verifier — ${pinned.repository} @ ${pinned.commit}`);
console.log("\nbuilds");
command(checkout, "npm", ["run", "build"]);
console.log("  ✓ pi-daddy built");
command(HARNESS, "npm", ["run", "build"]);
console.log("  ✓ skill-harness built");

const producerRequire = createRequire(join(producerPackage, "package.json"));
const typeboxCompiler = await import(pathToFileURL(producerRequire.resolve("typebox/compile")).href);
const producerSchemaValidator = typeboxCompiler.Compile(JSON.parse(readFileSync(join(CONTRACT, "ledger-event.schema.json"), "utf8")));
const ledger = await import(`${pathToFileURL(join(producerPackage, "dist", "ledger.js")).href}?pin=${pinned.commit}`);
const delegation = await import(`${pathToFileURL(join(producerPackage, "dist", "delegate.js")).href}?pin=${pinned.commit}`);
const refusals = await import(`${pathToFileURL(join(producerPackage, "dist", "refusals.js")).href}?pin=${pinned.commit}`);
const adapter = await import(`${pathToFileURL(join(HARNESS, "packages", "adapters", "dist", "trajectory.js")).href}?pin=${pinned.commit}`);
const schemaRuntime = await import(`${pathToFileURL(join(HARNESS, "packages", "adapters", "dist", "pi-daddy-ledger-v2.js")).href}?pin=${pinned.commit}`);
const schemaValidator = await import(`${pathToFileURL(join(HARNESS, "packages", "adapters", "dist", "closed-schema.js")).href}?pin=${pinned.commit}`);
const schema = schemaRuntime.PI_DADDY_LEDGER_V2_SCHEMA;
const knownFieldNames = schemaValidator.declaredPropertyNames(schema);
schemaValidator.assertSupportedSchema(schema, "pinned pi-daddy ledger v2 schema");
assert(schemaRuntime.PI_DADDY_CONTRACT_COMMIT === pinned.commit, "built adapter carries a different producer pin");
assert(schemaRuntime.PI_DADDY_LEDGER_V2_SCHEMA_SHA256 === pinned.schema_sha256, "built adapter carries a different schema digest");

const schemaCodes = [...schema.$defs.refusalCode.enum];
assert(JSON.stringify([...refusals.REFUSAL_CODES].sort()) === JSON.stringify([...schemaCodes].sort()), "production REFUSAL_CODES has drifted from the pinned schema");
assert(JSON.stringify([...adapter.V2_REFUSAL_CODES].sort()) === JSON.stringify([...schemaCodes].sort()), "adapter refusal vocabulary has drifted from the pinned schema");

const correlation = {
  schema_version: "1.0",
  run_id: "run-builder-contract-001",
  task_id: "task-builder-contract-001",
  workspace_id: "workspace-builder-contract",
  context_id: "context-builder-contract",
  phase: "verify",
  assurance: "critical",
  assurance_effective: "critical",
  policy_label: "policy-builder-contract",
  assurance_source: "policy",
  assurance_scope: { kind: "changed-files", paths: ["src/**"], include_untracked: true },
  activated_at: "2026-08-20T12:00:00.000Z",
  plan_digest: "1".repeat(64),
  definition_digest: "2".repeat(64),
  task_digest: "3".repeat(64),
  base_sha: "4".repeat(40),
  head_sha: "5".repeat(40),
  tree_sha: "6".repeat(40),
  event_seq: 21,
  last_change_seq: 18,
  last_authority_seq: 20,
  check_receipt_id: "7".repeat(64),
};
let positiveCases = 0;
let negativeCases = 0;
function normalizeBuilderRecord(label, builderValue) {
  const record = clone(builderValue); // exact JSON wire shape (drops builder `undefined` fields)
  assert(producerSchemaValidator.Check(record), `${label}: producer TypeBox rejected builder output: ${JSON.stringify([...producerSchemaValidator.Errors(record)])}`);
  const violations = schemaValidator.validateClosedSchema(schema, record, { knownFieldNames });
  assert(violations.length === 0, `${label}: adapter contract evaluator rejected builder output: ${violations.map((v) => `${v.path} ${v.message}`).join("; ")}`);
  const events = adapter.normalizePiDaddyLedger(line(record));
  assert(events.length > 0, `${label}: adapter normalized no events`);
  for (const event of events) {
    assert(event.source === "pi-daddy-v2", `${label}: v2 record was misclassified as ${event.source}`);
    assert(event.run_id === correlation.run_id, `${label}: run join identity was lost`);
    assert(event.task_id === correlation.task_id, `${label}: task join identity was lost`);
  }
  positiveCases += 1;
  return { record, events };
}
function expectRejected(label, record, expected) {
  let message = "";
  try { adapter.normalizePiDaddyLedger(line(record)); }
  catch (error) { message = error instanceof Error ? error.message : String(error); }
  assert(message && expected.test(message), `${label}: expected rejection ${expected}, got ${message || "ACCEPTED"}`);
  negativeCases += 1;
}
const resolution = (effective = [], denied = [], clipped = [], gatedBlocked = []) => ({
  effective, denied, clipped, gatedBlocked, universal: [], subsumedBy: [],
});
const now = (offset) => new Date(Date.parse("2026-08-20T12:00:00.000Z") + offset * 1_000);

console.log("\ncanonical structured refusals");
for (const [index, code] of refusals.REFUSAL_CODES.entries()) {
  let built;
  if (code === "WORKSPACE_NOT_AUTHORIZED") {
    // This refusal is production-reachable only through ADR-0035's routing guard.
    // Drive that planner and then map its result through the same buildRecord call
    // shape as extensions/run-delegation.ts; do not manufacture a positive wire line.
    const parentGrant = ["tool:read", "tool:delegate", "workspace:staging"];
    const plan = delegation.planDelegation({
      task: "Inspect production without changing it",
      tools: ["read"],
      boundWorkspaceId: "production",
      correlation,
    }, {
      ownGrant: parentGrant,
      depth: 1,
      maxDepth: 3,
      gated: [],
      approved: [],
      spawnId: "d0.authorized-parent",
    });
    assert(plan.ok === false, "WORKSPACE_NOT_AUTHORIZED planner case unexpectedly succeeded");
    assert(plan.refusal?.code === code, `routing planner produced ${plan.refusal?.code ?? "no refusal"}`);
    assert(JSON.stringify(plan.result.denied) === JSON.stringify(["workspace:production"]), "routing planner lost denied workspace capability identity");
    built = ledger.buildRecord({
      parentId: "d0.authorized-parent",
      childId: "d0.authorized-parent.denied-production",
      depth: plan.childDepth,
      agentType: "delegate",
      executor: "process",
      requested: plan.requested,
      parentGrant,
      result: plan.result,
      blocked: !plan.ok,
      reason: plan.reason,
      definitionDigest: plan.definitionDigest,
      taskDigest: plan.taskDigest,
      correlation: plan.correlation,
      refusal: plan.refusal,
      now: now(index + 1),
    });
    const generatedLine = line(clone(built));
    if (writeRegressionFixture) writeFileSync(workspaceRefusalFixture, generatedLine);
    else assert(readFileSync(workspaceRefusalFixture, "utf8") === generatedLine, "WORKSPACE_NOT_AUTHORIZED regression fixture has drifted from the production planner/builder path");
  } else {
    built = ledger.buildRecord({
      parentId: "d0", childId: `d0.refusal.${index}`, depth: 1, agentType: "build",
      requested: ["tool:read"], parentGrant: ["tool:read"], result: resolution([], [], ["tool:read"], []),
      blocked: true, reason: `contract refusal ${code}`, executor: "process", taskDigest: "9".repeat(64), correlation,
      refusal: { code, message: `contract refusal ${code}`, details: { contract_case: code, code_index: index, retryable: false } },
      now: now(index + 1),
    });
  }
  const { events } = normalizeBuilderRecord(`refusal ${code}`, built);
  const refused = events.find((event) => event.type === "child_spawn_refused");
  assert(refused?.refusal_code === code, `${code}: refusal_code was not preserved`);
  assert(refused.attributes?.structured_refusal?.code === code, `${code}: structured refusal code was lost`);
  assert(refused.attributes.structured_refusal.message !== built.refusal.message, `${code}: refusal message was not sanitized`);
  if (code === "WORKSPACE_NOT_AUTHORIZED") {
    const denied = events.find((event) => event.type === "capability_refused");
    assert(denied?.capability === "workspace:production", "WORKSPACE_NOT_AUTHORIZED denied capability identity was not preserved losslessly");
    assert(JSON.stringify(refused.attributes.denied) === JSON.stringify(["workspace:production"]), "WORKSPACE_NOT_AUTHORIZED denied partition changed shape");
    assert(JSON.stringify(refused.attributes.structured_refusal) === JSON.stringify({ code, message: refused.attributes.structured_refusal.message }), "WORKSPACE_NOT_AUTHORIZED structured refusal changed shape");
    assert(JSON.stringify(refused.attributes.correlation) === JSON.stringify(correlation), "WORKSPACE_NOT_AUTHORIZED nested correlation was not preserved");
  } else {
    assert(refused.attributes.structured_refusal.details?.contract_case === code, `${code}: structured refusal details were lost`);
  }
}
console.log(`  ✓ ${refusals.REFUSAL_CODES.length} production REFUSAL_CODES accepted and preserved`);

console.log("\nlegacy and capability decisions");
const legacy = ledger.buildRecord({
  parentId: "d0", childId: "d0.legacy", depth: 1, requested: ["tool:read"], parentGrant: ["tool:read"],
  result: resolution(["tool:read"]), blocked: false, executor: "process", now: now(40),
});
const legacyEvents = adapter.normalizePiDaddyLedger(line(clone(legacy)));
assert(legacyEvents.some((event) => event.type === "child_started"), "legacy GrantRecord lost child_started");
assert(legacyEvents.every((event) => event.source === "pi-daddy-0.17"), "legacy GrantRecord was not classified as 0.17");
positiveCases += 1;

const approvalBuilt = ledger.buildRecord({
  parentId: "d0", childId: "d0.approved", depth: 1, agentType: "build",
  requested: ["tool:bash", "tool:read"], parentGrant: ["agent:build", "tool:bash", "tool:read"],
  result: resolution(["tool:bash", "tool:read"]), blocked: false,
  approved: ["tool:bash", "tool:read"],
  approvalSources: { "tool:bash": "persisted", "tool:read": "prompt" },
  approvalScopes: { "tool:bash": "always", "tool:read": "once" },
  approvalExpiresAt: { "tool:bash": "2026-09-19T12:00:00.000Z" },
  approvalUses: { "tool:read": { max: 1, remaining: 0 } },
  definitionDigest: { name: "build", source: "/operator/skills/build/SKILL.md", sha256: "8".repeat(64) },
  executor: "process", taskFrom: "d0.0", taskDigest: "9".repeat(64), correlation, now: now(41),
});
const approvalCase = normalizeBuilderRecord("approved capability decision", approvalBuilt);
const approvals = approvalCase.events.filter((event) => event.type === "approval_used");
assert(approvals.length === 2, "nested approval evidence did not produce two approval_used events");
assert(approvals.find((event) => event.capability === "tool:bash")?.approval?.source === "persisted", "per-capability approval source was lost");
assert(approvals.find((event) => event.capability === "tool:read")?.approval?.scope === "once", "per-capability approval scope was lost");
const decision = approvalCase.events.find((event) => event.type === "capability_decision");
assert(decision?.digests?.task === "9".repeat(64), "trusted task digest was lost");
assert(decision?.digests?.definition === "8".repeat(64), "trusted definition digest was lost");
assert(decision?.digests?.correlation_task === correlation.task_digest, "nested correlation task digest was lost");
assert(decision?.workspace_id === undefined, "non-authoritative correlation workspace was promoted on a capability decision");
console.log("  ✓ legacy GrantRecord, approvals, nested correlation, and trusted digests preserved");

console.log("\nworkspace, lifecycle, and receipt builders");
for (const [index, outcome] of ledger.WORKSPACE_LEASE_OUTCOMES.entries()) {
  const built = ledger.buildWorkspaceLeaseEvent({
    childId: `d0.lease.${index}`, workspaceId: "workspace-builder-contract", root: "/worktrees/contract",
    access: index % 2 === 0 ? "write" : "read", outcome, recovered: index % 3 === 0 ? false : index % 3 === 1 ? true : "unknown",
    releaseReason: `contract ${outcome}`, correlation, now: now(50 + index),
  });
  const { events } = normalizeBuilderRecord(`workspace lease ${outcome}`, built);
  assert(events[0].workspace_id === built.workspaceId, `${outcome}: authoritative workspace identity was lost`);
  assert(events[0].attributes?.outcome === outcome, `${outcome}: workspace outcome was lost`);
}
for (const [index, state] of ledger.CHILD_LIFECYCLE_STATES.entries()) {
  const built = ledger.buildChildLifecycleEvent({
    childId: `d0.lifecycle.${index}`, state, executor: "process",
    ...(state === "failed" ? { exitCode: 124, signal: "SIGTERM", timedOut: true, aborted: true, truncated: true, reason: "timed out" } : {}),
    correlation, now: now(70 + index),
  });
  const { events } = normalizeBuilderRecord(`child lifecycle ${state}`, built);
  assert(events[0].attributes?.state === state, `${state}: lifecycle state was lost`);
  if (state === "failed") {
    assert(events[0].attributes.timed_out === true && events[0].attributes.aborted === true && events[0].attributes.truncated === true,
      "child lifecycle true-only flags were lost");
  }
}
const receiptBuilt = ledger.buildCheckReceiptLedgerEvent({
  childId: "check:spec-lint:00000000-0000-4000-8000-000000000000", receiptId: "a".repeat(64),
  workspaceId: "workspace-builder-contract", checkId: "spec-lint", treeSha: "b".repeat(40), correlation, now: now(80),
});
const receiptCase = normalizeBuilderRecord("check receipt", receiptBuilt);
const receipt = receiptCase.events[0];
assert(receipt.workspace_id === receiptBuilt.workspaceId, "check receipt workspace identity was lost");
assert(receipt.digests?.tree === receiptBuilt.treeSha, "check receipt measured tree identity was lost");
assert(receipt.attributes?.receipt_id === receiptBuilt.receiptId && receipt.attributes?.check_id === receiptBuilt.checkId, "check receipt identity was lost");
assert(receipt.attributes?.check_receipt_id === correlation.check_receipt_id, "nested check receipt join identity was lost");
console.log(`  ✓ ${ledger.WORKSPACE_LEASE_OUTCOMES.length} lease outcomes, ${ledger.CHILD_LIFECYCLE_STATES.length} lifecycle states, and receipt identity preserved`);

console.log("\nfail-closed mutations from builder output");
expectRejected("unsupported explicit version", { ...approvalCase.record, ledgerVersion: 3 }, /unsupported pi-daddy ledgerVersion 3/);
expectRejected("v2 cannot become legacy", Object.fromEntries(Object.entries(approvalCase.record).filter(([key]) => key !== "event")), /event must be capability_decision/);
expectRejected("unsupported event variant", { ...approvalCase.record, event: "future_event" }, /event must be capability_decision/);
for (const field of ["run_id", "task_id"]) {
  const mutated = clone(approvalCase.record);
  delete mutated.correlation[field];
  expectRejected(`missing ${field} join`, mutated, /correlation\.run_id and correlation\.task_id are required for workflow joins/);
}
const unknownRefusal = clone(ledger.buildRecord({
  parentId: "d0", childId: "d0.unknown", depth: 1, requested: [], parentGrant: [], result: resolution(), blocked: true,
  executor: "process", taskDigest: "9".repeat(64), correlation,
  refusal: { code: refusals.REFUSAL_CODES[0], message: "known before mutation" }, now: now(90),
}));
unknownRefusal.refusal.code = "FUTURE_UNPINNED_REFUSAL";
expectRejected("unknown future refusal", unknownRefusal, /refusal\.code must be one of|unsupported code/);
const malformedRefusal = clone(unknownRefusal);
malformedRefusal.refusal.code = refusals.REFUSAL_CODES[0];
delete malformedRefusal.refusal.message;
expectRejected("malformed refusal", malformedRefusal, /refusal\.message is required|refusal requires code and message/);
const badPartition = clone(approvalCase.record);
badPartition.denied = ["tool:read"];
expectRejected("overlapping capability partition", badPartition, /must be disjoint subsets/);
const badApproval = clone(approvalCase.record);
badApproval.approvalSources["tool:write"] = "prompt";
expectRejected("approval evidence for unapproved capability", badApproval, /approvalSources keys must be approved capabilities/);
const badWorkspace = clone(receiptCase.record);
badWorkspace.correlation.workspace_id = "different-workspace";
expectRejected("workspace promotion mismatch", badWorkspace, /workspaceId disagrees with correlation\.workspace_id/);
console.log(`  ✓ ${negativeCases} negative mutations rejected without legacy fallback`);

const dirtyAfter = capture(checkout, "git", ["status", "--porcelain=v1", "--untracked-files=all"]);
assert(dirtyAfter === "", "pi-daddy build changed the clean producer checkout");
console.log(`\nPASS — ${positiveCases} builder-produced positive cases, ${negativeCases} fail-closed mutations; all joins preserved. No model or judge calls.`);
