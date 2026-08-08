import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/**
 * Characterization tests for pi's `--mode json` event stream.
 *
 * These assert facts about the FIXTURES, not about harness code — no parser
 * exists yet (that is Phase 2 of the pi-native capture program). Their job is to
 * make a pi upgrade that changes the event contract fail here, loudly, instead of
 * silently degrading an objective gate built on top of it.
 *
 * Every expectation below was measured against pi 0.83.0 on 2026-08-08. See
 * `docs/pi-native-capture-design-2026-08-08.md` and `fixtures/pi-json/README.md`.
 */

const DIR = join(fileURLToPath(new URL(".", import.meta.url)), "fixtures", "pi-json");

interface Ev {
  type: string;
  [k: string]: unknown;
}

function load(name: string): Ev[] {
  return readFileSync(join(DIR, name), "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Ev);
}

const types = (evs: Ev[]) => new Set(evs.map((e) => e.type));

/** Text blocks of the FINAL assistant message — the print-mode-equivalent rule. */
function finalAssistantText(evs: Ev[]): string {
  let out = "";
  for (const e of evs) {
    if (e.type !== "message_end") continue;
    const m = e.message as { role?: string; content?: { type: string; text?: string }[]; stopReason?: string };
    if (m?.role !== "assistant" || m.stopReason !== "stop") continue;
    const text = (m.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n");
    if (text) out = text;
  }
  return out;
}

describe("pi --mode json event contract", () => {
  it("emits the terminal events a trace parser depends on", () => {
    const t = types(load("tool-call.jsonl"));
    for (const required of [
      "session",
      "message_end",
      "tool_execution_start",
      "tool_execution_end",
      "turn_end",
      "agent_end",
      "agent_settled",
    ]) {
      expect(t, `missing ${required}`).toContain(required);
    }
  });

  it("keeps streaming *_update events in the fixtures so a parser's skip path is exercised", () => {
    // Not decoration: message_update re-sends the whole accumulated message per
    // delta, so a parser that fails to skip it both corrupts the transcript and
    // blows up memory (a 3-tool-call run emitted 52 MB of these).
    expect(types(load("single-turn.jsonl"))).toContain("message_update");
    expect(types(load("sequential-tool-calls.jsonl"))).toContain("tool_execution_update");
  });

  it("emits tool_execution_update only for tools that stream, so absence proves nothing", () => {
    // `bash` streams partial output; `read` returns in one shot and emits none.
    // A parser must not treat a missing update event as a missing tool call.
    expect(types(load("tool-call.jsonl"))).not.toContain("tool_execution_update");
    expect(types(load("tool-call.jsonl"))).toContain("tool_execution_end");
  });

  it("repeats the same assistant message across message_end, turn_end and agent_end", () => {
    // Three copies of every message. A parser must pick ONE source; reading two
    // would double the transcript, and `agent_end` alone is enough to rebuild it.
    const evs = load("single-turn.jsonl");
    const fromMessageEnd = finalAssistantText(evs);
    const agentEnd = evs.find((e) => e.type === "agent_end")!;
    const msgs = agentEnd.messages as { role?: string; content?: { type: string; text?: string }[] }[];
    const fromAgentEnd = msgs
      .filter((m) => m.role === "assistant")
      .flatMap((m) => (m.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? ""))
      .join("\n");
    expect(fromAgentEnd).toBe(fromMessageEnd);
  });
});

describe("transcript reconstruction parity with print mode", () => {
  it("final-assistant-message rule reproduces print-mode stdout exactly", () => {
    const printed = readFileSync(join(DIR, "parity-print-mode.txt"), "utf8");
    expect(finalAssistantText(load("single-turn.jsonl")).trim()).toBe(printed.trim());
  });

  it("concatenating every assistant text block does NOT match, which is why the rule is narrow", () => {
    // The plan originally specified "assistant text blocks excluding thinking".
    // Models emit text alongside tool calls, so that rule feeds the judge interim
    // narration the current transcript has never contained.
    const evs = load("parallel-out-of-order.jsonl");
    const all = evs
      .filter((e) => e.type === "message_end")
      .map((e) => e.message as { role?: string; content?: { type: string; text?: string }[] })
      .filter((m) => m?.role === "assistant")
      .flatMap((m) => (m.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? ""))
      .join("\n");
    expect(all).not.toBe(finalAssistantText(evs));
  });
});

describe("parallel tool calls", () => {
  it("start in issue order and end in completion order, so only toolCallId correlates", () => {
    const evs = load("parallel-out-of-order.jsonl");
    const cmd = (e: Ev) => ((e.args as { command?: string } | undefined)?.command ?? "").match(/echo (\w+)/)?.[1];

    const starts = evs.filter((e) => e.type === "tool_execution_start");
    const ends = evs.filter((e) => e.type === "tool_execution_end");

    expect(starts.map(cmd)).toEqual(["SLOW", "FAST", "MID"]);
    // Sleeps are 6s/1s/3s, so completion order is the reverse of nothing in
    // particular — it is duration order, and it differs from issue order.
    const endIds = ends.map((e) => e.toolCallId);
    expect(endIds).not.toEqual(starts.map((e) => e.toolCallId));

    // Every end correlates back to exactly one start, by id.
    for (const id of endIds) {
      expect(starts.filter((s) => s.toolCallId === id)).toHaveLength(1);
    }
  });

  it("issues all three calls inside a single assistant message", () => {
    const evs = load("parallel-out-of-order.jsonl");
    const batched = evs
      .filter((e) => e.type === "message_end")
      .map((e) => e.message as { role?: string; content?: { type: string }[] })
      .filter((m) => m?.role === "assistant")
      .map((m) => (m.content ?? []).filter((b) => b.type === "toolCall").length);
    expect(Math.max(...batched)).toBe(3);
  });
});

describe("tool outcomes", () => {
  it("flags a failing tool call with isError", () => {
    const end = load("tool-error.jsonl").find((e) => e.type === "tool_execution_end")!;
    expect(end.isError).toBe(true);
  });

  it("a successful call is not flagged", () => {
    const end = load("tool-call.jsonl").find((e) => e.type === "tool_execution_end")!;
    expect(end.isError).toBe(false);
  });

  it("tool-result bodies embed absolute paths, which is why they are never persisted", () => {
    const end = load("tool-error.jsonl").find((e) => e.type === "tool_execution_end")!;
    const body = JSON.stringify(end.result);
    // Sanitized to /WORKSPACE in the fixture; on a real machine this is a home dir.
    expect(body).toContain("/WORKSPACE");
  });
});

describe("subagent evidence", () => {
  it("exposes the parent's selection and handoff verbatim in the call arguments", () => {
    const start = load("subagent-call.jsonl").find((e) => e.type === "tool_execution_start")!;
    expect(start.toolName).toBe("Agent");
    expect(start.args).toMatchObject({ agent: "plan" });
    expect(String((start.args as { task: string }).task)).toContain("authentication");
  });

  it("carries a tool's structured `details` through verbatim", () => {
    const end = load("subagent-call.jsonl").find((e) => e.type === "tool_execution_end")!;
    const details = (end.result as { details?: Record<string, unknown> }).details;
    expect(details).toMatchObject({ agent: "plan", fake: true });
  });
});

describe("privacy hazards the parser must filter", () => {
  it("thinking appears in message_end, turn_end AND agent_end", () => {
    const evs = load("single-turn.jsonl");
    const hasThinking = (e: Ev) => {
      const msgs = e.type === "agent_end" ? (e.messages as { content?: { type: string }[] }[]) : [e.message as { content?: { type: string }[] }];
      return (msgs ?? []).some((m) => (m?.content ?? []).some((b) => b.type === "thinking"));
    };
    for (const type of ["message_end", "turn_end", "agent_end"]) {
      expect(evs.filter((e) => e.type === type).some(hasThinking), `no thinking in ${type}`).toBe(true);
    }
  });

  it("the session event carries a cwd", () => {
    const s = load("single-turn.jsonl").find((e) => e.type === "session")!;
    expect(typeof s.cwd).toBe("string");
  });
});

describe("multi-turn sessions", () => {
  it("each pi invocation emits an independent stream carrying only that turn", () => {
    const t1 = load("multi-turn-turn1.jsonl");
    const t2 = load("multi-turn-turn2.jsonl");
    const users = (evs: Ev[]) =>
      evs
        .filter((e) => e.type === "message_end")
        .map((e) => e.message as { role?: string; content?: { type: string; text?: string }[] })
        .filter((m) => m?.role === "user")
        .flatMap((m) => (m.content ?? []).map((b) => b.text ?? ""));

    expect(users(t1)).toHaveLength(1);
    expect(users(t2)).toHaveLength(1);
    // Turn 2's stream does not replay turn 1 — continuity lives in the session dir.
    expect(users(t2)[0]).not.toContain("Remember the number");
    // …but the model still had it: it answered from session state.
    expect(finalAssistantText(t2)).toContain("77");
  });
});

describe("the stdout prefilter's assumption about pi's event shape", () => {
  // The prefilter drops the two quadratic event types by matching `"type"` at the
  // HEAD of the object. That is a bet on pi's key order, and it is the bet that
  // keeps 52 MB of `message_update` out of memory — so it gets pinned here rather
  // than discovered during a wave.
  const SKIPPED_TYPE_RE = /^\s*\{\s*"type"\s*:\s*"(?:message_update|tool_execution_update)"/;

  it("every event in every real-pi fixture puts `type` first", () => {
    const dir = join(__dirname, "fixtures", "pi-json");
    const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      for (const line of readFileSync(join(dir, file), "utf8").split("\n").filter((l) => l.trim())) {
        expect(line.trimStart().startsWith('{"type":'), `${file}: ${line.slice(0, 60)}`).toBe(true);
      }
    }
  });

  it("drops the quadratic events and keeps everything else", () => {
    const dir = join(__dirname, "fixtures", "pi-json");
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".jsonl"))) {
      for (const line of readFileSync(join(dir, file), "utf8").split("\n").filter((l) => l.trim())) {
        const type = (JSON.parse(line) as { type: string }).type;
        const skipped = type === "message_update" || type === "tool_execution_update";
        expect(SKIPPED_TYPE_RE.test(line), `${file}: ${type}`).toBe(skipped);
      }
    }
  });

  it("does not drop a tool call whose ARGUMENTS mention a skipped event type", () => {
    // The regression: the prefilter was `line.includes('"message_update"')` over
    // the whole line, so this call vanished before parsing — and a call that
    // never enters the trace makes `forbid_calls` on it pass for want of
    // evidence. This repo's own corpus scripts grep pi logs, so it is not
    // hypothetical here.
    const line = JSON.stringify({
      type: "tool_execution_start", toolCallId: "c1", toolName: "bash",
      args: { command: 'grep \'"message_update"\' run.jsonl' },
    });
    expect(SKIPPED_TYPE_RE.test(line)).toBe(false);
  });
});
