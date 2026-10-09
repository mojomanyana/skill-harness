import type { CmdCtx, ExtensionAPI } from "./commands.js";
import type { JevController } from "./jev-session.js";

export const JEV_CONTROL_CHANNEL = "skill-harness:jev-control-v1";
export const JEV_STATE_CHANNEL = "skill-harness:jev-state-v1";

/** Optional dashboard integration. Permission always comes from native parent Pi dialogs. */
export function registerJevControl(pi: ExtensionAPI, controller: JevController) {
  if (!pi.events) return;
  let bound: { ctx: CmdCtx; sessionId: string } | undefined;
  const handled = new Map<string, string>();
  let pending: { requestId: string; sessionId: string } | undefined;
  const bind = (_event?: unknown, ctx?: CmdCtx) => {
    const sessionId = ctx?.sessionManager?.getSessionId();
    bound = ctx && sessionId ? { ctx, sessionId } : undefined;
    pending = undefined;
    handled.clear();
  };
  pi.on("session_start", bind);
  pi.on("session_switch", bind);
  const unsubscribe = pi.events.on(JEV_CONTROL_CHANNEL, (value: unknown) => {
    const request = value as any;
    if (!request || typeof request.reply !== "function" || typeof request.requestId !== "string" ||
        !request.requestId || request.requestId.length > 512 || typeof request.sessionId !== "string") return;
    const envelope = { version: 1, requestId: request.requestId, sessionId: request.sessionId };
    const respond = (response: unknown) => { try { request.reply(response); } catch { /* Caller can request status again. */ } };
    const reply = (error?: string) => respond({ ...envelope,
      status: bound ? controller.status(bound.ctx) : null, pending: !!pending, ...(error ? { error } : {}) });
    const owner = bound;
    if (!owner || owner.sessionId !== request.sessionId || owner.ctx.sessionManager?.getSessionId() !== owner.sessionId) {
      respond({ ...envelope, status: null, pending: false, error: "session-unavailable" }); return;
    }
    if (request.version !== 1 || Object.keys(request).some(key => !["version", "requestId", "sessionId", "action", "reply"].includes(key))) {
      reply("invalid-request"); return;
    }
    if (request.action === "status") { reply(); return; }
    if (request.action !== "enable" && request.action !== "disable") { reply("invalid-action"); return; }
    if (handled.has(request.requestId)) {
      reply(handled.get(request.requestId) === request.action ? undefined : "request-id-reused"); return;
    }
    if (request.action === "enable" && pending) { reply("consent-pending"); return; }
    if (request.action === "enable" && (!owner.ctx.hasUI || !owner.ctx.ui.confirm || !owner.ctx.ui.select)) {
      reply("native-consent-unavailable"); return;
    }
    // Disable can revoke an in-flight activation; its unanswered UI cannot restore permission.
    handled.set(request.requestId, request.action);
    if (handled.size > 32) handled.delete(handled.keys().next().value!);
    const token = { requestId: request.requestId, sessionId: owner.sessionId };
    if (request.action === "enable") pending = token;
    const operation = controller.command(request.action === "enable" ? "enable workflow" : "disable", owner.ctx);
    reply();
    void operation.then(() => finish(), () => finish("control-failed"));
    function finish(error?: string) {
      if (pending === token) pending = undefined;
      if (!owner || bound !== owner || owner.ctx.sessionManager?.getSessionId() !== owner.sessionId) return;
      try { pi.events?.emit?.(JEV_STATE_CHANNEL, { ...envelope,
        status: controller.status(owner.ctx), pending: !!pending, ...(error ? { error } : {}) }); }
      catch { /* The caller can refresh status; native consent is already settled. */ }
    }
  });
  pi.on("session_shutdown", () => { bound = undefined; pending = undefined; handled.clear(); unsubscribe(); });
}
