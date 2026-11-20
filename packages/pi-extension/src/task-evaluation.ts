import { AsyncLocalStorage } from "node:async_hooks";
import { getProcessSignal, isProcessControlError, ProcessControlError, withProcessObserver, withProcessScope, type HarnessAdapter } from "@skill-harness/core";
import { finishTaskDispatch, type bindTaskDispatch, type DispatchReceipt } from "./task-dispatch.js";

// The core aborts a controlled operation without grading its blocked attempt.
export class TaskAdmissionError extends ProcessControlError {
  constructor(message: string) { super("aborted", message); }
}

type Admit = NonNullable<ReturnType<typeof bindTaskDispatch>>;
type State = {
  admit: Admit; id: string; receipt?: Promise<DispatchReceipt>; denial?: Error;
  uncertain: boolean; started: boolean; active: number;
};
const activeEvaluation = new AsyncLocalStorage<State>();

// Guard the first actual subject/judge invocation. Reading cached answers,
// checking a version or loading a specification does not start a task attempt.
export async function withTaskEvaluation<T>(admit: Admit | undefined, id: string, run: () => Promise<T>): Promise<T> {
  if (!admit) return run();
  const state: State = { admit, id, uncertain: false, started: false, active: 0 };
  try {
    const result = await activeEvaluation.run(state, run);
    if (state.denial) throw state.denial;
    return result;
  } finally {
    const receipt = await state.receipt?.catch(() => undefined);
    await finishTaskDispatch(receipt, !state.started ? "not-started" : state.uncertain || state.active ? "unknown" : "settled");
  }
}

export function taskEvaluationAdapter(adapter: HarnessAdapter): HarnessAdapter {
  const state = activeEvaluation.getStore();
  if (!state) return adapter;
  const invoke = async <T>(run: () => Promise<T>): Promise<T> => {
    state.receipt ??= state.admit({ operationId: state.id }).catch(error => {
      state.denial = new TaskAdmissionError(error instanceof Error ? error.message : "The task controller declined this evaluation.");
      throw state.denial;
    });
    const receipt = await state.receipt;
    const caller = getProcessSignal();
    const signal = caller ? AbortSignal.any([caller, receipt.signal]) : receipt.signal;
    if (signal.aborted) throw new ProcessControlError("aborted", "Evaluation cancelled before invocation.");
    let processSettlements = 0;
    state.active++;
    state.started = true;
    try {
      return await withProcessScope({ signal }, () => withProcessObserver(observation => {
        processSettlements++;
        if (!observation.cleanup.pipesClosed || observation.cleanup.groupGone !== true) state.uncertain = true;
      }, run));
    } catch (error) {
      // A native process control exception can carry conclusive cleanup.
      // A generic transport rejection can also mean a remote effect is still running.
      if (!processSettlements || !isProcessControlError(error)) state.uncertain = true;
      throw error;
    } finally { state.active--; }
  };
  return {
    name: adapter.name, preferStructured: adapter.preferStructured,
    available: () => adapter.available(),
    ...(adapter.version ? { version: (options) => adapter.version!(options) } : {}),
    run: req => invoke(() => adapter.run(req)),
    judge: req => invoke(() => adapter.judge(req)),
    ...(adapter.runStructured ? { runStructured: req => invoke(() => adapter.runStructured!(req)) } : {}),
    ...(adapter.judgeStructured ? { judgeStructured: req => invoke(() => adapter.judgeStructured!(req)) } : {}),
  };
}
