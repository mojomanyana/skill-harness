import { Type } from "typebox";
import type { ExtensionAPI } from "./commands.js";
import type { JevContext, JevController } from "./jev-session.js";
import { requireIdentity } from "./jev-packet.js";

const nullableNumber = Type.Union([Type.Number(), Type.Null()]);
const nullableString = Type.Union([Type.String(), Type.Null()]);
const adviceOutput = Type.Union([
  Type.Object({
    enabled: Type.Boolean(), mode: Type.Union([Type.Literal("disabled"), Type.Literal("manual"), Type.Literal("workflow")]),
    storage: Type.Union([Type.Literal("granted"), Type.Literal("declined"), Type.Null()]),
    remaining: Type.Integer({ minimum: 0 }), availability: Type.String(),
    providerReadiness: Type.Union([Type.Literal("key-present"), Type.Literal("missing-key")]), advisory: Type.Literal(true),
  }, { additionalProperties: false }),
  Type.Object({
    advisory: Type.Literal(true), status: Type.Union([Type.Literal("answered"), Type.Literal("unavailable")]),
    probability: Type.Union([Type.Number({ minimum: 0, maximum: 1 }), Type.Null()]),
    provider: Type.String(), requestedModel: Type.String(), resolvedModel: nullableString,
    usage: Type.Object({ inputTokens: nullableNumber, outputTokens: nullableNumber, costUsd: nullableNumber }, { additionalProperties: false }),
    latencyMs: nullableNumber, reason: Type.Optional(Type.String()), remaining: Type.Integer({ minimum: 0 }),
    inputSha256: Type.Optional(Type.String()), reused: Type.Optional(Type.Boolean()),
    source: Type.Optional(Type.Object({
      kind: Type.String(), sha256: Type.String(), sessionId: Type.String(), toolCallId: Type.String(),
      retained: Type.Boolean(), path: Type.Optional(Type.String()),
    }, { additionalProperties: false })),
  }, { additionalProperties: false }),
]);

export function createJevAdviceTool(controller: JevController) {
  return {
    name: "jev_advice",
    label: "JEV handoff advice",
    description: "Check session-local JEV workflow status without a provider call, or evaluate selected handoff evidence against the fixed acceptance-readiness question. Evaluation requires the user's explicit /skill-harness jev enable workflow activation. Advisory probability never grants approval or replaces tests/review. Select only relevant public or already-redacted evidence; do not include secrets, transcripts, reviewer verdicts or hidden reasoning.",
    promptGuidelines: [
      "Use jev_advice action=status to discover whether JEV workflow advice is enabled.",
      "When enabled and useful uncertainty remains after deterministic checks, optionally evaluate a selected handoff before independent review. Do not call for every feature or retry unavailable advice.",
      "Keep JEV advice out of the independent reviewer's inputs; act on independently verified issues rather than treating its probability as a verdict.",
    ],
    parameters: Type.Object({
      action: Type.Union([Type.Literal("status"), Type.Literal("evaluate")]),
      candidate: Type.Optional(Type.String({ minLength: 1, maxLength: 16000, description: "Reported candidate identity; this is a claim, not an authenticated Git binding." })),
      requirements: Type.Optional(Type.String({ minLength: 1, maxLength: 16000, description: "Explicit acceptance checks, before seeing independent review or JEV outcomes." })),
      evidence: Type.Optional(Type.String({ minLength: 1, maxLength: 16000, description: "Selected decision-time handoff evidence. Complete JSON packet is limited to 16000 characters." })),
    }, { additionalProperties: false }),
    outputSchema: adviceOutput,
    async execute(id: string, params: unknown, signal: AbortSignal | undefined, _onUpdate: unknown, ctx: JevContext) {
      requireIdentity(id, "Pi toolCallId");
      if (!params || typeof params !== "object" || Array.isArray(params)) throw new Error("Invalid jev_advice parameters");
      const p = params as Record<string, unknown>;
      const expected = p.action === "status" ? ["action"] : ["action", "candidate", "requirements", "evidence"];
      if (Object.keys(p).length !== expected.length || expected.some((key) => !Object.hasOwn(p, key)))
        throw new Error("jev_advice accepts only its documented status or evaluate fields");
      let details;
      if (p.action === "status") details = controller.status(ctx);
      else if (p.action === "evaluate")
        details = await controller.evaluate(
          { candidate: p.candidate as string, requirements: p.requirements as string, evidence: p.evidence as string },
          id, signal, ctx,
        );
      else throw new Error("jev_advice action must be status or evaluate");
      // Codemode and direct tool calls share the session-bound consent/accounting controller.
      return { content: [{ type: "text" as const, text: JSON.stringify(details) }], details, structuredContent: details };
    },
  };
}

export function registerJevAdvice(pi: ExtensionAPI, controller: JevController) {
  pi.registerTool(createJevAdviceTool(controller));
}
