import { spawn } from "node:child_process";
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, realpathSync, unlinkSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import {
  abortQualificationInvocation,
  checkQualificationAuthentication,
  pollQualificationInvocation,
  prepareQualificationInvocation,
  qualificationCanonicalJson,
  recordQualificationCell,
  recordQualificationJudgePanel,
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
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw new Error("qualification continuation authority must be a regular non-symlink file");
    if (process.platform !== "win32" && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.())) throw new Error("qualification continuation authority file must be mode 0600 and owned by the qualification user");
    if (stat.size < 32 || stat.size > 4096) throw new Error("qualification continuation authority must be 32..4096 bytes");
    const authority = readFileSync(fd, "utf8");
    const pathStat = lstatSync(path);
    if (pathStat.isSymbolicLink() || pathStat.dev !== stat.dev || pathStat.ino !== stat.ino) throw new Error("qualification continuation authority path changed while it was consumed");
    unlinkSync(path);
    if (!authority.trim()) throw new Error("qualification continuation authority must not be blank");
    return authority;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function print(value: unknown): void {
  process.stdout.write(`${qualificationCanonicalJson(value)}\n`);
}

export async function cmdQualification(args: QualificationCliArgs): Promise<void> {
  const operation = args._[0];
  if (!operation) throw new Error("usage: skill-harness qualification <prepare|start|status|poll|validate|panel|cell|abort> ...");
  if (operation === "prepare") {
    const invocation = prepareQualificationInvocation({
      spool_dir: required(args, "spool"),
      config_path: required(args, "config"),
      request_path: required(args, "request"),
      expected_configuration_sha256: flag(args, "expected-config-sha256"),
    });
    print({ invocation_id: invocation.invocation_id, phase: "prepared", consumed_calls: 0 });
    return;
  }
  const spool = required(args, "spool");
  if (operation === "validate") {
    print(validateQualificationRunnerSpool(spool));
    return;
  }
  if (operation === "panel") {
    print(recordQualificationJudgePanel({
      spool_dir: spool,
      panel_id: required(args, "panel-id"),
      member_invocation_ids: required(args, "members").split(",").filter(Boolean),
    }));
    return;
  }
  if (operation === "cell") {
    print(recordQualificationCell({
      spool_dir: spool,
      cell_id: required(args, "cell-id"),
    }));
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
    const fdRaw = flag(args, "authority-fd");
    if (fdRaw !== "3") throw new Error("qualification internal authority descriptor must be fd 3");
    let authority: unknown;
    try { authority = JSON.parse(readFileSync(3, "utf8")); }
    catch { throw new Error("qualification internal authority payload is invalid JSON"); }
    finally { closeSync(3); }
    if (!authority || typeof authority !== "object" || Array.isArray(authority) ||
        Object.keys(authority).sort().join(",") !== "authentication_authority,continuation_authority") {
      throw new Error("qualification internal authority payload is not closed");
    }
    const payload = authority as { authentication_authority?: unknown; continuation_authority?: unknown };
    if (typeof payload.authentication_authority !== "string" ||
        (payload.continuation_authority !== null && typeof payload.continuation_authority !== "string")) {
      throw new Error("qualification internal authority payload has invalid fields");
    }
    await superviseQualificationInvocation({
      spool_dir: spool,
      invocation_id: id,
      child_env: process.env,
      authentication_authority: payload.authentication_authority,
      continuation_authority: payload.continuation_authority ?? undefined,
    });
    return;
  }
  if (operation === "start") {
    const config = readQualificationSpoolConfig(spool);
    const before = qualificationInvocationStatus(spool, id);
    if (before.phase === "terminal" || ((before.phase === "running" || before.phase === "launch-claimed") && before.supervisor_alive === true)) {
      print(before);
      return;
    }
    const needsContinuation = before.attempt === 1 && before.supervisor_alive !== true;
    if (needsContinuation && !flag(args, "continuation-authority-file")) {
      throw new Error("qualification interrupted claimed invocation requires --continuation-authority-file");
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
      "--authority-fd", "3",
    ];
    const supervisor = spawn(process.execPath, childArgs, {
      cwd: process.cwd(),
      env: auth.child_env,
      detached: true,
      stdio: ["ignore", "ignore", "ignore", "pipe"],
    });
    await new Promise<void>((resolve, reject) => {
      supervisor.once("spawn", resolve);
      supervisor.once("error", reject);
    });
    const authorityPipe = supervisor.stdio[3];
    if (!authorityPipe || !("write" in authorityPipe)) throw new Error("qualification private authority pipe was not created");
    authorityPipe.end(JSON.stringify({ authentication_authority: auth.launch_authority, continuation_authority: continuation ?? null }));
    supervisor.unref();
    const deadline = Date.now() + integerFlag(args, "ack-wait-ms", 1500);
    const priorSupervisor = qualificationCanonicalJson(before.supervisor);
    let status = qualificationInvocationStatus(spool, id);
    const acknowledged = () => needsContinuation
      ? status.phase === "terminal" || (status.supervisor_alive === true && qualificationCanonicalJson(status.supervisor) !== priorSupervisor)
      : status.phase !== "prepared";
    while (!acknowledged() && Date.now() < deadline) {
      await sleep(10);
      status = qualificationInvocationStatus(spool, id);
    }
    if (!acknowledged()) {
      throw new Error(`qualification supervisor did not durably acknowledge ${id} before the acknowledgement deadline`);
    }
    print(status);
    return;
  }
  throw new Error(`unknown qualification operation: ${operation}`);
}
