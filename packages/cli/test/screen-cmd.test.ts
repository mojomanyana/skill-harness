import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import yaml from "js-yaml";

vi.mock("@skill-harness/adapters", () => ({ getAdapter: () => { throw new Error("adapter lookup proves screen is not offline"); } }));
import { main } from "../src/cli.js";

const dirs:string[]=[];afterEach(()=>{while(dirs.length)rmSync(dirs.pop()!,{recursive:true,force:true});vi.restoreAllMocks()});
it("screen reads retained fields without resolving an adapter (breaks if command gains a model/judge path)", async()=>{
 const d=mkdtempSync(join(tmpdir(),"screen-cmd-"));dirs.push(d);mkdirSync(d,{recursive:true});const h="c".repeat(64);
 writeFileSync(join(d,"results.yaml"),yaml.dump({schema:3,skill:"x",harness:"pi",model:"fake:m",judge:{provider:"fake",model:"j"},timestamp:"t",label:null,mode:"red",effective_grade:{passed:0,total:0,pct:0,letter:"-",ship:false,note:""},subject_invocations:[{scenario_id:"A1",repetition:0,prompt:{capture_version:"prompt-provenance-v1",request_index:0,raw_sha256:h,normalized_sha256:h,normalization_rule:"cwd-line-v1",bytes:1,contract_sha256:h,contract_bytes:1,contract_occurrences:0,mechanism:"none",status:"PASS"}}],scenarios:[{id:"A1",criterion_count:1,judge_verdict:"PASS",judge_reason:"ok",suspect:false,override:null,note:"",objective:{status:"PASS",assertions:[{kind:"skill_delivered",status:"PASS",detail:"observed"}]},rep_judgments:[{repetition:0,recorded_verdict:"PASS",objective:{status:"PASS",assertions:[{kind:"skill_delivered",status:"PASS",detail:"observed"}]},judgments:[{ordinal:1,judge:{provider:"fake",model:"j"},verdict:"PASS",reason:"ok",suspect:false,criteria:[{index:1,verdict:"PASS",reason:"ok"}]}]}]}]}),"utf8");
 const log=vi.spyOn(console,"log").mockImplementation(()=>{});await expect(main(["screen",d])).resolves.toBeUndefined();expect(log.mock.calls.flat().join("\n")).toMatch(/CEILING[\s\S]*0 subject calls, 0 judge calls/);
});
