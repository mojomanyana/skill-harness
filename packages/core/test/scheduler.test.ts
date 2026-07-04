import { describe, test, expect } from "vitest";
import { runPool } from "../src/scheduler.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("runPool", () => {
  test("returns results in input order despite out-of-order completion", async () => {
    const delays = [30, 5, 20, 1];
    const tasks = delays.map((d, i) => async () => { await sleep(d); return i; });
    expect(await runPool(tasks, 4)).toEqual([0, 1, 2, 3]);
  });

  test("never exceeds the concurrency ceiling", async () => {
    let inFlight = 0;
    let max = 0;
    const tasks = Array.from({ length: 10 }, () => async () => {
      inFlight++;
      max = Math.max(max, inFlight);
      await sleep(5);
      inFlight--;
      return 1;
    });
    await runPool(tasks, 3);
    expect(max).toBeLessThanOrEqual(3);
    expect(max).toBeGreaterThan(1); // actually parallelised
  });

  test("concurrency <= 1 runs strictly in sequence", async () => {
    const order: number[] = [];
    const tasks = [0, 1, 2].map((i) => async () => { order.push(i); await sleep(1); return i; });
    await runPool(tasks, 1);
    expect(order).toEqual([0, 1, 2]);
  });

  test("empty task list resolves to []", async () => {
    expect(await runPool([], 4)).toEqual([]);
  });

  test("a throwing task rejects runPool", async () => {
    const tasks = [async () => 1, async () => { throw new Error("boom"); }, async () => 3];
    await expect(runPool(tasks, 2)).rejects.toThrow("boom");
  });
});
