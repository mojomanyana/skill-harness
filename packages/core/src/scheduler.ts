/**
 * Run `tasks` with at most `concurrency` thunks in flight at once, returning
 * their results in input order (not completion order). `concurrency <= 1` runs
 * them strictly sequentially — identical to a plain for-await loop. A thunk that
 * throws rejects the returned promise (fail-fast); in-flight tasks are not
 * cancelled (JS has no cancellation), but no further tasks are started.
 */
export async function runPool<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results: T[] = new Array(tasks.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= tasks.length) return;
      results[i] = await tasks[i]();
    }
  }

  const workerCount = Math.min(limit, tasks.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
