import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import {
  abortQualificationInvocation,
  checkQualificationAuthentication,
  pollQualificationInvocation,
  prepareQualificationInvocation,
  qualificationCanonicalJson,
  qualificationInvocationStatus,
  readQualificationSpoolConfig,
  superviseQualificationInvocation,
  validateQualificationRunnerSpool,
  verifyQualificationExecutable,
} from "@skill-harness/core";

export interface QualificationCliArgs {
  _: string[];
  flags: Record<string, string | true>;
}

function flag(args: QualificationCliArgs, name: string): string | undefined {
  const value = args.flags[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
function required(args: QualificationCliArgs, name: string): string {
  const value = flag(args, name);
  if (!value) throw new Error(`qualification ${args._[0] ?? "command"} requires --${name} <value>`);
  return value;
}
function integerFlag(args: QualificationCliArgs, name: string, fallback: number): number {
  const raw = flag(args, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`qualification --${name} must be a non-negative integer`);
  return value;
}
function print(value: unknown): void {
  process.stdout.write(`${qualificationCanonicalJson(value)}\n`);
}

export async function cmdQualification(args: QualificationCliArgs): Promise<void> {
  const operation = args._[0];
  if (!operation) throw new Error("usage: skill-harness qualification <prepare|start|status|poll|validate|abort> ...");
  if (operation === "prepare") {
    const invocation = prepareQualificationInvocation({
      spool_dir: required(args, "spool"),
      config_path: required(args, "config"),
      request_path: required(args, "request"),
    });
    print({ invocation_id: invocation.invocation_id, phase: "prepared", consumed_calls: 0 });
    return;
  }
  const spool = required(args, "spool");
  if (operation === "validate") {
    print(validateQualificationRunnerSpool(spool));
    return;
  }
  const id = required(args, "id");
  if (operation === "status") {
    print(qualificationInvocationStatus(spool, id));
    return;
  }
  if (operation === "poll") {
    print(await pollQualificationInvocation({
      spool_dir: spool,
      invocation_id: id,
      wait_ms: integerFlag(args, "wait-ms", 0),
      interval_ms: Math.max(5, integerFlag(args, "interval-ms", 100)),
    }));
    return;
  }
  if (operation === "abort") {
    print(await abortQualificationInvocation({
      spool_dir: spool,
      invocation_id: id,
      reason: required(args, "reason"),
    }));
    return;
  }
  if (operation === "__supervise") {
    await superviseQualificationInvocation({
      spool_dir: spool,
      invocation_id: id,
      child_env: process.env,
      continuation_authority: flag(args, "continuation-authority"),
    });
    return;
  }
  if (operation === "start") {
    const config = readQualificationSpoolConfig(spool);
    if (config.mode === "production") {
      const pinned = verifyQualificationExecutable(config.runner.executable);
      const running = realpathSync(process.argv[1]);
      if (running !== pinned.realpath) {
        throw new Error(`qualification runner executable mismatch: configuration pins ${pinned.realpath}, running ${running}`);
      }
    }
    const auth = await checkQualificationAuthentication({ spool_dir: spool, invocation_id: id });
    const continuation = flag(args, "continuation-authority");
    const childArgs = [
      ...process.execArgv,
      process.argv[1],
      "qualification", "__supervise",
      "--spool", spool,
      "--id", id,
      ...(continuation ? ["--continuation-authority", continuation] : []),
    ];
    const supervisor = spawn(process.execPath, childArgs, {
      cwd: process.cwd(),
      env: auth.child_env,
      detached: true,
      stdio: "ignore",
    });
    await new Promise<void>((resolve, reject) => {
      supervisor.once("spawn", resolve);
      supervisor.once("error", reject);
    });
    supervisor.unref();
    const deadline = Date.now() + integerFlag(args, "ack-wait-ms", 1500);
    let status = qualificationInvocationStatus(spool, id);
    while (status.phase === "prepared" && Date.now() < deadline) {
      await sleep(10);
      status = qualificationInvocationStatus(spool, id);
    }
    if (status.phase === "prepared") {
      throw new Error(`qualification supervisor did not durably claim ${id} before the acknowledgement deadline`);
    }
    print(status);
    return;
  }
  throw new Error(`unknown qualification operation: ${operation}`);
}
