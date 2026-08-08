import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import yaml from "js-yaml";
import { runCapture, type CaptureCtx } from "../src/capture-cmd.js";
import { loadSpec, type SessionEntry } from "@skill-harness/core";

const SPEC = `skill: demo
judge_persona: a strict reviewer
ship_bar:
  total: 1
  min_pass: 1
  no_critical_fail: true
critical: []

scenarios:
  - id: A1
    title: existing
    turns:
      - "existing turn"
    checklist:
      - existing check
`;

let skillDir: string;
let specPath: string;

beforeEach(() => {
  skillDir = mkdtempSync(join(tmpdir(), "sh-capture-"));
  mkdirSync(join(skillDir, "tests"), { recursive: true });
  specPath = join(skillDir, "tests", "specification.yaml");
  writeFileSync(specPath, SPEC, "utf8");
  writeFileSync(join(skillDir, "SKILL.md"), "---\nname: demo\ndescription: d\n---\n\n## Do the thing\n", "utf8");
});

/** A session with two user turns, an assistant reply carrying thinking, and a tool call. */
function session(): SessionEntry[] {
  return [
    { type: "session" },
    { type: "message", id: "u1", parentId: null, message: { role: "user", content: [{ type: "text", text: "why is auth failing?" }] } },
    {
      type: "message",
      id: "a1",
      parentId: "u1",
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "SECRET CHAIN OF THOUGHT" },
          { type: "toolCall", id: "c1", name: "read", arguments: { path: ".env", token: "sk-abcdefghijklmnopqrstuvwx" } },
          { type: "text", text: "the token expired" },
        ],
      },
    },
    { type: "message", id: "r1", parentId: "a1", message: { role: "toolResult", toolCallId: "c1", toolName: "read", isError: false, content: [{ type: "text", text: "SUPER SECRET FILE BODY" }] } },
    { type: "message", id: "u2", parentId: "r1", message: { role: "user", content: [{ type: "text", text: "and now?" }] } },
  ];
}

interface Script {
  selects?: (number | null)[];
  inputs?: (string | null)[];
  editors?: (string | null)[];
  confirms?: boolean[];
}

function ctxWith(script: Script, extra: Partial<CaptureCtx> = {}): { ctx: CaptureCtx; said: string[]; runCalls: string[][] } {
  const selects = [...(script.selects ?? [])];
  const inputs = [...(script.inputs ?? [])];
  const editors = [...(script.editors ?? [])];
  const confirms = [...(script.confirms ?? [])];
  const said: string[] = [];
  const runCalls: string[][] = [];
  const ctx: CaptureCtx = {
    cwd: skillDir,
    ui: {
      select: async () => (selects.length ? selects.shift()! : null),
      input: async (_p, initial) => (inputs.length ? inputs.shift() : (initial ?? null)),
      editor: async (_p, initial) => (editors.length ? editors.shift() : initial),
      confirm: async () => (confirms.length ? confirms.shift()! : false),
      say: (m) => said.push(m),
    },
    sessionEntries: () => session(),
    sessionPath: () => "/home/someone/.pi/agent/sessions/abc.jsonl",
    isStreaming: () => false,
    homeDir: "/home/someone",
    now: () => "2026-08-08T00:00:00.000Z",
    runOnly: async (dir, id) => {
      runCalls.push([dir, id]);
      return `  ${id}: PASS`;
    },
    ...extra,
  };
  return { ctx, said, runCalls };
}

/** Drive a full save-as-pending flow. */
const PENDING_SCRIPT: Script = {
  selects: [0, 1, 0, 0, 0], // start turn, end turn, target, classification, action=save pending
  inputs: ["it should name the expired token without printing it"],
  editors: ["names the expired token\ndoes not print the secret"],
};

const PROMOTE_SCRIPT: Script = {
  selects: [0, 1, 0, 0, 1], // …action = promote
  inputs: ["it should name the expired token", "R1", "captured auth failure"],
  editors: ["names the expired token"],
};

function capturesDir(): string {
  return join(skillDir, "tests", "captures");
}

