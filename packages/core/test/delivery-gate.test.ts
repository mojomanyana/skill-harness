import { describe, expect, it, vi } from "vitest";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseSpec, runSkillModel, type HarnessAdapter } from "../src/index.js";

it("pre-provider workspace failure persists explicit delivery ERROR (breaks if v3 requires a provider request that never launched)", async()=>{
 const skillDir=mkdtempSync(join(tmpdir(),"delivery-workspace-error-"));cpSync(join(__dirname,"fixtures/golden-skill"),skillDir,{recursive:true});
 const specPath=join(skillDir,"tests/specification.yaml"),spec=parseSpec(readFileSync(specPath,"utf8"),specPath);spec.scenarios=[{...spec.scenarios[0],workspace:{fixture:"missing-fixture"}}];
 const adapter:HarnessAdapter={name:"pi",observesPrompts:true,available:async()=>true,run:async()=>{throw new Error("subject must not launch")},judge:async()=>{throw new Error("judge must not launch")}};
 try{const {results,runDir}=await runSkillModel({spec,skillDir,specPath,adapter,model:{provider:"fake",model:"m"},modelToken:"fake:m",judge:{provider:"fake-judge",model:"j"},mode:"force",timestamp:"2026-09-04T00:00:01.000Z"});expect(results.scenarios[0].objective?.assertions).toContainEqual(expect.objectContaining({kind:"skill_delivered",status:"ERROR"}));expect(results.subject_invocations).toEqual([]);expect(readFileSync(join(runDir,"results.yaml"),"utf8")).toContain("schema: 3");}finally{rmSync(skillDir,{recursive:true,force:true})}
});

it("skill_delivered surfaces absent bytes and costs zero judge calls (breaks if run trusts declared mode or judges through the gate)", async()=>{
 const skillDir=mkdtempSync(join(tmpdir(),"delivery-gate-"));cpSync(join(__dirname,"fixtures/golden-skill"),skillDir,{recursive:true});
 const specPath=join(skillDir,"tests/specification.yaml"),spec=parseSpec(readFileSync(specPath,"utf8"),specPath),judge=vi.fn(async()=>"VERDICT: PASS\nREASON: no");const h="d".repeat(64);
 const adapter:HarnessAdapter={name:"pi",observesPrompts:true,available:async()=>true,run:async req=>{req.onPromptObservation?.({capture_version:"prompt-provenance-v1",request_index:0,raw_sha256:h,normalized_sha256:h,normalization_rule:"cwd-line-v1",bytes:1,contract_sha256:h,contract_bytes:1,contract_occurrences:0,mechanism:"pi-skill",status:"FAIL"});return ">>> USER:\nhi\n\n<<< ASSISTANT:\nanswer\n"},judge};
 try{const {results}=await runSkillModel({spec,skillDir,specPath,adapter,model:{provider:"fake",model:"m"},modelToken:"fake:m",judge:{provider:"fake-judge",model:"j"},mode:"green",timestamp:"2026-09-04T00:00:00.000Z"});expect(results.schema).toBe(3);expect(judge).not.toHaveBeenCalled();expect(results.scenarios.every(s=>s.objective?.assertions.some(a=>a.kind==="skill_delivered"&&a.status==="FAIL"))).toBe(true);expect(results.effective_grade.ship).toBe(false);}finally{rmSync(skillDir,{recursive:true,force:true})}
});
