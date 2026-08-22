import { describe, it, expect } from "vitest";
import {
  PROVIDER_FAILURE_MARKER,
  providerFailureFromJsonLine,
  providerFailureFromTranscript,
} from "../src/provider-failure.js";

/** A real pi `--mode json` message_start line, trimmed to the load-bearing fields. */
const FAILING_LINE = JSON.stringify({
  type: "message_start",
  message: {
    role: "assistant",
    api: "openai-codex-responses",
    provider: "openai-codex",
    model: "gpt-5.6-sol",
    usage: { input: 0, output: 0, totalTokens: 0 },
    stopReason: "error",
    diagnostics: [
      { type: "provider_transport_failure", error: { name: "Error", message: "WebSocket error" } },
    ],
  },
});

describe("providerFailureFromJsonLine", () => {
  it("names the provider and the error for a transport failure", () => {
    const found = providerFailureFromJsonLine(FAILING_LINE);
    expect(found).toContain("openai-codex");
    expect(found).toContain("WebSocket error");
  });

  it("is null for an ordinary assistant message", () => {
    const ok = JSON.stringify({
      type: "message_start",
      message: { role: "assistant", provider: "openai-codex", stopReason: "end_turn", content: [] },
    });
    expect(providerFailureFromJsonLine(ok)).toBeNull();
  });

  it("is null for a malformed line rather than throwing", () => {
    expect(providerFailureFromJsonLine("{not json")).toBeNull();
  });

  it("reports a diagnostic carrying no error message", () => {
    const bare = JSON.stringify({
      type: "message_start",
      message: { role: "assistant", provider: "p", diagnostics: [{ type: "provider_transport_failure" }] },
    });
    expect(providerFailureFromJsonLine(bare)).toContain("provider_transport_failure");
  });
});

describe("providerFailureFromTranscript", () => {
  it("finds the marker the adapter writes", () => {
    const t = `>>> USER:\nhi\n\n<<< ASSISTANT:\n\n${PROVIDER_FAILURE_MARKER} invalidated oauth token\n`;
    expect(providerFailureFromTranscript(t)).toBe("invalidated oauth token");
  });

  it("is null for a normal transcript", () => {
    expect(providerFailureFromTranscript(">>> USER:\nhi\n\n<<< ASSISTANT:\nok\n")).toBeNull();
  });

  it("does not fire on prose that merely mentions the words", () => {
    expect(providerFailureFromTranscript("<<< ASSISTANT:\nA provider failure would be bad.\n")).toBeNull();
  });
});