describe("capture — refusal", () => {
  it("refuses while the agent is streaming", async () => {
    const { ctx, said } = ctxWith(PENDING_SCRIPT, { isStreaming: () => true });
    const res = await runCapture(skillDir, ctx);
    expect(res.status).toBe("cancelled");
    expect(said.join(" ")).toMatch(/still streaming/);
    expect(existsSync(capturesDir())).toBe(false);
  });

  it("refuses when the skill has no spec", async () => {
    const bare = mkdtempSync(join(tmpdir(), "sh-nospec-"));
    const { ctx, said } = ctxWith(PENDING_SCRIPT);
    const res = await runCapture(bare, ctx);
    expect(res.status).toBe("cancelled");
    expect(said.join(" ")).toMatch(/does not exist/);
  });

  it("refuses a session with no user turns", async () => {
    const { ctx, said } = ctxWith(PENDING_SCRIPT, { sessionEntries: () => [{ type: "session" }] });
    const res = await runCapture(skillDir, ctx);
    expect(res.status).toBe("cancelled");
    expect(said.join(" ")).toMatch(/nothing to capture/);
  });
});

describe("capture — cancellation writes nothing", () => {
  it.each([
    ["start turn", { selects: [null] }],
    ["end turn", { selects: [0, null] }],
    ["target", { selects: [0, 1, null] }],
    ["classification", { selects: [0, 1, 0, null] }],
    ["final action", { selects: [0, 1, 0, 0, 2], inputs: ["expected"], editors: ["a check"] }],
  ])("cancels at %s", async (_label, script) => {
    const { ctx } = ctxWith({ inputs: ["expected"], editors: ["a check"], ...script });
    const res = await runCapture(skillDir, ctx);
    expect(res.status).toBe("cancelled");
    expect(res.files).toEqual([]);
    expect(existsSync(capturesDir())).toBe(false);
    expect(readFileSync(specPath, "utf8")).toBe(SPEC);
  });

  it("cancels on an empty expectation", async () => {
    const { ctx, said } = ctxWith({ selects: [0, 1, 0, 0], inputs: ["   "] });
    const res = await runCapture(skillDir, ctx);
    expect(res.status).toBe("cancelled");
    expect(said.join(" ")).toMatch(/written expectation/);
    expect(existsSync(capturesDir())).toBe(false);
  });

  it("cancels on an emptied checklist", async () => {
    const { ctx, said } = ctxWith({ selects: [0, 1, 0, 0], inputs: ["expected"], editors: ["   \n  "] });
    const res = await runCapture(skillDir, ctx);
    expect(res.status).toBe("cancelled");
    expect(said.join(" ")).toMatch(/checklist item/);
  });

  it("cancels when the editor is dismissed", async () => {
    const { ctx } = ctxWith({ selects: [0, 1, 0, 0], inputs: ["expected"], editors: [null] });
    expect((await runCapture(skillDir, ctx)).status).toBe("cancelled");
  });
});

describe("capture — preview before write", () => {
  it("shows the full case before anything is written", async () => {
    const { ctx, said } = ctxWith(PENDING_SCRIPT);
    await runCapture(skillDir, ctx);
    const preview = said.find((s) => s.includes("nothing written yet"));
    expect(preview).toBeTruthy();
    expect(preview).toContain("capture_schema");
    expect(preview).toContain("why is auth failing?");
  });

  it("previews even when the author then cancels", async () => {
    const { ctx, said } = ctxWith({ selects: [0, 1, 0, 0, 2], inputs: ["expected"], editors: ["a check"] });
    await runCapture(skillDir, ctx);
    expect(said.some((s) => s.includes("nothing written yet"))).toBe(true);
    expect(existsSync(capturesDir())).toBe(false);
  });
});

