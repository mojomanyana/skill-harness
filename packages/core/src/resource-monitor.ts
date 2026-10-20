import { mkdirSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getProcessSignal, withProcessScope, type ProcessObservation, type ProcessScope } from "./util/process.js";

/** Per-operation metadata only, with bounded retention and low-frequency atomic snapshots. */
export async function withResourceMonitoring<T>(directory: string, work: () => Promise<T>, options: ProcessScope = {}): Promise<T> {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const id = randomUUID();
  const path = join(directory, `resources-${id}.json`), pending = path + ".tmp";
  const controller = new AbortController();
  const inherited = options.signal ?? getProcessSignal();
  const abort = () => controller.abort(inherited?.reason);
  if (inherited?.aborted) abort();
  inherited?.addEventListener("abort", abort, { once: true });
  const records: ProcessObservation[] = [];
  const active = new Map<number, ProcessObservation>();
  let total = 0, dropped = 0, droppedActive = 0, state = "running", flushError: unknown;
  const started = new Date().toISOString();
  const flush = () => {
    try {
      writeFileSync(pending, JSON.stringify({ schema: 1, scope: "harness-owned-processes", started, updated: new Date().toISOString(), state,
        hostHealth: "unmeasured", sampling: "one-second-owned-tree", totalProcesses: total, droppedObservations: dropped, droppedActiveObservations: droppedActive, active: [...active.values()], observations: records }, null, 2) + "\n", { mode: 0o600 });
      renameSync(pending, path);
    } catch (error) { flushError = error; controller.abort(error); }
  };
  flush();
  if (flushError) { inherited?.removeEventListener("abort", abort); throw flushError; }
  const timer = setInterval(flush, 5000); timer.unref();
  try {
    return await withProcessScope({ ...options, signal: controller.signal, onSample: record => {
      if (record.pid !== null && (active.has(record.pid) || active.size < 256)) active.set(record.pid, record);
      else droppedActive++;
      options.onSample?.(record);
    }, onObservation: record => {
      total++;
      if (record.pid !== null) active.delete(record.pid);
      if (records.length < 256) records.push(record); else dropped++;
      if (record.reason === "resource-limit" || record.reason === "output-limit") controller.abort(new Error(record.reason));
      options.onObservation?.(record);
    } }, work);
  } catch (error) { state = "interrupted"; throw error; }
  finally {
    clearInterval(timer); inherited?.removeEventListener("abort", abort);
    if (state === "running") state = "settled";
    flush();
    if (flushError) throw new Error(`Resource summary could not be retained: ${String(flushError)}`);
  }
}
