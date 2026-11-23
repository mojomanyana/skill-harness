import { expect, test, vi } from "vitest";
import type { HarnessAdapter } from "@skill-harness/core";
import { taskEvaluationAdapter, withTaskEvaluation } from "../src/task-evaluation.js";

test("reusing a result costs no attempt, two fresh evaluation calls share one admission", async () => {
  const finish = vi.fn(), admit = vi.fn(async () => ({ signal: new AbortController().signal, finish }));
  const adapter = { name: "fixture", available: async () => true, run: async () => "observed", judge: async () => "PASS" } satisfies HarnessAdapter;
  expect(await withTaskEvaluation(admit, "reuse", async () => "saved")).toBe("saved");
  expect(admit).toHaveBeenCalledTimes(0);
  const value = await withTaskEvaluation(admit, "evaluation", async () => {
    const scoped = taskEvaluationAdapter(adapter);
    return Promise.all([scoped.run({} as never), scoped.judge({} as never)]);
  });
  expect(value).toEqual(["observed", "PASS"]);
  expect(admit.mock.calls).toHaveLength(1);
  expect(finish).toHaveBeenCalledWith("settled");
});

test("a declined task cannot dispatch or turn a caught refusal into a grade", async () => {
  const run = vi.fn(), admit = vi.fn(async () => { throw Error("Task paused"); });
  const adapter = { name: "fixture", available: async () => true, run, judge: run };
  await expect(withTaskEvaluation(admit, "one", async () => {
    const scoped = taskEvaluationAdapter(adapter);
    await Promise.allSettled([scoped.run({} as never), scoped.judge({} as never)]);
    return "purported scorecard";
  })).rejects.toThrow("Task paused");
  expect(run).not.toHaveBeenCalled();
  expect(admit).toHaveBeenCalledTimes(1);
});

test("an already cancelled reservation closes before the adapter is invoked", async () => {
  const finish = vi.fn(), run = vi.fn(), controller = new AbortController();
  controller.abort();
  const admit = async () => ({ signal: controller.signal, finish });
  const adapter = { name: "fixture", available: async () => true, run, judge: run };
  await expect(withTaskEvaluation(admit, "cancelled", async () => taskEvaluationAdapter(adapter).run({} as never))).rejects.toThrow();
  expect(run).not.toHaveBeenCalled();
  expect(finish).toHaveBeenCalledWith("not-started");
});