describe("capture — pending case", () => {
  it("writes the case, the evidence sidecar and a .gitignore", async () => {
    const { ctx } = ctxWith(PENDING_SCRIPT);
    const res = await runCapture(skillDir, ctx);
    expect(res.status).toBe("pending");
    const files = readdirSync(capturesDir());
    expect(files).toContain(`${res.capture!.id}.yaml`);
    expect(files).toContain(".gitignore");
    expect(readFileSync(join(capturesDir(), ".gitignore"), "utf8")).toContain(".local/");
    expect(existsSync(join(capturesDir(), ".local", `${res.capture!.id}.evidence.json`))).toBe(true);
  });

  it("re-ignores `.local/` when the .gitignore no longer covers it", async () => {
    // Writing only when the file was ABSENT meant a captures/.gitignore that had
    // been edited — or written by a version that ignored something else — left
    // the evidence sidecar tracked. The sidecar holds assistant text and tool
    // arguments; the file merely existing is not evidence that it ignores them.
    mkdirSync(capturesDir(), { recursive: true });
    writeFileSync(join(capturesDir(), ".gitignore"), "# hand-edited\n*.tmp\n", "utf8");
    const { ctx } = ctxWith(PENDING_SCRIPT);
    await runCapture(skillDir, ctx);
    const body = readFileSync(join(capturesDir(), ".gitignore"), "utf8");
    expect(body).toContain(".local/");
    expect(body).toContain("*.tmp"); // the author's own rules survive
  });

  it("leaves an adequate .gitignore byte-identical", async () => {
    mkdirSync(capturesDir(), { recursive: true });
    const mine = "# mine\n.local/\n";
    writeFileSync(join(capturesDir(), ".gitignore"), mine, "utf8");
    const { ctx } = ctxWith(PENDING_SCRIPT);
    await runCapture(skillDir, ctx);
    expect(readFileSync(join(capturesDir(), ".gitignore"), "utf8")).toBe(mine);
  });

  it("scrubs the home path from tool arguments in the evidence sidecar", async () => {
    // `projectTurns` redacted secrets but was called without `homeDir`, so
    // absolute home paths survived into the sidecar's `args` — the one place
    // tool arguments are written to disk.
    const entries = session();
    entries[1] = {
      type: "message", id: "u1", parentId: null,
      message: { role: "user", content: [{ type: "text", text: "why is auth failing?" }] },
    };
    const withPath: SessionEntry[] = entries.map((e) =>
      e.id === "a1"
        ? {
            ...e,
            message: {
              role: "assistant",
              content: [
                { type: "toolCall", id: "c1", name: "read", arguments: { path: "/home/someone/secret/.env" } },
                { type: "text", text: "the token expired" },
              ],
            },
          }
        : e,
    );
    const { ctx } = ctxWith(PENDING_SCRIPT, { sessionEntries: () => withPath });
    const res = await runCapture(skillDir, ctx);
    const evidence = readFileSync(join(capturesDir(), ".local", `${res.capture!.id}.evidence.json`), "utf8");
    expect(evidence).not.toContain("/home/someone");
    expect(evidence).toContain("~/secret/.env");
  });

  it("does NOT touch specification.yaml — a pending capture is not a test", async () => {
    const { ctx } = ctxWith(PENDING_SCRIPT);
    await runCapture(skillDir, ctx);
    expect(readFileSync(specPath, "utf8")).toBe(SPEC);
    expect(loadSpec(specPath).scenarios.map((s) => s.id)).toEqual(["A1"]);
  });

  it("never commits thinking, tool-result bodies, or secrets", async () => {
    const { ctx } = ctxWith(PENDING_SCRIPT);
    const res = await runCapture(skillDir, ctx);
    const committed = readFileSync(join(capturesDir(), `${res.capture!.id}.yaml`), "utf8");
    expect(committed).not.toContain("SECRET CHAIN OF THOUGHT");
    expect(committed).not.toContain("SUPER SECRET FILE BODY");
    expect(committed).not.toContain("sk-abcdefghijklmnopqrstuvwx");
    expect(committed).not.toContain("/home/someone");
  });

  it("keeps the assistant excerpt out of the committed case but in the local sidecar", async () => {
    const { ctx } = ctxWith(PENDING_SCRIPT);
    const res = await runCapture(skillDir, ctx);
    const committed = readFileSync(join(capturesDir(), `${res.capture!.id}.yaml`), "utf8");
    const sidecar = readFileSync(join(capturesDir(), ".local", `${res.capture!.id}.evidence.json`), "utf8");
    expect(committed).not.toContain("the token expired");
    expect(sidecar).toContain("the token expired");
    expect(sidecar).not.toContain("SECRET CHAIN OF THOUGHT");
    expect(sidecar).not.toContain("SUPER SECRET FILE BODY");
  });

  it("records hashed provenance, not the session path", async () => {
    const { ctx } = ctxWith(PENDING_SCRIPT);
    const res = await runCapture(skillDir, ctx);
    const parsed = yaml.load(readFileSync(join(capturesDir(), `${res.capture!.id}.yaml`), "utf8")) as Record<string, any>;
    expect(parsed.provenance.session_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(parsed)).not.toContain("abc.jsonl");
  });
});

