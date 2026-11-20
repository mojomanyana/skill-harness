import { finishTaskDispatch, type bindTaskDispatch, type DispatchReceipt } from "./task-dispatch.js";

// Capture the selected task on entry. A reservation is acquired only at the
// existing native pre-dispatch hook, after caller consent and credential checks.
export async function withAdviceDispatch<T>(
  admit: ReturnType<typeof bindTaskDispatch>, operationId: string, parent: AbortSignal,
  beforeDispatch: () => void,
  work: (signal: AbortSignal, authorize: () => Promise<void>) => Promise<T>,
): Promise<T> {
  let receipt: DispatchReceipt | undefined;
  let attempted = false, sent = false, completed = false;
  const controller = new AbortController();
  const signal = AbortSignal.any([parent, controller.signal]);
  const abort = () => controller.abort();
  try {
    const value = await work(signal, async () => {
      if (attempted) throw new Error("Duplicate advice dispatch refused.");
      attempted = true;
      signal.throwIfAborted();
      if (admit) {
        receipt = await admit({ operationId });
        receipt.signal.addEventListener("abort", abort, { once: true });
        if (receipt.signal.aborted) abort();
      }
      signal.throwIfAborted();
      beforeDispatch();
      sent = true;
    });
    completed = true;
    return value;
  } finally {
    receipt?.signal.removeEventListener("abort", abort);
    await finishTaskDispatch(receipt, !sent ? "not-started" : completed ? "settled" : "unknown");
  }
}
