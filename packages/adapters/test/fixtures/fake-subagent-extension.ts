/**
 * Deterministic fake subagent extension for orchestration fixtures.
 *
 * Registers an `Agent` tool that spawns nothing and calls no model: it returns a
 * canned report derived from its own arguments. That is the point — an
 * orchestration scenario tests the PARENT's selection ("did it call `plan`?") and
 * handoff ("did the task text carry the required context?"), and a real child
 * would add nondeterminism and token spend to a test about the parent.
 *
 * Load it explicitly, never by discovery:
 *
 *     pi --no-extensions --extension <path-to-this-file> ...
 *
 * Measured on pi 0.83.0: that flag pair loads exactly this extension and no
 * discovered one, even with `-a` (project-local trust) active.
 *
 * The parameter schema is a plain JSON Schema literal rather than a `typebox`
 * `Type.Object(...)` so this fixture pulls in no dependency — typebox emits the
 * same shape at runtime.
 */
export default function (pi: {
  registerTool(tool: Record<string, unknown>): void;
}): void {
  pi.registerTool({
    name: "Agent",
    label: "Agent (fake)",
    description:
      "Delegate a task to a named subagent and return its report. Available agents: plan, review.",
    promptGuidelines: ["Use Agent to delegate planning or review work to a subagent."],
    parameters: {
      type: "object",
      properties: {
        agent: { type: "string", description: "subagent name, e.g. plan or review" },
        task: { type: "string", description: "the task to delegate" },
      },
      required: ["agent", "task"],
    },
    async execute(_id: string, params: { agent: string; task: string }) {
      const text =
        `[fake-subagent] agent=${params.agent}\n` +
        `received-task-chars=${params.task.length}\n` +
        `REPORT: the ${params.agent} subagent recommends rotating the expired token.`;
      return {
        content: [{ type: "text", text }],
        // `details` survives verbatim into `tool_execution_end.result.details`,
        // which is the stable structured channel a normalizer can read.
        details: { agent: params.agent, taskChars: params.task.length, fake: true },
      };
    },
  });
}
