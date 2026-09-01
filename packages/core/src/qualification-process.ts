import type { ChildProcess } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

export interface QualificationProcessIdentity {
  pid: number;
  platform: NodeJS.Platform;
  boot_id: string | null;
  start_ticks: string | null;
}

export function qualificationProcessIdentity(pid: number): QualificationProcessIdentity {
  if (!Number.isInteger(pid) || pid < 1) throw new Error(`qualification process ${String(pid)} is not live`);
  if (process.platform === "linux") {
    let stat: string;
    try { stat = readFileSync(`/proc/${pid}/stat`, "utf8"); }
    catch { throw new Error(`qualification process ${pid} is not live`); }
    const close = stat.lastIndexOf(")");
    if (close < 0) throw new Error(`qualification process ${pid} identity is unreadable`);
    const remainder = stat.slice(close + 2).trim().split(/\s+/);
    const startTicks = remainder[19]; // field 22; remainder starts at field 3
    if (!/^\d+$/.test(startTicks ?? "")) throw new Error(`qualification process ${pid} start identity is unreadable`);
    let bootId: string;
    try { bootId = readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim(); }
    catch { throw new Error("qualification Linux boot identity is unreadable"); }
    return { pid, platform: process.platform, boot_id: bootId, start_ticks: startTicks };
  }
  try { process.kill(pid, 0); }
  catch { throw new Error(`qualification process ${pid} is not live`); }
  return { pid, platform: process.platform, boot_id: null, start_ticks: null };
}

export function qualificationProcessMatches(identity: QualificationProcessIdentity): boolean {
  try {
    const current = qualificationProcessIdentity(identity.pid);
    return sameProcessIdentity(current, identity);
  } catch { return false; }
}

export async function cleanupQualificationProcessGroupAfterLeaderExit(
  pid: number | undefined,
  original: QualificationProcessIdentity | null,
): Promise<void> {
  if (process.platform !== "linux" || !pid) return;
  const members = qualificationOwnedLinuxProcessGroupMembers(pid, original);
  signalQualificationOccurrences(members, "SIGTERM");
  if (members.length === 0) return;
  await sleep(75);
  signalQualificationOccurrences(members, "SIGKILL");
}

export function terminateQualificationProcess(child: ChildProcess, identity: QualificationProcessIdentity | null): void {
  if (identity && !qualificationProcessMatches(identity)) return;
  if (process.platform === "linux" && child.pid) {
    const members = qualificationOwnedLinuxProcessGroupMembers(child.pid, identity);
    signalQualificationOccurrences(members, "SIGTERM");
    setTimeout(() => signalQualificationOccurrences(members, "SIGKILL"), 75).unref();
    return;
  }
  try { child.kill("SIGTERM"); }
  catch { /* process already exited */ }
  setTimeout(() => {
    if (identity && !qualificationProcessMatches(identity)) return;
    try { child.kill("SIGKILL"); }
    catch { /* process already exited */ }
  }, 75).unref();
}

export function terminateQualificationByIdentity(identity: QualificationProcessIdentity): void {
  if (!qualificationProcessMatches(identity)) throw new Error(`qualification process identity for pid ${identity.pid} is stale or reused`);
  if (process.platform === "linux") {
    const members = qualificationOwnedLinuxProcessGroupMembers(identity.pid, identity);
    signalQualificationOccurrences(members, "SIGTERM");
    setTimeout(() => signalQualificationOccurrences(members, "SIGKILL"), 75).unref();
    return;
  }
  try { process.kill(identity.pid, "SIGTERM"); }
  catch { /* supervisor will reconcile the terminal state */ }
  setTimeout(() => {
    if (!qualificationProcessMatches(identity)) return;
    try { process.kill(identity.pid, "SIGKILL"); }
    catch { /* process already exited */ }
  }, 75).unref();
}

export async function terminateInterruptedQualificationProcessGroup(identity: QualificationProcessIdentity): Promise<void> {
  if (qualificationProcessMatches(identity)) {
    await terminateAndWaitByIdentity(identity);
    return;
  }
  if (process.platform !== "linux") return;
  const survivingMembers = qualificationLinuxProcessGroupMembers(identity.pid);
  // If the numeric group leader exists with a different occurrence, the PGID was
  // reused and is not ours. A leaderless group cannot be recreated while its old
  // descendants still hold that PGID, so only that leaderless case is safe to reap.
  if (survivingMembers.some((member) => member.pid === identity.pid)) return;
  signalQualificationOccurrences(survivingMembers, "SIGTERM");
  await sleep(75);
  signalQualificationOccurrences(survivingMembers, "SIGKILL");
}

async function terminateAndWaitByIdentity(identity: QualificationProcessIdentity): Promise<void> {
  if (!qualificationProcessMatches(identity)) return;
  if (process.platform === "linux") {
    const members = qualificationOwnedLinuxProcessGroupMembers(identity.pid, identity);
    signalQualificationOccurrences(members, "SIGTERM");
    await sleep(75);
    signalQualificationOccurrences(members, "SIGKILL");
  } else {
    try { process.kill(identity.pid, "SIGTERM"); }
    catch { return; }
    await sleep(75);
    if (qualificationProcessMatches(identity)) {
      try { process.kill(identity.pid, "SIGKILL"); }
      catch { /* process already exited */ }
    }
  }
  const deadline = Date.now() + 2000;
  while (qualificationProcessMatches(identity) && Date.now() < deadline) await sleep(10);
}

function qualificationOwnedLinuxProcessGroupMembers(
  processGroupId: number,
  original: QualificationProcessIdentity | null,
): QualificationProcessIdentity[] {
  const members = qualificationLinuxProcessGroupMembers(processGroupId);
  const currentLeader = members.find((member) => member.pid === processGroupId);
  if (currentLeader && (!original || !sameProcessIdentity(currentLeader, original))) return [];
  return members;
}

function qualificationLinuxProcessGroupMembers(processGroupId: number): QualificationProcessIdentity[] {
  if (process.platform !== "linux") return [];
  const members: QualificationProcessIdentity[] = [];
  for (const entry of readdirSync("/proc", { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
    const pid = Number(entry.name);
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      const close = stat.lastIndexOf(")");
      if (close < 0) continue;
      const fields = stat.slice(close + 2).trim().split(/\s+/);
      if (Number(fields[2]) !== processGroupId) continue; // field 5 (pgrp); fields start at field 3
      members.push(qualificationProcessIdentity(pid));
    } catch { /* process exited during the scan */ }
  }
  return members;
}

function signalQualificationOccurrences(identities: readonly QualificationProcessIdentity[], signal: NodeJS.Signals): void {
  for (const identity of identities) {
    if (!qualificationProcessMatches(identity)) continue;
    try { process.kill(identity.pid, signal); }
    catch { /* process exited after occurrence validation */ }
  }
}

function sameProcessIdentity(left: QualificationProcessIdentity, right: QualificationProcessIdentity): boolean {
  return left.pid === right.pid && left.platform === right.platform && left.boot_id === right.boot_id && left.start_ticks === right.start_ticks;
}
