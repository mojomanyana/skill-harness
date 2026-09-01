import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { QUALIFICATION_ACCOUNTING_POLICY } from "@skill-harness/core";
import { consumeQualificationContinuationAuthority, qualificationSupervisorRuntimeArgs } from "../src/qualification.js";

const REPO = resolve(import.meta.dirname, "../../..");
const CLI = join(REPO, "packages", "cli", "src", "cli.ts");
const hex = (value: string, length = 64) => value.repeat(length);
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const FAKE = `#!/usr/bin/env node
const fs=require('node:fs');const a=process.argv.slice(2);
if(a[0]==='auth'){const p=a[a.indexOf('--provider')+1];console.log(JSON.stringify({status:'ready',provider:p,authType:'oauth'}));process.exit(0)}
if(process.env.FAKE_COUNT_FILE)fs.appendFileSync(process.env.FAKE_COUNT_FILE,'launch\\n');
const p=a[a.indexOf('--provider')+1],m=a[a.indexOf('--model')+1],input=(a.find(x=>x.startsWith('@'))||'').slice(1);
const delay=Number(fs.readFileSync(input,'utf8').trim())||0;
console.log(JSON.stringify({type:'session',version:3,id:'fake',timestamp:new Date().toISOString(),cwd:process.cwd()}));
setTimeout(()=>{console.log(JSON.stringify({type:'message_end',message:{role:'assistant',provider:p,model:m,content:[],stopReason:'stop'}}))},delay);
`;

function fixture(delay = 0) {
  const root = mkdtempSync(join(tmpdir(), "qualification-cli-"));
  const executable = join(root, "fake-pi.cjs"); writeFileSync(executable, FAKE); chmodSync(executable, 0o755);
  const prompt = join(root, "prompt.txt"); writeFileSync(prompt, `${delay}\n`);
  const count = join(root, "calls.txt");
  const pin = { path: executable, sha256: sha(readFileSync(executable)) };
  const arm = (id: string, kind: "subject" | "judge", model: string) => ({ id, kind, provider: "fake", model, authentication: "test-oauth", executable: pin, resources: [], arguments: ["@{input_path}"], allowed_environment_names: ["HOME", "PATH", "FAKE_COUNT_FILE"], timeout_ms: 2000, output_limit_bytes: 65536, artifact: { type: "pi-jsonl", relative_path_template: "artifacts/{invocation_id}.jsonl" }, fallback: false, metered_override: false });
  const config = { schema_version: "qualification-config-v1", mode: "test", product: { repository: "https://example.invalid/product", commit: hex("1",40), tree: hex("2",40), checkout_path: root, package_path: executable, package_sha256: hex("3"), package_bytes: 1 }, engine: { repository: "https://example.invalid/engine", commit: hex("4",40), tree: hex("5",40), checkout_path: root, package_paths: { core: executable, adapters: executable, cli: executable, meta: executable }, package_sha256: { core: hex("6"), adapters: hex("7"), cli: hex("8"), meta: hex("9") } }, producer: { repository: "https://example.invalid/producer", commit: hex("a",40), tree: hex("b",40), checkout_path: root, version: "0.20.0", ledger_version: 3, ledger_schema_sha256: hex("a") }, runner: { version: "qualification-runner-v1", executable: pin, conflicting_parent_environment: "remove-and-record" }, accounting: structuredClone(QUALIFICATION_ACCOUNTING_POLICY), arms: [arm("fake-subject","subject","fake-luna"),arm("fake-judge","judge","fake-sol")] };
  const configPath=join(root,"config.json");writeFileSync(configPath,JSON.stringify(config));
  const request={schema_version:"qualification-invocation-request-v1",measurement_identity_sha256:hex("c"),invocation_id:"invocation-cli-1",scenario:{id:"fake-A1",version:"1",stimulus_sha256:hex("d"),rubric_sha256:hex("e"),input_path:prompt,input_sha256:sha(readFileSync(prompt)),working_directory:root},role:"subject",counts_as_measurement:true,arms:{subject:"fake-subject",judge:"fake-judge"},selected_arm:"fake-subject",repetition:0};
  const requestPath=join(root,"request.json");writeFileSync(requestPath,JSON.stringify(request));
  return {root,spool:join(root,"spool"),configPath,requestPath,count};
}

