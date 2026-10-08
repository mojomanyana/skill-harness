import { describe, it, expect } from "vitest";
import { deserializeTrajectoryEvents } from "@skill-harness/core";
import { createHash } from "node:crypto";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { collectTrajectorySources, normalizePiDaddyRecordLedgerV1, normalizePiDaddyLedgerV3 } from "../src/trajectory.js";
import { assertSupportedSchema, assertSupportedSchemaV3, validateClosedSchemaV3 } from "../src/closed-schema.js";
import { PI_DADDY_RECORD_V1_COMMIT, PI_DADDY_RECORD_V1_SCHEMA, PI_DADDY_RECORD_V1_GOVERNANCE_SCHEMA } from "../src/pi-daddy-record-v1-contract.js";
const root=join(dirname(fileURLToPath(import.meta.url)),"../../..");
const contract=join(root,"contracts/pi-daddy/ledger-record/v1");
const fixture=(name:string):Record<string,unknown>=>JSON.parse(readFileSync(join(contract,"fixtures",name+".json"),"utf8"));
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
// Test writer follows the published record contract; untouched production bytes are also tested below.
function stable(value:unknown):string { if(value===null||typeof value!=="object")return JSON.stringify(value);if(Array.isArray(value))return `[${value.map(stable).join(",")}]`;return `{${Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+stable((value as Record<string,unknown>)[k])).join(",")}}`; }
function signed(bodies:Record<string,unknown>[], mutate?:(record:Record<string,unknown>,index:number)=>void):string {
 let previous:string|null=null;
 return bodies.map((body,index)=>{const record:Record<string,unknown>={v:1,seq:index+1,prev:previous,at:body.ts,kind:body.event==="capability_decision"?"capability":body.event==="child_lifecycle"?"lifecycle":body.event==="workspace_lease"?"lease":"fact",id:"record-"+index,body};mutate?.(record,index);record.digest=hash(stable(record));const line=JSON.stringify(record);previous=hash(line);return line;}).join("\n")+"\n";
}
describe("pi-daddy 0.46.1 record-v1 compatibility",()=>{
 it("pins all schemas, fixtures and reader source to exact pinned bytes",()=>{
  const pin=JSON.parse(readFileSync(join(contract,"PINNED.json"),"utf8"));expect(pin.commit).toBe(PI_DADDY_RECORD_V1_COMMIT);expect(pin.version).toBe("0.46.1");
  for(const [path,artifact] of Object.entries(pin.artifacts) as Array<[string,{sha256:string}]>)expect(hash(readFileSync(join(contract,path),"utf8"))).toBe(artifact.sha256);
  expect(PI_DADDY_RECORD_V1_SCHEMA).toEqual(JSON.parse(readFileSync(join(contract,"record.schema.json"),"utf8")));
  expect(PI_DADDY_RECORD_V1_GOVERNANCE_SCHEMA).toEqual(JSON.parse(readFileSync(join(contract,"governance-event.schema.json"),"utf8")));
 });
 it("accepts untouched producer envelopes and keeps old bare-v3 parsing distinct",()=>{
  const raw=readFileSync(join(contract,"fixtures/ledger-record.jsonl"),"utf8");
  const actual=normalizePiDaddyRecordLedgerV1(raw);expect(actual.length).toBeGreaterThan(0);expect(actual.every(e=>e.source==="pi-daddy-record-v1")).toBe(true);
  expect(()=>normalizePiDaddyLedgerV3(raw)).toThrow(/requires explicit ledgerVersion/);
 });
 it.each(["capability-decision","workspace-lease","child-lifecycle","episode-cost-gate","session-config","episode-outcome"])("accepts current producer %s body without field stripping",name=>{
  const body=fixture(name),events=normalizePiDaddyRecordLedgerV1(signed([body]));expect(events).toHaveLength(1);expect(events[0].attributes?.native_event).toBe(body.event);expect(deserializeTrajectoryEvents(events.map(e=>JSON.stringify(e)).join("\n"))).not.toBeNull();
  if(body.executionId)expect(events[0].execution_id).toBe(body.executionId);
 });
 it("retains exact observed model, usage, definition, null and zero fields",()=>{
  const body=fixture("child-lifecycle");body.state="completed";delete body.aborted;delete body.reason;body.exitCode=0;
  body.tokenDetail={inputTokens:12,outputTokens:3,cacheReadTokens:20,cacheWriteTokens:null,reasoningTokens:null};body.usage={input:12,output:3,cacheRead:20,cacheWrite:0,totalTokens:35,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}};
  const [event]=normalizePiDaddyRecordLedgerV1(signed([body]));expect(event.type).toBe("child_completed");expect(event.exit_code).toBe(0);expect(event.attributes?.usage).toEqual(body.usage);expect(event.attributes?.tokenDetail).toEqual(body.tokenDetail);expect(event.attributes?.resolvedModel).toEqual(body.resolvedModel);expect(event.digests?.skill_definition).toBe(body.definitionHash);
 });
 it("does not turn a blocked capability decision into a synthetic grant",()=>{
  const events=normalizePiDaddyRecordLedgerV1(signed([fixture("capability-decision")]));expect(events.map(e=>e.type)).toEqual(["child_spawn_refused"]);
 });
 it.each(["expired", "aborted"])("preserves %s approval as refusal evidence through the declared collector", gateOutcome => {
  const body = fixture("capability-decision");
  body.gateOutcome = gateOutcome;
  body.gatedBlocked = ["tool:bash"];
  body.approved = [];
  body.refusal = { code: "GATED_UNAPPROVED", message: "approval did not complete" };
  const raw = signed([body]);
  const cwd = mkdtempSync(join(tmpdir(), "record-v1-gate-"));
  try {
   writeFileSync(join(cwd, "grants.jsonl"), raw);
   const result = collectTrajectorySources(cwd, [{ adapter: "pi-daddy-record-v1", path: "grants.jsonl", required: true }]);
   expect(result.errors).toEqual([]);
   expect(result.events.map(event => event.type)).toEqual(["child_spawn_refused"]);
   expect(result.events[0]).toMatchObject({
    execution_id: body.executionId, refusal_code: "GATED_UNAPPROVED",
    attributes: { gateOutcome, blocked: true, approved: [], gatedBlocked: ["tool:bash"] },
   });
   expect(result.events[0].attributes).not.toHaveProperty("humanDenied");
   const historical = JSON.parse(readFileSync(join(root, "contracts/pi-daddy/ledger/v3/fixtures/capability-decision.json"), "utf8"));
   historical.gateOutcome = gateOutcome;
   expect(() => normalizePiDaddyLedgerV3(JSON.stringify(historical) + "\n")).toThrow(/gateOutcome/);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
 });
 it.each(["granted", "unrecognized-outcome"])("rejects unsupported %s approval evidence despite valid record signatures", gateOutcome => {
  const body = fixture("capability-decision");
  body.gateOutcome = gateOutcome;
  expect(() => normalizePiDaddyRecordLedgerV1(signed([body]))).toThrow(/gateOutcome/);
 });
 it("loads a real declared source through the collector",()=>{
  const cwd=mkdtempSync(join(tmpdir(),"record-v1-"));try{writeFileSync(join(cwd,"grants.jsonl"),signed([fixture("child-lifecycle")]));const result=collectTrajectorySources(cwd,[{adapter:"pi-daddy-record-v1",path:"grants.jsonl",required:true}]);expect(result.errors).toEqual([]);expect(result.events[0].type).toBe("child_failed");}finally{rmSync(cwd,{recursive:true,force:true});}
 });
 it.each([""," \n","{}","{\n"])("rejects empty, missing settlement and malformed evidence %j",raw=>{expect(()=>normalizePiDaddyRecordLedgerV1(raw)).toThrow();});
 it("rejects tampered bytes and refuses an intact prefix followed by a torn tail",()=>{
  const raw=signed([fixture("child-lifecycle")]);expect(()=>normalizePiDaddyRecordLedgerV1(raw.replace('"exitCode":null','"exitCode":1'))).toThrow(/digest mismatch/);expect(()=>normalizePiDaddyRecordLedgerV1(raw+'{')).toThrow(/unterminated/);
 });
 it.each(["seq","prev","kind","v"])("rejects re-signed invalid envelope %s",key=>{
  const raw=signed([fixture("child-lifecycle")],record=>{record[key]=key==="seq"?2:key==="prev"?"a".repeat(64):key==="kind"?"capability":2;});expect(()=>normalizePiDaddyRecordLedgerV1(raw)).toThrow();
 });
 it("rejects unknown envelope/body fields even when correctly re-signed",()=>{
  expect(()=>normalizePiDaddyRecordLedgerV1(signed([fixture("child-lifecycle")],record=>{record.unexpected="private-value";}))).toThrow(/undeclared/);
  const body=fixture("child-lifecycle");body.unexpected="private-value";expect(()=>normalizePiDaddyRecordLedgerV1(signed([body]))).toThrow(/undeclared/);
 });
 it("rejects duplicate identities and time reversal after valid chain recomputation",()=>{
  const first=fixture("child-lifecycle"),second=structuredClone(first);second.ts="2026-08-20T12:00:02.000Z";
  expect(()=>normalizePiDaddyRecordLedgerV1(signed([first,second]))).toThrow(/timestamps move backwards/);
  second.ts=first.ts;expect(()=>normalizePiDaddyRecordLedgerV1(signed([first,second],record=>{record.id="same";}))).toThrow(/duplicate record/);
 });
 it("enforces current lifecycle negation, token positivity and environment uniqueness",()=>{
  const body=fixture("child-lifecycle");body.usageUnavailable=true;expect(()=>normalizePiDaddyRecordLedgerV1(signed([body]))).toThrow(/forbidden schema/);
  delete body.usageUnavailable;(body.tokenDetail as Record<string,unknown>).inputTokens=0;expect(()=>normalizePiDaddyRecordLedgerV1(signed([body]))).toThrow(/must be >/);
  delete body.tokenDetail;body.exportedEnvironment=["PI_DADDY_EPISODE","PI_DADDY_EPISODE","PI_DADDY_EXECUTION"];expect(()=>normalizePiDaddyRecordLedgerV1(signed([body]))).toThrow(/unique items/);
 });
 it.each(["requested","parentGrant","effective","denied","clipped","gatedBlocked","approved"])("rejects credential-shaped %s capability identities without rewriting authority",field=>{
  const body=fixture("capability-decision"),secret="tool:sk-"+"a".repeat(24);body[field]=[secret];
  let error="";try{normalizePiDaddyRecordLedgerV1(signed([body]));}catch(cause){error=String(cause);}
  expect(error).toMatch(/identity contains sensitive content/);expect(error).not.toContain(secret);
 });
 it("rejects credential-shaped nested attribute map keys and keeps direct diagnostics redacted",()=>{
  const body=fixture("capability-decision"),secret="tool:sk-"+"a".repeat(24);body.approvalSources={[secret]:"prompt"};
  expect(()=>normalizePiDaddyRecordLedgerV1(signed([body]))).toThrow(/identity contains sensitive content/);
  body.approvalSources={[secret]:"invalid-source"};
  let error="";try{normalizePiDaddyRecordLedgerV1(signed([body]));}catch(cause){error=String(cause);}
  expect(error).toMatch(/redacted/i);expect(error).not.toContain(secret);expect(error).not.toContain("a".repeat(24));
 });
 it("preserves safe capability authority exactly in arrays and nested maps",()=>{
  const body=fixture("capability-decision");body.requested=["tool:read","context:files"];body.effective=["tool:read"];
  const [event]=normalizePiDaddyRecordLedgerV1(signed([body]));
  expect(event.requested_capabilities).toEqual(body.requested);expect(event.effective_capabilities).toEqual(body.effective);expect(event.attributes?.approvalSources).toEqual(body.approvalSources);
 });
 it("rejects producer identities that cannot fit the normalized identity grammar",()=>{
  const body=fixture("workspace-lease");body.workspaceId="feature/x";
  expect(validateClosedSchemaV3(PI_DADDY_RECORD_V1_GOVERNANCE_SCHEMA,body)).toEqual([]);
  expect(()=>normalizePiDaddyRecordLedgerV1(signed([body]))).toThrow(/cannot represent this source/);
 });
 it("redacts sensitive free text without weakening body validation",()=>{
  const body=fixture("child-lifecycle");body.reason="Bearer abcdefghijklmnopqrstuvwxyz1234";const [event]=normalizePiDaddyRecordLedgerV1(signed([body]));expect(event.attributes?.reason).toBe("[redacted]");
 });
});
describe("current-record schema constructs",()=>{
 it("keeps the frozen v2 keyword profile closed",()=>{expect(()=>assertSupportedSchema({not:{type:"string"}},"v2")).toThrow(/unsupported/);});
 it("checks not and exclusiveMinimum boundary values",()=>{
  const negative={type:"object",not:{required:["usage","usageUnavailable"]}};assertSupportedSchemaV3(negative,"record");expect(validateClosedSchemaV3(negative,{usage:{},usageUnavailable:true})).not.toEqual([]);expect(validateClosedSchemaV3(negative,{usage:{}})).toEqual([]);
  expect(validateClosedSchemaV3({type:"number",exclusiveMinimum:0},0)).not.toEqual([]);expect(validateClosedSchemaV3({type:"number",exclusiveMinimum:0},1)).toEqual([]);
 });
 it("uniqueItems compares object values independent of property order",()=>{
  const schema={type:"array",uniqueItems:true};assertSupportedSchemaV3(schema,"record");expect(validateClosedSchemaV3(schema,[{a:1,b:2},{b:2,a:1}])).not.toEqual([]);expect(validateClosedSchemaV3(schema,[{a:1},{a:2}])).toEqual([]);
 });
 it("rejects malformed new keyword shapes and unsupported children",()=>{
  for(const schema of [{uniqueItems:1},{not:[]},{exclusiveMinimum:"0"},{not:{madeUp:true}}])expect(()=>assertSupportedSchemaV3(schema,"record")).toThrow();
 });
});
