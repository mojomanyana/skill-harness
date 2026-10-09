import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import type { ExtensionAPI, CmdCtx } from "./commands.js";

export interface CandidateObservation {
  requestId: string;
  sessionId: string;
  observedAt: string;
  candidate: { algorithm: "principal-candidate-v1"; root: string; id: string; [key: string]: unknown };
}

/** Optional synchronous, session-bound observation from the installed Principal extension.
 * No algorithm copy, package lookup, model-supplied path, provider call or approval inference.
 */
export function observePrincipalCandidate(pi: ExtensionAPI, ctx: Pick<CmdCtx, "sessionManager" | "cwd">, expected: string): CandidateObservation | undefined {
  if (!pi.events?.emit) return undefined;
  const requestId = randomUUID();
  const sessionId = ctx.sessionManager?.getSessionId();
  const replies: any[] = [];
  let accepting = true;
  try {
    pi.events.emit("principal:candidate-observe", { requestId, sessionId, reply: (value: unknown) => { if (accepting) replies.push(value); } });
  } catch { throw new Error("Principal candidate observation failed"); }
  finally { accepting = false; }
  if (!replies.length) return undefined;
  if (replies.length !== 1) throw new Error("Ambiguous Principal candidate observation");
  const result = replies[0];
  if (!result || result.requestId !== requestId || result.sessionId !== sessionId || result.error ||
      result.candidate?.algorithm !== "principal-candidate-v1" || typeof result.candidate.root !== "string" ||
      result.candidate.id !== expected || realpathSync(result.candidate.root) !== realpathSync(ctx.cwd))
    throw new Error("Principal candidate observation does not match this session, workspace and selected candidate");
  return { requestId, sessionId: sessionId!, observedAt: new Date().toISOString(), candidate: JSON.parse(JSON.stringify(result.candidate)) };
}
