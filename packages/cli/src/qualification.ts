import { spawn } from "node:child_process";
import { lstatSync, readFileSync, realpathSync, unlinkSync } from "node:fs";
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
export function qualificationSupervisorRuntimeArgs(mode: "production" | "test", scriptPath: string): string[] {
  // Production supervisors execute built JavaScript with no inherited Node
  // loader/import/debug hooks. Source-mode tests need exactly the repository's
  // tsx import and nothing from the parent process.execArgv.
  return mode === "test" && scriptPath.endsWith(".ts") ? ["--import", "tsx"] : [];
}

export function consumeQualificationContinuationAuthority(path: string): string {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("qualification continuation authority must be a regular non-symlink file");
  if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) throw new Error("qualification continuation authority file must be mode 0600");
  if (stat.size < 1 || stat.size > 4096) throw new Error("qualification continuation authority must be 1..4096 bytes");
  const authority = readFileSync(path, "utf8");
  unlinkSync(path);
  if (!authority.trim()) throw new Error("qualification continuation authority must not be blank");
  return authority;
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
    const fdRaw = flag(args, "continuation-fd");
    if (fdRaw !== undefined && fdRaw !== "3") throw new Error("qualification internal continuation descriptor must be fd 3");
    const continuation = fdRaw === undefined ? undefined : readFileSync(3, "utf8");
    await superviseQualificationInvocation({
      spool_dir: spool,
      invocation_id: id,
      child_env: process.env,
      continuation_authority: continuation,
    });
    return;
  }
  if (operation === "start") {
    const config = readQualificationSpoolConfig(spool);
    const before = qualificationInvocationStatus(spool, id);
    if (before.phase === "terminal" || before.phase === "running" || (before.phase === "launch-claimed" && before.supervisor_alive)) {
      print(before);
      return;
    }
    if (before.phase === "launch-claimed" && !flag(args, "continuation-authority-file")) {
      throw new Error("qualification stale launch-claimed invocation requires --continuation-authority-file");
    }
    if (config.mode === "production") {
      const pinned = verifyQualificationExecutable(config.runner.executable);
      const running = realpathSync(process.argv[1]);
      if (running !== pinned.realpath) {
        throw new Error(`qualification runner executable mismatch: configuration pins ${pinned.realpath}, running ${running}`);
      }
    }
    const auth = await checkQualificationAuthentication({ spool_dir: spool, invocation_id: id });
    if (flag(args, "continuation-authority") !== undefined) throw new Error("qualification continuation authority must use --continuation-authority-file, never argv text");
    const continuationFile = flag(args, "continuation-authority-file");
    const continuation = continuationFile ? consumeQualificationContinuationAuthority(continuationFile) : undefined;
    const childArgs = [
      ...qualificationSupervisorRuntimeArgs(config.mode, process.argv[1]),
      process.argv[1],
      "qualification", "__supervise",
      "--spool", spool,
      "--id", id,
      ...(continuation ? ["--continuation-fd", "3"] : []),
    ];
    const supervisor = spawn(process.execPath, childArgs, {
      cwd: process.cwd(),
      env: auth.child_env,
      detached: true,
      stdio: continuation ? ["ignore", "ignore", "ignore", "pipe"] : "ignore",
    });
    await new Promise<void>((resolve, reject) => {
      supervisor.once("spawn", resolve);
      supervisor.once("error", reject);
    });
    if (continuation) {
      const authorityPipe = supervisor.stdio[3];
      if (!authorityPipe || !("write" in authorityPipe)) throw new Error("qualification continuation authority pipe was not created");
      authorityPipe.end(continuation);
    }
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
