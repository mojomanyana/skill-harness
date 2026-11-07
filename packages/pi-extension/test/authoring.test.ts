import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
    expect(message).toContain("call skill_author with action reference");
    expect(message).toContain("specification must be saved before task-contract");
    expect(message).toContain("Routine implementation regression tests do not need this adoption step");
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

  it("preserves exact draft application, then offers concise label review with optional evidence and exact acceptance reuse", async () => {
    const { root, ctx, name, manifestPath, reviewPath, taskPath, criteria, alternatives } = await prepareReview();
    expect(readFileSync(join(root, "skills/social-manager/SKILL.md"), "utf8")).toContain("Draft copy");
    const authoring = JSON.parse(readFileSync(join(root, "skills/social-manager/tests/authoring.json"), "utf8"));
    expect(authoring).toMatchObject({ labelStatus: "proposed", modelQualityEvaluated: false, calibrated: false, agent: null });
    ctx.ui.editor = vi.fn(async () => "User edits here must never replace evidence");
    ctx.ui.confirm = vi.fn();
    ctx.ui.select = vi.fn().mockResolvedValueOnce("Cancel").mockResolvedValueOnce("View full evidence").mockResolvedValueOnce("Accept proposed labels");
    const args = { action: "review-controls" as const, name, reviewPath };
    expect((await execute(args, ctx)).details).toMatchObject({ accepted: false, providerCalls: 0 });
    expect(ctx.ui.editor).not.toHaveBeenCalled();
    const primary = vi.mocked(ctx.ui.select).mock.calls[0][0];
    expect(primary).toContain("Required outcomes:");
    expect(primary).toContain("Provide the requested announcement draft");
    expect(primary).toContain("good [A1]: PASS (PASS)");
    expect(primary).toContain("bad [A1]: FAIL");
    expect(primary).not.toContain("<<< ASSISTANT");
    expect(primary).not.toContain('"checklist"');

    const accepted = (await execute(args, ctx)).details as any;
    expect(accepted).toMatchObject({ accepted: true, ready: true, providerCalls: 0, reused: false });
    expect(ctx.ui.confirm).not.toHaveBeenCalled();
    expect(ctx.ui.editor).toHaveBeenCalledOnce();
    const full = JSON.parse(vi.mocked(ctx.ui.editor).mock.calls[0][1]);
    expect(full.taskContract.obligations[0].id).toBe("draft");
    expect(full.contractReview.criteria[0].materiality).toContain("No draft");
    expect(full.controls.find((control: any) => control.id === "good").expectedCriteria).toEqual(["PASS"]);
    const saved = JSON.parse(readFileSync(accepted.manifestPath, "utf8"));
    expect(saved.controls[0]).toMatchObject({ expectedCriteria: ["PASS"], review: { status: "accepted" } });
    expect(saved.controls[0].transcript).not.toContain("User edits here");
    const original = readFileSync(manifestPath, "utf8");
    expect(JSON.parse(original).controls.every((control: any) => control.review.status === "proposed")).toBe(true);
    const resumed = context(root); resumed.hasUI = false;
    expect((await execute(args, resumed)).details).toMatchObject({ accepted: true, reused: true, manifestPath: accepted.manifestPath, providerCalls: 0 });
    expect(readFileSync(manifestPath, "utf8")).toBe(original);

    // A changed proposal cannot borrow acceptance from the preceding labels.
    const revised = (await execute({ action: "controls", name, manifest: "skills/social-manager/tests/revised-controls.json",
      controls: JSON.parse(original).controls.map(({ review: _review, ...control }: any) =>
        control.id === "bad" ? { ...control, expected: "PASS" } : control),
    }, ctx)).details as any;
    const revisedReview = (await execute({ action: "contract-review", name, manifest: revised.manifestPath, taskPath,
      criteria, alternatives, reviewSummary: "The revised proposal changes one expected label and requires operator review." }, ctx)).details as any;
    ctx.ui.select = vi.fn(async () => "Cancel");
    expect((await execute({ action: "review-controls", name, manifest: revised.manifestPath, reviewPath: revisedReview.reviewPath }, ctx)).details)
      .toMatchObject({ accepted: false, providerCalls: 0 });
    expect(ctx.ui.select).toHaveBeenCalledOnce();
    expect(readFileSync(manifestPath, "utf8")).toBe(original);
  });

  it("returns actionable agent preparation for missing or unresolved review without asking the operator", async () => {
    const { root, ctx, name, taskPath, criteria, alternatives } = await prepareReview();
    ctx.ui.select = vi.fn(); ctx.ui.confirm = vi.fn();
    const missing = (await execute({ action: "review-controls", name }, ctx)).details as any;
    expect(missing).toMatchObject({ accepted: false, status: "author-preparation-needed", providerCalls: 0 });
    expect(missing.next).toContain("authoring agent");
    const unresolved = (await execute({ action: "contract-review", name, taskPath,
      criteria: criteria.map(criterion => ({ ...criterion, status: "unresolved" as const })),
      alternatives, reviewSummary: "Whether this task needs a draft remains unresolved." }, ctx)).details as any;
    expect((await execute({ action: "review-controls", name, reviewPath: unresolved.reviewPath }, ctx)).details)
      .toMatchObject({ accepted: false, status: "author-preparation-needed", providerCalls: 0 });
    expect(ctx.ui.select).not.toHaveBeenCalled();
    expect(ctx.ui.confirm).not.toHaveBeenCalled();
    expect(readFileSync(join(root, "skills/social-manager/tests/calibration.json"), "utf8")).toContain('"proposed"');
  });

  it("keeps no-UI review pending and allows evidence-view cancellation without accepting labels", async () => {
    const { ctx, name, reviewPath } = await prepareReview();
    ctx.hasUI = false;
    const pending = (await execute({ action: "review-controls", name, reviewPath }, ctx)).details as any;
    expect(pending).toMatchObject({ accepted: false, awaitingAuthorReview: true, providerCalls: 0, reviewPath });
    expect(pending.summary).toContain("good [A1]: PASS");
    ctx.hasUI = true;
    ctx.ui.select = vi.fn(async () => "View full evidence");
    ctx.ui.editor = vi.fn(async () => null);
    expect((await execute({ action: "review-controls", name, reviewPath }, ctx)).details).toMatchObject({ accepted: false });
    expect(ctx.ui.select).toHaveBeenCalledOnce();
  });

  it.each(["brief", "manifest", "review"] as const)("refuses %s changes made while label confirmation is open", async change => {
    const { root, ctx, name, manifestPath, reviewPath } = await prepareReview();
    ctx.ui.confirm = vi.fn(async () => {
      if (change === "brief") await execute({ action: "answer", name, answers: { boundaries: "Draft only; do not email" } }, ctx);
      else {
        const path = change === "manifest" ? manifestPath : reviewPath;
        const value = JSON.parse(readFileSync(path, "utf8"));
        if (change === "manifest") value.controls[0].rationale += " Changed during review.";
        else value.summary += " Changed during review.";
        writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
      }
      return true;
    });
    await expect(execute({ action: "review-controls", name, reviewPath }, ctx)).rejects.toThrow(/changed|stale|current|match/i);
    expect(ctx.ui.confirm).toHaveBeenCalledOnce();
    expect(readFileSync(join(root, "skills/social-manager/tests/calibration.json"), "utf8")).toContain('"proposed"');
  });
});

