import { isProcessControlError, modelProfileLabel, type summarizeRun } from "@skill-harness/core";
import { bindTaskDispatch } from "./task-dispatch.js";
import { TaskAdmissionError, withTaskEvaluation } from "./task-evaluation.js";
import { randomUUID } from "node:crypto";
import { bindTaskHistory } from "./task-history.js";
import type { ExtensionAPI } from "./commands.js";

type Summary = ReturnType<typeof summarizeRun>;
type Context = { cwd: string; sessionManager?: { getSessionId(): string } };
type Item = { id: string; kind: "status" | "evidence"; label: string; state: "running" | "settled" | "failed" | "observed"; details?: string[] };
type Handle = { publish(update: { sequence: number; items: Item[] }): boolean; close(): void };
export interface HarnessDashboard {
  run<T>(ctx: Context, work: () => Promise<T>, summary: (result: T) => Summary | undefined, observation?: { id?: string; kind?: "evaluation" | "regrade"; digest?: (result: T) => string | undefined }): Promise<T>;
}

// This is a producer of the existing optional display protocol. It holds no run
// store, requests no tools, and imports no Daddy implementation or authority.
export function createHarnessDashboard(pi: ExtensionAPI, version: string): HarnessDashboard {
  let handle: Handle | undefined, identity = "", generation = 0, sequence = 0, operation = 0;
  const close = () => {
    generation++; identity = "";
    try { handle?.close(); } catch { /* Optional display must not affect evaluation. */ }
    handle = undefined;
  };
  for (const event of ["session_shutdown", "session_switch", "session_tree", "session_fork"] as const) pi.on(event, close);
  const text = (value: string) => {
    let valueBounded = value.replace(/[\u0000-\u001f\u007f]/g, " ");
    while (Buffer.byteLength(valueBounded, "utf8") > 220) valueBounded = valueBounded.slice(0, -1);
    return valueBounded;
  };
  const publish = (items: Item[]) => { try { handle?.publish({ sequence: ++sequence, items }); } catch { /* Display only. */ } };
  return {
    async run(ctx, work, summary, observation) {
      const record = bindTaskHistory(pi.events, "harness", ctx);
      const operationId = observation?.id ?? randomUUID();
      const admit = bindTaskDispatch(pi.events, "harness", ctx);
      const kind = observation?.kind ?? "evaluation";
      const sessionId = ctx.sessionManager?.getSessionId();
      const nextIdentity = sessionId ? JSON.stringify([sessionId, ctx.cwd]) : "";
      if (identity !== nextIdentity) close();
      if (nextIdentity && !handle && pi.events?.emit) {
        identity = nextIdentity;
        const ownGeneration = generation;
        try {
          pi.events.emit("pi-daddy:dashboard-source:v1", {
            version: 1, sessionId, cwd: ctx.cwd, producer: "skill-harness", producerVersion: version,
            reply: (reply: unknown) => {
              const candidate = reply as { version?: number; ok?: boolean; publish?: unknown; close?: unknown } | null;
              if (candidate?.version !== 1 || candidate.ok !== true || typeof candidate.publish !== "function" || typeof candidate.close !== "function") return;
              if (ownGeneration !== generation || nextIdentity !== identity) { try { candidate.close(); } catch { /* Closed session. */ } return; }
              handle = candidate as Handle;
            },
          });
        } catch { /* Daddy may be absent; evaluation proceeds. */ }
      }
      await record(operationId, kind, "observed", "Harness received this evaluation request.");
      const ticket = ++operation, ownGeneration = generation;
      publish([{ id: "activity", kind: "status", label: "Harness evaluation active", state: "running", details: ["Run operation started. Waiting reason and provider request count are unknown."] }]);
      try {
        const result = await withTaskEvaluation(admit, operationId, work);
        let value: Summary | undefined;
        try { value = summary(result); } catch { /* An unavailable summary does not change the result. */ }
        let digest: string | undefined;
        try { digest = observation?.digest?.(result); } catch { /* Optional reference unavailable. */ }
        if (value?.outcomes) {
          const o = value.outcomes;
          const incomplete = !o.scenarios || o.executionOrEvidenceErrors || o.ungraded ||
            o.notMeasured || o.ambiguous || o.suspect || o.recordedExecutionOrEvidenceErrors;
          record(operationId, kind, incomplete ? "partial" : "recorded",
            `Harness outcomes: ${o.passed} passed, ${o.recordedFailures} failed, ${o.executionOrEvidenceErrors} errors, ${o.ungraded} ungraded, ${o.notMeasured} unmeasured, ${o.ambiguous} ambiguous, ${o.suspect} suspect, ${o.overrides} overrides.`,
            digest ? { type: "evaluation", id: digest } : undefined);
        } else {
          record(operationId, kind, "unconfirmed", "Harness operation ended. Scenario evidence unavailable.");
        }
        if (ticket === operation && ownGeneration === generation) {
          try {
          const observed = (models: Summary["subject"]["observedModels"]) => models.length ? models.map(model => `${model.provider ?? "unknown"}:${model.model ?? "unknown"}`).join(", ") : "unknown";
          const items: Item[] = [{ id: "activity", kind: "status", label: "Harness evaluation settled", state: "settled" }];
          if (value) items.push({ id: "run-evidence", kind: "evidence", label: "Harness retained evidence", state: "observed", details: [
            `Subject requested ${modelProfileLabel(value.subject.requested)}; observed ${observed(value.subject.observedModels)}; effective effort unknown.`,
            `Judge requested ${modelProfileLabel(value.judge.requested)}; observed ${observed(value.judge.observedModels)}; effective effort unknown.`,
            `Outcomes: ${value.outcomes.passed} PASS; ${value.outcomes.recordedFailures} FAIL; ${value.outcomes.executionOrEvidenceErrors} ERROR; ${value.outcomes.ungraded} ungraded; ${value.outcomes.notMeasured} not measured; ${value.outcomes.ambiguous} ambiguous.`,
            `Retained token observations: subject ${value.usage.subject.recordedInvocations}/unknown; judge ${value.usage.judge.recordedInvocations}/${value.usage.judge.expectedInvocations ?? "unknown"} attempts. Coverage is not billing.`,
            "Saved evidence may be reused; it is not a fresh trial. Diagnose for per-scenario reuse and counter coverage.",
            "Operation completion is not product success. Errors require execution/evidence diagnosis. Detailed evidence: Harness review or diagnose.",
          ].map(text) });
          publish(items);
          } catch {
            publish([{ id: "activity", kind: "status", label: "Harness evaluation settled", state: "settled", details: ["Evidence summary unavailable; inspect Harness review or diagnose."] }]);
          }
        }
        return result;
      } catch (error) {
        const refused = error instanceof TaskAdmissionError;
        const cancelled = (isProcessControlError(error) && error.reason === "aborted") ||
          (error instanceof Error && error.name === "AbortError");
        record(operationId, kind, refused ? "refused" : cancelled ? "cancelled" : "failed",
          refused ? "Task policy declined this evaluation before dispatch." : cancelled ? "Harness operation cancelled." : "Harness operation failed before returning a scorecard.");
        if (ticket === operation && ownGeneration === generation) {
          publish([{ id: "activity", kind: "status",
            label: refused ? "Task declined Harness evaluation" : cancelled ? "Harness evaluation cancelled" : "Harness operation failed",
            // The source protocol's settled state means the operation ended, not that it succeeded.
            state: cancelled ? "settled" : "failed",
            details: [refused ? "Check the selected task, pause state and remaining allowance." : cancelled
              ? "Evaluation incomplete. Cancellation does not establish a result or approval. Inspect retained Harness diagnostics before deciding what to run next."
              : "Operation did not complete. Inspect Harness diagnostics; no product-failure conclusion is established."],
          }]);
        }
        throw error;
      }
    },
  };
}