describe("capture — promotion", () => {
  it("appends a loadable scenario and marks the case promoted", async () => {
    const { ctx } = ctxWith(PROMOTE_SCRIPT);
    const res = await runCapture(skillDir, ctx);
    expect(res.status).toBe("promoted");
    expect(res.scenarioId).toBe("R1");
    const spec = loadSpec(specPath);
    expect(spec.scenarios.map((s) => s.id)).toEqual(["A1", "R1"]);
    const added = spec.scenarios.find((s) => s.id === "R1")!;
    expect(added.turns).toEqual(["why is auth failing?", "and now?"]);
    expect(added.checklist).toEqual(["names the expired token"]);
  });

  it("never marks a promoted capture critical", async () => {
    const { ctx } = ctxWith(PROMOTE_SCRIPT);
    await runCapture(skillDir, ctx);
    expect(loadSpec(specPath).scenarios.find((s) => s.id === "R1")!.critical).toBe(false);
  });

  it("refuses a duplicate scenario id and leaves the spec untouched", async () => {
    const { ctx } = ctxWith({ ...PROMOTE_SCRIPT, inputs: ["expected", "A1", "collides"] });
    await expect(runCapture(skillDir, ctx)).rejects.toThrow(/already exists/);
    expect(readFileSync(specPath, "utf8")).toBe(SPEC);
  });

  it("refuses when the spec changed under it mid-flow", async () => {
    const { ctx } = ctxWith({
      ...PROMOTE_SCRIPT,
      // The concurrent edit lands while the author is typing the title.
      inputs: ["expected", "R1", "title"],
    });
    const original = ctx.ui.input;
    let typed = 0;
    ctx.ui.input = async (p, initial) => {
      const v = await original(p, initial);
      if (++typed === 3) writeFileSync(specPath, SPEC + "\n# someone else edited this\n", "utf8");
      return v;
    };
    await expect(runCapture(skillDir, ctx)).rejects.toThrow(/changed on disk/);
  });

  it("detects an edit made at the very start of the interview, not just at the write", async () => {
    // The window this guards is the minutes a human spends on the interview. If
    // the baseline were taken just before the append, this would pass silently
    // and clobber the other edit.
    const { ctx } = ctxWith(PROMOTE_SCRIPT);
    const original = ctx.ui.select;
    let asked = 0;
    ctx.ui.select = async (p, choices) => {
      if (++asked === 1) writeFileSync(specPath, SPEC + "\n# concurrent edit during turn selection\n", "utf8");
      return original(p, choices);
    };
    await expect(runCapture(skillDir, ctx)).rejects.toThrow(/changed on disk/);
    // The other author's edit survives intact.
    expect(readFileSync(specPath, "utf8")).toContain("# concurrent edit during turn selection");
  });

  it("keeps the case pending when the author abandons the scenario id", async () => {
    const { ctx } = ctxWith({ ...PROMOTE_SCRIPT, inputs: ["expected", ""] });
    const res = await runCapture(skillDir, ctx);
    expect(res.status).toBe("pending");
    expect(readFileSync(specPath, "utf8")).toBe(SPEC);
  });

  it("suggests the next free R-id rather than colliding", async () => {
    let offered = "";
    const { ctx } = ctxWith({ ...PROMOTE_SCRIPT, inputs: ["expected", null, "title"] });
    const original = ctx.ui.input;
    ctx.ui.input = async (p, initial) => {
      if (p.includes("scenario id")) offered = initial ?? "";
      return original(p, initial);
    };
    await runCapture(skillDir, ctx);
    expect(offered).toBe("R1");
  });
});

describe("capture — the optional run", () => {
  it("makes no run call unless the author confirms", async () => {
    const { ctx, runCalls } = ctxWith({ ...PROMOTE_SCRIPT, confirms: [false] });
    await runCapture(skillDir, ctx);
    expect(runCalls).toEqual([]);
  });

  it("runs exactly the one promoted scenario when confirmed", async () => {
    const { ctx, runCalls } = ctxWith({ ...PROMOTE_SCRIPT, confirms: [true] });
    await runCapture(skillDir, ctx);
    expect(runCalls).toEqual([[skillDir, "R1"]]);
  });

  it("names the spend before asking", async () => {
    let prompt = "";
    const { ctx } = ctxWith({ ...PROMOTE_SCRIPT, confirms: [true] });
    ctx.ui.confirm = async (p) => {
      prompt = p;
      return false;
    };
    await runCapture(skillDir, ctx);
    expect(prompt).toMatch(/spends/);
  });
});