async function prepareReview() {
  const root = makeRoot(); const ctx = context(root); const name = "social-manager";
  await execute({ action: "start", name, idea: "Draft only", answers: {
    purpose: "Draft campaign copy", outcomes: "Useful drafts", boundaries: "Never publish", delivery: "skill", placement: "same-repo",
  } }, ctx);
  ctx.ui.input = vi.fn().mockResolvedValue("");
  expect((await execute({ action: "question", name }, ctx)).details).toMatchObject({ state: { answers: { tools: [] } }, nextQuestion: null });
  const staged = (await execute({ action: "draft", name, draft: {
    files: [
      { area: "skill", path: "SKILL.md", content: "---\nname: social-manager\ndescription: Draft campaigns in Pi\n---\nDraft copy; ask before publishing.\n" },
      { area: "evals", path: "specification.yaml", content: "skill: social-manager\njudge_persona: Evaluate draft quality\nship_bar: { total: 1, min_pass: 1 }\nscenarios:\n  - id: A1\n    title: A useful draft\n    turns: [Draft an announcement]\n    env: { tools: [] }\n    checklist: [Provides draft copy]\n" },
    ], requirements: [{ id: "R1", description: "Provide drafts", scenarios: ["A1"] }],
  } }, ctx)).details as any;
  expect(staged.state.draft.data.labelStatus).toBe("proposed");
  expect(staged.readyToApply).toBe(true);
  await expect(execute({ action: "apply", name, digest: "wrong" }, ctx)).rejects.toThrow("cannot be applied");
  await execute({ action: "apply", name, digest: staged.draftDigest }, ctx);

  // The first pass sees trusted task inputs before any preferred answers/labels exist.
  const inspected = (await execute({ action: "task-contract", name }, ctx)).details as any;
  expect(inspected.sources.find((source: any) => source.id === "task:A1:0").text).toBe("Draft an announcement");
  expect(inspected).not.toHaveProperty("controls");
  const task = (await execute({ action: "task-contract", name, expectedInputSha256: inspected.inputSha256,
    obligations: [{ id: "draft", scenarioId: "A1", kind: "task", anchors: [{ sourceId: "task:A1:0", quote: "Draft an announcement" }],
      rationale: "Provide the requested announcement draft" }],
  }, ctx)).details as any;
  const transcript = (answer: string) => `>>> USER:\nDraft an announcement\n\n<<< ASSISTANT:\n${answer}\n`;
  const prepared = (await execute({ action: "controls", name, controls: [
    { id: "good", scenarioId: "A1", expected: "PASS", expectedCriteria: ["PASS"], kind: "authored", transcript: transcript("Here is a draft announcement."), rationale: "Provides requested copy" },
    { id: "bad", scenarioId: "A1", expected: "FAIL", kind: "authored", transcript: transcript("I cannot provide a draft."), rationale: "Omits requested copy" },
    { id: "alternative", scenarioId: "A1", expected: "PASS", kind: "equivalent", equivalentTo: "good", transcript: transcript("Draft: We are announcing our event."), rationale: "Another valid draft" },
  ] }, ctx)).details as any;
  expect(prepared).toMatchObject({ ready: false, providerCalls: 0 });
  const criteria = [{ scenarioId: "A1", criterionIndex: 0, obligationIds: ["draft"],
    materiality: "No draft means the requested deliverable is missing", status: "justified" as const }];
  const alternatives = [{ controlId: "alternative", criteria: [{ scenarioId: "A1", criterionIndex: 0 }],
    omittedOptional: "No optional steps found; the request is already minimal", rationale: "This concise draft supplies the complete requested outcome" }];
  const reviewed = (await execute({ action: "contract-review", name, taskPath: task.taskPath, criteria, alternatives,
    reviewSummary: "Only an announcement draft is required; publishing and extra plans are outside this task." }, ctx)).details as any;
  return { root, ctx, name, manifestPath: prepared.manifestPath, taskPath: task.taskPath, reviewPath: reviewed.reviewPath, criteria, alternatives };
}
