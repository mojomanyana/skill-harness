import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleAuthoringCommand, skillAuthorTool } from "../src/authoring.js";
import { registerCommand, type CmdCtx, type ExtensionAPI } from "../src/commands.js";

const roots: string[] = [];
const makeRoot = () => { const path = mkdtempSync(join(tmpdir(), "harness-author-ui-")); roots.push(path); return path; };
afterEach(() => { for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true }); });
const model = { provider: "configured-provider", id: "user-selected-model" };
const context = (cwd: string): CmdCtx => ({ cwd, model, hasUI: true, ui: { notify: vi.fn() } });
const execute = (params: Parameters<typeof skillAuthorTool.execute>[1], ctx: CmdCtx) =>
  skillAuthorTool.execute("test", params, new AbortController().signal, undefined, ctx);

describe("Pi authoring front door", () => {
  it("uses the existing Pi session and selected model without starting a provider client or assuming examples", async () => {
    const sendUserMessage = vi.fn();
    const pi = { sendUserMessage, getActiveTools: () => ["read", "skill_author", "delegate"] } as unknown as ExtensionAPI;
    await handleAuthoringCommand(pi, "create I need a social media manager subagent", context(makeRoot()));
    expect(sendUserMessage).toHaveBeenCalledOnce();
    const [message, options] = sendUserMessage.mock.calls[0];
    expect(options).toEqual({ deliverAs: "followUp", expandPromptTemplates: false });
    expect(message).toContain("configured-provider/user-selected-model");
    expect(message).toContain("I need a social media manager subagent");
    expect(message).toContain("an existing skill, examples, fixtures or YAML are not prerequisites");
    expect(message).toContain("Availability is not permission");
    expect(message).toContain("Keep the generated SKILL.md usable with Pi alone");
    expect(message).toContain("ask for the subject model when testing begins");
  });

  it("the registered command routes create/author before the legacy run parser and refuses absent Pi model", async () => {
    let handler: (args: string, ctx: CmdCtx) => Promise<void> = async () => {};
    const sendUserMessage = vi.fn();
    registerCommand({ registerCommand: (_name, command) => { handler = command.handler; }, sendUserMessage } as ExtensionAPI);
    const ctx = context(makeRoot());
    await handler("author social-media-manager", ctx);
    expect(sendUserMessage.mock.calls[0][0]).toContain("Resume or inspect the saved authoring project");
    await expect(handler("create social manager", { ...ctx, model: undefined })).rejects.toThrow("requires a Pi session");
    expect(sendUserMessage).toHaveBeenCalledOnce();
  });

  it("persists known answers and asks exactly one missing question, preserving cancellation and resume", async () => {
    const root = makeRoot(); const ctx = context(root);
    const base = { name: "social-manager" };
    await execute({ ...base, action: "start", idea: "Plan a social media campaign", answers: { purpose: "Create draft campaigns" } }, ctx);
    const input = vi.fn().mockResolvedValueOnce("A campaign calendar with sourced claims").mockResolvedValueOnce(null);
    ctx.ui.input = input;
    const answered = await execute({ ...base, action: "question" }, ctx);
    expect(input).toHaveBeenCalledOnce();
    expect((answered.details as any).state.answers.outcomes).toContain("sourced claims");
    expect((answered.details as any).nextQuestion.key).toBe("boundaries");
    const canceled = await execute({ ...base, action: "question" }, ctx);
    expect((canceled.details as any).awaitingUser).toBe(true);
    expect((await execute({ ...base, action: "status" }, context(root))).details).toMatchObject({ state: { answers: { outcomes: "A campaign calendar with sourced claims" } }, nextQuestion: { key: "boundaries" } });
  });

  it("accepts no-tool skills, stages proposed labels and applies an exact preview without granting or publishing", async () => {
    const root = makeRoot(); const ctx = context(root); const name = "social-manager";
    await execute({ action: "start", name, idea: "Draft only", answers: { purpose: "Draft campaign copy", outcomes: "Useful drafts", boundaries: "Never publish", delivery: "skill", placement: "same-repo" } }, ctx);
    ctx.ui.input = vi.fn().mockResolvedValue("");
    expect((await execute({ action: "question", name }, ctx)).details).toMatchObject({ state: { answers: { tools: [] } }, nextQuestion: null });
    const result = await execute({ action: "draft", name, draft: {
      files: [
        { area: "skill", path: "SKILL.md", content: "---\nname: social-manager\ndescription: Draft campaigns in Pi\n---\nDraft copy; ask before publishing.\n" },
        { area: "evals", path: "specification.yaml", content: "skill: social-manager\njudge_persona: Evaluate draft quality\nship_bar: { total: 1, min_pass: 1 }\nscenarios:\n  - id: A1\n    title: A useful draft\n    turns: [Draft an announcement]\n    env: { tools: [] }\n    checklist: [Provides draft copy]\n" },
      ], requirements: [{ id: "R1", description: "Provide drafts", scenarios: ["A1"] }],
    } }, ctx);
    const preview = result.details as any;
    expect(preview.state.draft.data.labelStatus).toBe("proposed");
    expect(preview.readyToApply).toBe(true);
    await expect(execute({ action: "apply", name, digest: "wrong" }, ctx)).rejects.toThrow("cannot be applied");
    await execute({ action: "apply", name, digest: preview.draftDigest }, ctx);
    expect(readFileSync(join(root, "skills/social-manager/SKILL.md"), "utf8")).toContain("Draft copy");
    const manifest = JSON.parse(readFileSync(join(root, "skills/social-manager/tests/authoring.json"), "utf8"));
    expect(manifest).toMatchObject({ labelStatus: "proposed", modelQualityEvaluated: false, calibrated: false, agent: null });
    const transcript = (answer: string) => `>>> USER:\nDraft an announcement\n\n<<< ASSISTANT:\n${answer}\n`;
    const prepared = await execute({ action: "controls", name, controls: [
      { id: "good", scenarioId: "A1", expected: "PASS", kind: "authored", transcript: transcript("Here is a draft announcement."), rationale: "Provides requested copy" },
      { id: "bad", scenarioId: "A1", expected: "FAIL", kind: "authored", transcript: transcript("I cannot provide a draft."), rationale: "Omits requested copy" },
      { id: "alternative", scenarioId: "A1", expected: "PASS", kind: "equivalent", equivalentTo: "good", transcript: transcript("Draft: We are announcing our event."), rationale: "Another valid draft" },
    ] }, ctx);
    expect(prepared.details).toMatchObject({ ready: false, providerCalls: 0 });
    ctx.ui.editor = vi.fn(async (_title, body) => body);
    ctx.ui.confirm = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    expect((await execute({ action: "review-controls", name }, ctx)).details).toMatchObject({ accepted: false });
    const accepted = await execute({ action: "review-controls", name }, ctx);
    expect(accepted.details).toMatchObject({ accepted: true, ready: true, providerCalls: 0 });
    expect(vi.mocked(ctx.ui.editor).mock.calls[0][1]).toContain('"checklist"');
    const proposal = JSON.parse(readFileSync((prepared.details as any).manifestPath, "utf8"));
    expect(proposal.controls.every((control: any) => control.review.status === "proposed")).toBe(true);
  });
});
