import { afterEach, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startAuthoring } from "@skill-harness/core";
import { registerImprovement } from "../src/improvement.js";
import type { ExtensionAPI, CmdCtx } from "../src/commands.js";
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function setup() {
  const root = mkdtempSync(join(tmpdir(), "harness-lesson-"));
  roots.push(root);
  mkdirSync(join(root, "skills/role"), { recursive: true });
  writeFileSync(join(root, "skills/role/SKILL.md"), "Role source");
  startAuthoring({ root, name: "role", idea: "Improve selected role" });
  const hooks = new Map<string, () => void>();
  let tool: any;
  let resolveRequest: (value: any) => void = () => {};
  registerImprovement({
    registerTool: (value) => {
      tool = value;
    },
    on: (event, fn) => {
      hooks.set(event, fn as () => void);
    },
    events: { on: () => () => {}, emit: (_event, value) => resolveRequest(value) },
  } as ExtensionAPI);
  const ctx = {
    cwd: root,
    model: { provider: "fixture", id: "model" },
    sessionManager: { getSessionId: () => "session" },
    hasUI: false,
    ui: { notify: () => {} },
  } as CmdCtx;
  const args = {
    action: "propose",
    name: "role",
    reference: { kind: "context", bundleId: "sha256:" + "b".repeat(64) },
    change: "Scope pilot claims",
    appliesWhen: "Reported measurements",
    doesNotApplyWhen: "No measurement claim",
    reconsiderWhen: "Independent verification",
  };
  return {
    root,
    ctx,
    hooks,
    tool,
    args,
    setResolve: (handler: typeof resolveRequest) => {
      resolveRequest = handler;
    },
    invoke: () => tool.execute("one", args, new AbortController().signal, undefined, ctx),
  };
}
const receipt = (request: any, assertCurrent = async () => {}) => ({
  version: 1,
  requestId: request.requestId,
  sessionId: request.sessionId,
  cwd: request.cwd,
  ok: true,
  result: {
    status: "resolved",
    complete: true,
    truncated: false,
    excerpt: "SELECTED_PRIVATE_MEMORY",
  },
  assertCurrent,
});
it("resolves selected evidence through actual owner callback, retains references only and does not dispatch or apply", async () => {
  const fx = setup();
  fx.setResolve((request) => request.reply(receipt(request)));
  const result = await fx.invoke();
  expect(result.details.proposal.accepted).toBe(false);
  expect(JSON.stringify(result)).not.toContain("SELECTED_PRIVATE_MEMORY");
  expect(readFileSync(result.details.path, "utf8")).not.toContain("SELECTED_PRIVATE_MEMORY");
  expect((await fx.invoke()).details.status).toBe("reused");
  expect(readFileSync(join(fx.root, "skills/role/SKILL.md"), "utf8")).toBe("Role source");
});
it("missing evidence, mismatched owner, revocation and branch switches cannot create a proposal", async () => {
  for (const mode of ["unavailable", "wrong-owner", "revoked", "branch"]) {
    const fx = setup();
    fx.setResolve((request) => {
      if (mode === "unavailable")
        return request.reply({
          version: 1,
          requestId: request.requestId,
          sessionId: request.sessionId,
          cwd: request.cwd,
          ok: false,
          status: "missing",
        });
      request.reply({
        ...receipt(request, async () => {
          if (mode === "revoked") throw Error("revoked");
          if (mode === "branch") fx.hooks.get("session_tree")!();
        }),
        ...(mode === "wrong-owner" ? { sessionId: "wrong" } : {}),
      });
    });
    await expect(fx.invoke()).rejects.toThrow();
    expect(existsSync(join(fx.root, ".skill-harness/authoring/role/improvements"))).toBe(false);
  }
});
