/**
 * Run `tasks` with at most `concurrency` thunks in flight at once, returning
 * their results in input order (not completion order). `concurrency <= 1` runs
 * them strictly sequentially — identical to a plain for-await loop. A thunk that
 * throws stops new dispatch; already claimed tasks settle before rejection.
 * A surrounding process scope supplies cancellation to active subprocesses.
 * Waiting for settlement prevents reporting a stopped run while its workers remain active.
 */
export async function runPool<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results: T[] = new Array(tasks.length);
  let next = 0;
  let failure: unknown;
  let failed = false;

  async function worker(): Promise<void> {
    while (true) {
      if (failed) return;
      const i = next++;
      if (i >= tasks.length) return;
      try { results[i] = await tasks[i](); }
      catch (error) { if (!failed) failure = error; failed = true; return; }
    }
  }

  const workerCount = Math.min(limit, tasks.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  if (failed) throw failure;
  return results;
}