function cli(f: ReturnType<typeof fixture>, args: string[], timeout=5000) {
  const env={HOME:f.root,PATH:process.env.PATH,FAKE_COUNT_FILE:f.count,OPENAI_API_KEY:"MUST-BE-REMOVED"};
  const result=spawnSync(process.execPath,["--import","tsx",CLI,...args],{cwd:REPO,env,encoding:"utf8",timeout});
  return result;
}
function lines(path:string){return existsSync(path)?readFileSync(path,"utf8").trim().split("\n").filter(Boolean).length:0}

describe("qualification CLI lifecycle",()=>{
  it("consumes continuation authority from a private one-use file instead of argv or environment", () => {
    const root = mkdtempSync(join(tmpdir(), "qualification-continuation-"));
    const path = join(root, "authority");
    writeFileSync(path, "sentinel-continuation-authority", { mode: 0o600 });
    expect(consumeQualificationContinuationAuthority(path)).toBe("sentinel-continuation-authority");
    expect(existsSync(path)).toBe(false);
  });

  it("never inherits parent Node loader/import/debug arguments into a production supervisor", () => {
    expect(qualificationSupervisorRuntimeArgs("production", "/pinned/cli.js")).toEqual([]);
    expect(qualificationSupervisorRuntimeArgs("test", "/source/cli.ts")).toEqual(["--import", "tsx"]);
    expect(qualificationSupervisorRuntimeArgs("test", "/built/cli.js")).toEqual([]);
  });

  it("prepare/start/status/poll/validate operate on one durable invocation",()=>{
    const f=fixture(80);
    expect(cli(f,["qualification","prepare","--spool",f.spool,"--config",f.configPath,"--request",f.requestPath])).toMatchObject({status:0});
    const prepared=JSON.parse(cli(f,["qualification","status","--spool",f.spool,"--id","invocation-cli-1"]).stdout);
    expect(prepared).toMatchObject({phase:"prepared",attempt:0});
    expect(cli(f,["qualification","start","--spool",f.spool,"--id","invocation-cli-1"]).status).toBe(0);
    const polled=cli(f,["qualification","poll","--spool",f.spool,"--id","invocation-cli-1","--wait-ms","3000","--interval-ms","10"]);
    expect(polled.status).toBe(0);
    expect(JSON.parse(polled.stdout)).toMatchObject({phase:"terminal",terminal_status:"completed",attempt:1});
    expect(JSON.parse(cli(f,["qualification","validate","--spool",f.spool]).stdout)).toMatchObject({ok:true,terminal:1});
    expect(lines(f.count)).toBe(1);
  });

  it("the start caller exits while the detached supervisor continues",()=>{
    const f=fixture(350);
    expect(cli(f,["qualification","prepare","--spool",f.spool,"--config",f.configPath,"--request",f.requestPath]).status).toBe(0);
    const started=cli(f,["qualification","start","--spool",f.spool,"--id","invocation-cli-1"],1500);
    expect(started.status).toBe(0);
    const immediate=JSON.parse(started.stdout);
    expect(["launch-claimed","running","terminal"]).toContain(immediate.phase);
    const done=cli(f,["qualification","poll","--spool",f.spool,"--id","invocation-cli-1","--wait-ms","3000","--interval-ms","10"]);
    expect(JSON.parse(done.stdout).terminal_status).toBe("completed");
    expect(lines(f.count)).toBe(1);
  });

  it("abort is explicit and terminal; polling never launches another process",()=>{
    const f=fixture(1200);
    expect(cli(f,["qualification","prepare","--spool",f.spool,"--config",f.configPath,"--request",f.requestPath]).status).toBe(0);
    expect(cli(f,["qualification","start","--spool",f.spool,"--id","invocation-cli-1"]).status).toBe(0);
    const aborted=cli(f,["qualification","abort","--spool",f.spool,"--id","invocation-cli-1","--reason","operator-request"]);
    expect(aborted.status).toBe(0);
    const done=cli(f,["qualification","poll","--spool",f.spool,"--id","invocation-cli-1","--wait-ms","3000"]);
    expect(JSON.parse(done.stdout).terminal_status).toBe("aborted");
    expect(lines(f.count)).toBe(1);
  });

  it("fails closed on missing required flags and unknown lifecycle operations",()=>{
    const f=fixture();
    expect(cli(f,["qualification","prepare","--spool",f.spool]).status).not.toBe(0);
    expect(cli(f,["qualification","restart","--spool",f.spool]).status).not.toBe(0);
  });
});
