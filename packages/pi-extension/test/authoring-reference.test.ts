import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectAuthoringTaskContract, parseSpec } from "@skill-harness/core";
import { skillAuthorTool } from "../src/authoring.js";
import type { CmdCtx } from "../src/commands.js";

const roots: string[] = [];
const makeRoot = () => { const root = mkdtempSync(join(tmpdir(), "harness-author-reference-")); roots.push(root); return root; };
afterEach(() => {
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const context = (cwd: string, selectedModel = true): CmdCtx => ({ cwd, hasUI: false, ui: { notify: vi.fn() },
  ...(selectedModel ? { model: { provider: "configured", id: "selected" } } : {}) });
const execute = (params: Parameters<typeof skillAuthorTool.execute>[1], ctx: CmdCtx) =>
  skillAuthorTool.execute("reference-test", params, new AbortController().signal, undefined, ctx);

it("reads the exact reference before any project/name/model without files, provider calls or consent", async () => {
  const root = makeRoot(); const ctx = context(root, false);
  const fetch = vi.fn(() => { throw new Error("Unexpected provider/network call"); });
  vi.stubGlobal("fetch", fetch);
  const reference = (await execute({ action: "reference" }, ctx)).details as any;
  expect(reference).toMatchObject({ status: "reference", readOnly: true, providerCalls: 0 });
  expect(reference.schema).toEqual(JSON.parse(readFileSync(new URL("../../../schemas/specification-v1.schema.json", import.meta.url), "utf8")));
  const parsed = parseSpec(JSON.stringify(reference.minimalSpecification), "reference-example");
  expect(parsed.skill).toBe("example-skill");
  expect(parsed.scenarios[0]).toMatchObject({ turns: ["Acknowledge receipt of this request in one sentence."], tools: [], judgeEvidence: "response" });
  expect((await execute({ action: "reference" }, ctx)).details).toEqual(reference);
  expect(reference.schemaIdentity).toMatchObject({ algorithm: "sha256", encoding: "JSON.stringify(schema), UTF-8",
    sha256: createHash("sha256").update(JSON.stringify(reference.schema)).digest("hex") });
  reference.schema.required.push("invented");
  const fresh = (await execute({ action: "reference" }, ctx)).details as any;
  expect(fresh.schema.required).not.toContain("invented");
  expect(fresh.schemaIdentity).toEqual(reference.schemaIdentity);
  expect(reference.execution.workspaces.map((workspace: any) => workspace.value)).toEqual(["none", "empty-git", "fixture:<path>"]);
  expect(reference.execution.sessions).toContain("not /new");
  expect(reference.execution.authority).toContain("does not grant");
  expect(reference).not.toHaveProperty("accepted");
  expect(reference).not.toHaveProperty("controls");
  expect(readdirSync(root)).toEqual([]);
  expect(fetch).not.toHaveBeenCalled();
  await expect(execute({ action: "status" } as any, ctx)).rejects.toThrow("requires a saved project name");
  await expect(execute({ action: "start", name: "example-skill", idea: "Acknowledge requests" }, ctx)).rejects.toThrow("selected Pi model");
  expect(readdirSync(root)).toEqual([]);
});

// Deterministic portion of adopted manual regression MV-20261107-001.
// Real model discovery and human usability still require the separate manual trial.
it.each(["same-repo", "separate-repo"] as const)("recovers a malformed fresh draft using the reference and saves before task review (%s)", async placement => {
  const root = makeRoot(); const ctx = context(root); const name = "example-skill";
  const fetch = vi.fn(() => { throw new Error("Unexpected provider/network call"); });
  vi.stubGlobal("fetch", fetch);
  const reference = (await execute({ action: "reference" }, ctx)).details as any;
  await execute({ action: "start", name, idea: "Acknowledge requests", answers: {
    purpose: "Acknowledge receipt", outcomes: "One sentence acknowledging the request", boundaries: "No external actions",
    tools: [], delivery: "skill", placement, ...(placement === "separate-repo" ? { evalRoot: "evaluations" } : {}),
  } }, ctx);
  const draft = (spec: Record<string, unknown>) => ({
    files: [
      { area: "skill" as const, path: "SKILL.md", content: "---\nname: example-skill\ndescription: Acknowledge requests\n---\nAcknowledge receipt in one sentence. Do not take external action.\n" },
      { area: "evals" as const, path: "specification.yaml", content: JSON.stringify(spec) },
    ], requirements: [{ id: "R1", description: "Acknowledge receipt in one sentence", scenarios: ["A1"] }],
  });
  const { judge_persona: _omitted, ...invalid } = reference.minimalSpecification;
  const broken = (await execute({ action: "draft", name, draft: draft(invalid) }, ctx)).details as any;
  expect(broken.readyToApply).toBe(false);
  expect(broken.issues.join("\n")).toContain("judge_persona");
  expect(broken.next).toContain("action reference");
  expect(broken.next).toContain("before task-contract");
  await expect(execute({ action: "task-contract", name }, ctx)).rejects.toThrow("requires the saved specification");

  const ready = (await execute({ action: "draft", name, draft: draft(reference.minimalSpecification) }, ctx)).details as any;
  expect(ready.issues).toEqual([]);
  expect(ready.readyToApply).toBe(true);
  await execute({ action: "apply", name, digest: ready.draftDigest }, ctx);
  const evalDir = placement === "separate-repo" ? join(root, "evaluations", name, "tests") : join(root, "skills", name, "tests");
  expect(parseSpec(readFileSync(join(evalDir, "specification.yaml"), "utf8"), "saved-spec").skill).toBe(name);
  const contract = (await execute({ action: "task-contract", name }, ctx)).details as any;
  expect(contract.sources.find((source: any) => source.id === "task:A1:0").text).toBe(reference.minimalSpecification.scenarios[0].turns[0]);
  expect(contract).not.toHaveProperty("controls");
  expect(contract.executionContext).toMatchObject({
    state: "configured-not-executed", descriptiveOnly: true, providerCalls: 0,
    scenarios: [{ scenarioId: "A1", baseWorkspace: { kind: "none", gitRepository: false, baselineCommit: "none" },
      toolFilter: { selection: "explicit", names: [] },
      session: { turns: 1, continuation: "single-turn-no-session", verifiesFreshSessionRecall: false } }],
  });
  const { executionContext, ...retainedProjection } = contract;
  const specPath = join(evalDir, "specification.yaml");
  expect(retainedProjection).toEqual(inspectAuthoringTaskContract({ root, name, specPath }));
  const prepared = (await execute({ action: "task-contract", name, expectedInputSha256: contract.inputSha256, obligations: [{
    id: "acknowledge", scenarioId: "A1", kind: "task",
    anchors: [{ sourceId: "task:A1:0", quote: reference.minimalSpecification.scenarios[0].turns[0] }],
    rationale: "The requested outcome is a one-sentence acknowledgement.",
  }] }, ctx)).details as any;
  expect(prepared.executionContext).toEqual(executionContext);
  expect(prepared.task).not.toHaveProperty("executionContext");
  expect(JSON.parse(readFileSync(prepared.taskPath, "utf8"))).not.toHaveProperty("executionContext");
  expect(readdirSync(evalDir).sort()).toEqual(["authoring.json", "specification.yaml"]);
  expect(JSON.parse(readFileSync(join(evalDir, "authoring.json"), "utf8"))).toMatchObject({ labelStatus: "proposed", calibrated: false, modelQualityEvaluated: false });
  expect(fetch).not.toHaveBeenCalled();
});
