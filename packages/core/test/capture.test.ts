import { describe, it, expect } from "vitest";
import {
  activeBranch,
  projectTurns,
  visibleText,
  redactText,
  redactArgs,
  truncate,
  captureId,
  buildCaptureCase,
  captureToScenario,
  draftChecklist,
  type SessionEntry,
} from "../src/capture.js";

// --------------------------------------------------------------- fixtures

let seq = 0;
const nextId = () => `e${++seq}`;

function userEntry(text: string, parentId: string | null): SessionEntry {
  return { type: "message", id: nextId(), parentId, message: { role: "user", content: [{ type: "text", text }] } };
}
function assistantEntry(
  parentId: string,
  blocks: { type: string; text?: string; thinking?: string; name?: string; arguments?: unknown }[],
): SessionEntry {
  return { type: "message", id: nextId(), parentId, message: { role: "assistant", content: blocks } };
}
function toolResultEntry(parentId: string, toolName: string, text: string, isError = false): SessionEntry {
  return {
    type: "message",
    id: nextId(),
    parentId,
    message: { role: "toolResult", toolName, isError, content: [{ type: "text", text }] },
  };
}

// --------------------------------------------------------------- branch

describe("activeBranch", () => {
  it("follows parentId rather than file order", () => {
    const a: SessionEntry = { type: "message", id: "a", parentId: null, message: { role: "user", content: [] } };
    const b: SessionEntry = { type: "message", id: "b", parentId: "a", message: { role: "user", content: [] } };
    const c: SessionEntry = { type: "message", id: "c", parentId: "b", message: { role: "user", content: [] } };
    expect(activeBranch([c, a, b], "c").map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("excludes an abandoned fork — the whole reason branches must be resolved", () => {
    const root: SessionEntry = { type: "message", id: "r", parentId: null, message: { role: "user", content: [] } };
    const kept: SessionEntry = { type: "message", id: "kept", parentId: "r", message: { role: "user", content: [] } };
    const abandoned: SessionEntry = { type: "message", id: "gone", parentId: "r", message: { role: "user", content: [] } };
    const ids = activeBranch([root, abandoned, kept], "kept").map((e) => e.id);
    expect(ids).toEqual(["r", "kept"]);
    expect(ids).not.toContain("gone");
  });

  it("defaults to the last entry that has an id", () => {
    const root: SessionEntry = { type: "message", id: "r", parentId: null, message: { role: "user", content: [] } };
    const leaf: SessionEntry = { type: "message", id: "l", parentId: "r", message: { role: "user", content: [] } };
    const header: SessionEntry = { type: "session" }; // no id
    expect(activeBranch([header, root, leaf]).map((e) => e.id)).toEqual(["r", "l"]);
  });

  it("terminates on a corrupted file rather than hanging", () => {
    const x: SessionEntry = { type: "message", id: "x", parentId: "y", message: { role: "user", content: [] } };
    const y: SessionEntry = { type: "message", id: "y", parentId: "x", message: { role: "user", content: [] } };
    expect(() => activeBranch([x, y], "x")).not.toThrow();
    expect(activeBranch([x, y], "x").length).toBeLessThanOrEqual(2);
  });

  it("returns nothing for an empty session", () => {
    expect(activeBranch([])).toEqual([]);
  });
});

// --------------------------------------------------------------- turns

describe("projectTurns", () => {
  it("groups a user message with everything that follows it", () => {
    seq = 0;
    const u1 = userEntry("first ask", null);
    const a1 = assistantEntry(u1.id!, [{ type: "text", text: "first answer" }]);
    const u2 = userEntry("second ask", a1.id!);
    const a2 = assistantEntry(u2.id!, [{ type: "text", text: "second answer" }]);
    const turns = projectTurns([u1, a1, u2, a2]);
    expect(turns).toHaveLength(2);
    expect(turns[0].user).toBe("first ask");
    expect(turns[0].assistantText).toBe("first answer");
    expect(turns[1].user).toBe("second ask");
  });

  it("omits thinking unconditionally", () => {
    seq = 0;
    const u = userEntry("ask", null);
    const a = assistantEntry(u.id!, [
      { type: "thinking", thinking: "SECRET REASONING the user must never see" },
      { type: "text", text: "the answer" },
    ]);
    const turns = projectTurns([u, a]);
    expect(turns[0].assistantText).toBe("the answer");
    expect(JSON.stringify(turns)).not.toContain("SECRET REASONING");
  });

  it("summarizes tool calls without keeping the result body", () => {
    seq = 0;
    const u = userEntry("read it", null);
    const a = assistantEntry(u.id!, [{ type: "toolCall", name: "read", arguments: { path: "note.txt" } }]);
    const r = toolResultEntry(a.id!, "read", "SENSITIVE FILE CONTENTS");
    const [turn] = projectTurns([u, a, r]);
    expect(turn.toolCalls).toHaveLength(1);
    expect(turn.toolCalls[0]).toMatchObject({ name: "read", isError: false, args: { path: "note.txt" } });
    expect(turn.toolCalls[0].resultBytes).toBeGreaterThan(0);
    expect(turn.toolCalls[0].resultSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(turn)).not.toContain("SENSITIVE FILE CONTENTS");
  });

  it("records a tool error", () => {
    seq = 0;
    const u = userEntry("read missing", null);
    const a = assistantEntry(u.id!, [{ type: "toolCall", name: "read", arguments: { path: "nope.txt" } }]);
    const r = toolResultEntry(a.id!, "read", "ENOENT", true);
    expect(projectTurns([u, a, r])[0].toolCalls[0].isError).toBe(true);
  });

  it("pairs repeated calls to the same tool in order", () => {
    seq = 0;
    const u = userEntry("read both", null);
    const a = assistantEntry(u.id!, [
      { type: "toolCall", name: "read", arguments: { path: "one.txt" } },
      { type: "toolCall", name: "read", arguments: { path: "two.txt" } },
    ]);
    const r1 = toolResultEntry(a.id!, "read", "one", false);
    const r2 = toolResultEntry(r1.id!, "read", "two", true);
    const [turn] = projectTurns([u, a, r1, r2]);
    expect(turn.toolCalls.map((c) => c.isError)).toEqual([false, true]);
  });

  it("correlates results by toolCallId, not arrival order", () => {
    // Parallel calls complete out of issue order on pi 0.83.0, so the SECOND
    // result can land first. Pairing by position would attach the error to the
    // wrong call and misreport which one failed.
    seq = 0;
    const u = userEntry("read both", null);
    const a: SessionEntry = {
      type: "message",
      id: nextId(),
      parentId: u.id!,
      message: {
        role: "assistant",
        content: [
          { type: "toolCall", id: "call_slow", name: "bash", arguments: { command: "sleep 6" } },
          { type: "toolCall", id: "call_fast", name: "bash", arguments: { command: "sleep 1" } },
        ],
      },
    };
    const fast: SessionEntry = {
      type: "message",
      id: nextId(),
      parentId: a.id!,
      message: { role: "toolResult", toolCallId: "call_fast", toolName: "bash", isError: true, content: [{ type: "text", text: "boom" }] },
    };
    const slow: SessionEntry = {
      type: "message",
      id: nextId(),
      parentId: fast.id!,
      message: { role: "toolResult", toolCallId: "call_slow", toolName: "bash", isError: false, content: [{ type: "text", text: "ok" }] },
    };
    const [turn] = projectTurns([u, a, fast, slow]);
    const byId = Object.fromEntries(turn.toolCalls.map((c) => [c.id, c.isError]));
    expect(byId).toEqual({ call_slow: false, call_fast: true });
  });

  it("skips non-message entries instead of guessing at them", () => {
    seq = 0;
    const u = userEntry("ask", null);
    const noise: SessionEntry = { type: "model_change", id: nextId(), parentId: u.id!, provider: "x" };
    const custom: SessionEntry = { type: "some_extension_entry", id: nextId(), parentId: noise.id! };
    const a = assistantEntry(custom.id!, [{ type: "text", text: "answer" }]);
    const turns = projectTurns([u, noise, custom, a]);
    expect(turns).toHaveLength(1);
    expect(turns[0].assistantText).toBe("answer");
  });

  it("drops entries that precede the first user message", () => {
    seq = 0;
    const orphan = assistantEntry("nothing", [{ type: "text", text: "belongs to no turn" }]);
    const u = userEntry("ask", null);
    const turns = projectTurns([orphan, u]);
    expect(turns).toHaveLength(1);
    expect(turns[0].assistantText).toBe("");
  });

  it("replaces images with a placeholder", () => {
    expect(visibleText([{ type: "image" }, { type: "text", text: "caption" }])).toBe("[image omitted]\ncaption");
  });
});

// --------------------------------------------------------------- redaction

describe("redaction", () => {
  it.each([
    ["bearer token", "call with Bearer abcdefghijklmnopqrstuvwxyz123456"],
    ["openai-style key", "key is sk-abcdefghijklmnopqrstuvwxyz"],
    ["github token", "ghp_abcdefghijklmnopqrstuvwxyz1234"],
    ["slack token", "xoxb-1234567890-abcdefghijkl"],
    ["aws key id", "AKIAIOSFODNN7EXAMPLE"],
    ["jwt", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"],
  ])("redacts a %s", (_label, text) => {
    expect(redactText(text)).toContain("[redacted]");
  });

  it("redacts a private key block", () => {
    const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIEow\nkey\n-----END RSA PRIVATE KEY-----";
    expect(redactText(pem)).toBe("[redacted]");
  });

  it("replaces the home directory with ~", () => {
    expect(redactText("/home/someone/prepos/x/file.ts", "/home/someone")).toBe("~/prepos/x/file.ts");
  });

  it("leaves ordinary prose alone", () => {
    const prose = "The authentication failed because the token expired.";
    expect(redactText(prose)).toBe(prose);
  });

  it("drops values under a secret-looking key whatever they contain", () => {
    const args = redactArgs({ api_key: "plainlooking", AUTHORIZATION: "x", nested: { password: "hunter2" } });
    expect(args.api_key).toBe("[redacted]");
    expect(args.AUTHORIZATION).toBe("[redacted]");
    expect((args.nested as Record<string, unknown>).password).toBe("[redacted]");
  });

  it("keeps non-secret arguments usable as gate evidence", () => {
    expect(redactArgs({ path: "src/app.ts", count: 3, ok: true })).toEqual({ path: "src/app.ts", count: 3, ok: true });
  });

  it("bounds recursion instead of walking an arbitrary object", () => {
    const deep = { a: { b: { c: { d: { e: "too deep" } } } } };
    expect(JSON.stringify(redactArgs(deep))).toContain("[nested]");
  });

  it("marks truncation rather than silently shortening", () => {
    const out = truncate("x".repeat(3000));
    expect(out).toContain("[truncated");
    expect(out.length).toBeLessThan(3000);
  });

  it("returns an empty object for non-object arguments", () => {
    expect(redactArgs(null)).toEqual({});
    expect(redactArgs("a string")).toEqual({});
    expect(redactArgs([1, 2])).toEqual({});
  });
});

// --------------------------------------------------------------- case

const TARGET = { kind: "skill" as const, path: "skills/demo", content_sha256: "a".repeat(64) };

const baseOpts = () => ({
  turns: projectTurns([
    { type: "message", id: "u1", parentId: null, message: { role: "user", content: [{ type: "text", text: "why is auth failing?" }] } },
    { type: "message", id: "a1", parentId: "u1", message: { role: "assistant", content: [{ type: "text", text: "because reasons" }] } },
    { type: "message", id: "u2", parentId: "a1", message: { role: "user", content: [{ type: "text", text: "and now?" }] } },
  ] as SessionEntry[]),
  range: { start: 0, end: 1 },
  classification: "failure" as const,
  expectedBehavior: "It should name the expired token without printing it.",
  checklist: ["names the expired token"],
  target: TARGET,
  sessionPath: "/home/someone/.pi/agent/sessions/abc.jsonl",
  created: "2026-08-08T00:00:00.000Z",
});

describe("buildCaptureCase", () => {
  it("carries only user turns — assistant prose is never an oracle", () => {
    const c = buildCaptureCase(baseOpts());
    expect(c.turns).toEqual(["why is auth failing?", "and now?"]);
    expect(JSON.stringify(c)).not.toContain("because reasons");
  });

  it("hashes the session path instead of storing it", () => {
    const c = buildCaptureCase(baseOpts());
    expect(c.provenance.session_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(c)).not.toContain("/home/someone");
  });

  it("starts pending with no scenario attached", () => {
    const c = buildCaptureCase(baseOpts());
    expect(c.status).toBe("pending");
    expect(c.scenario_id).toBeUndefined();
    expect(c.capture_schema).toBe(1);
  });

  it("refuses an empty expectation", () => {
    expect(() => buildCaptureCase({ ...baseOpts(), expectedBehavior: "   " })).toThrow(/expected behavior/);
  });

  it("refuses an empty checklist", () => {
    expect(() => buildCaptureCase({ ...baseOpts(), checklist: ["", "  "] })).toThrow(/checklist item/);
  });

  it.each([
    [{ start: -1, end: 0 }],
    [{ start: 1, end: 0 }],
    [{ start: 0, end: 99 }],
  ])("refuses an out-of-bounds range %j", (range) => {
    expect(() => buildCaptureCase({ ...baseOpts(), range })).toThrow(/invalid capture range/);
  });

  it("redacts secrets that appear in the captured user text", () => {
    const opts = baseOpts();
    opts.turns[0].user = "it fails with Bearer abcdefghijklmnopqrstuvwxyz123456";
    expect(buildCaptureCase(opts).turns[0]).toContain("[redacted]");
  });

  it("avoids colliding with an existing capture id", () => {
    const first = buildCaptureCase(baseOpts());
    const second = buildCaptureCase({ ...baseOpts(), existingIds: [first.id] });
    expect(second.id).not.toBe(first.id);
    expect(second.id.startsWith(first.id)).toBe(true);
  });
});

describe("captureId", () => {
  it("is deterministic for the same seed", () => {
    expect(captureId("seed")).toBe(captureId("seed"));
  });
  it("differs across seeds", () => {
    expect(captureId("a")).not.toBe(captureId("b"));
  });
});

describe("captureToScenario", () => {
  it("promotes id, title, turns and checklist only", () => {
    const s = captureToScenario(buildCaptureCase(baseOpts()), "R1", "captured auth failure");
    expect(Object.keys(s)).toEqual(["id", "title", "turns", "checklist"]);
  });

  it("never marks a captured case critical on its own", () => {
    // A capture cannot know whether the behavior is ship-blocking; guessing would
    // let a one-off silently gate a release.
    expect(captureToScenario(buildCaptureCase(baseOpts()), "R1", "t").critical).toBeUndefined();
  });
});

describe("draftChecklist", () => {
  it("splits sentences into candidate items", () => {
    expect(draftChecklist("It names the token. It does not print the secret.")).toEqual([
      "It names the token",
      "It does not print the secret",
    ]);
  });

  it("splits an explicit bullet list", () => {
    expect(draftChecklist("Expected:\n- names the token\n- keeps it secret")).toContain("names the token");
  });

  it("returns nothing useful for an empty expectation", () => {
    expect(draftChecklist("")).toEqual([]);
  });
});
