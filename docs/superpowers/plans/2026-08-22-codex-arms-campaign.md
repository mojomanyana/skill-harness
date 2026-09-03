# Codex Arms Campaign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make skill-harness able to run `principal-pi-skills` on OpenAI-Codex models with pi-daddy loaded as a switchable arm, recording cost and latency, without ever reporting a provider outage as a skill regression.

**Architecture:** Four independent additions to existing seams. (1) A provider-failure classifier feeding `run.ts`'s existing `infrastructureFailure` → ERROR path. (2) A `--structured` flag that makes a gate-free run take the already-built structured path, which populates the already-existing subject metrics. (3) An arm — a named bundle of extensions, seeded pi-daddy definitions and env vars — declared in a corpus-side `arms.yaml`, carried in the run-dir tag so `lint`/`stability` see separate lineages and no spec digest moves. (4) A runbook.

**Tech Stack:** TypeScript (ESM, `"type": "module"`), Node ≥ 20, vitest, npm workspaces (`packages/core`, `packages/adapters`, `packages/cli`, `packages/pi-extension`), `js-yaml`.

**Spec:** `docs/superpowers/specs/2026-08-22-codex-arms-campaign-design.md`

## Global Constraints

- **`.js` extensions in all relative imports.** ESM + `tsc`; `from "./arms.js"` even though the source is `arms.ts`.
- **No test may shell out to `pi`.** CI has no `pi` on PATH. Fake the adapter (`spyAdapter` pattern in `packages/core/test/trace-integration.test.ts`) or test pure functions.
- **Mutation-check every test.** After a test passes, break the implementation deliberately and confirm the test fails. This repo has shipped fixes with no test at all, and a `pi-json.ts` prefilter test that once passed against deliberately broken source.
- **Never hand-edit `packages/adapters/src/pi-daddy-ledger-v2.ts`** — it is generated.
- **Never add `packages/pi-extension` to an emitting `tsc -b`** — it clobbers the committed esbuild bundle. If `core`/`cli`/`adapters` source changes, run `npm run build:ext` and commit `packages/pi-extension/dist/index.js`. Ordering trap: `bundle.test.ts` compares against a rebuild from `dist`, so it can pass *before* `npm run build` and fail after.
- **`grep -a` on `packages/core/src/trace-gates.ts`** — it contains literal NUL bytes, so plain `grep` reports no matches and exits 1.
- **New env vars use the `SKILL_HARNESS_` prefix**, read through `packages/core/src/util/env.ts`. No new `SKILL_CHECK_*` names.
- **Regression invariant, checked in Task 9:** `node bin/skill-harness.js lint all --skills ../principal-pi-skills` must still report exactly `7 skill(s), 104 finding(s), 32 note(s)`. Any change to that number means an arm leaked into a digest.
- **Verify commands, don't trust them.** `npx vitest run` is the full suite (1,289 tests / 79 files green at `ba8f97f`).

---

## File Structure

**Create:**
- `packages/core/src/provider-failure.ts` — pure classifiers for a provider-side failure, in both the text-transcript and structured-diagnostic shapes.
- `packages/core/src/arms.ts` — `Arm` type, `loadArms`, `resolveArm`, `seedArmDefinitions`. One responsibility: turn `arms.yaml` plus a workspace into either a validated arm or a refusal.
- `packages/core/test/provider-failure.test.ts`
- `packages/core/test/arms.test.ts`
- `packages/core/test/arm-run-integration.test.ts`
- `docs/CODEX-ARMS-RUNBOOK.md`

**Modify:**
- `packages/core/src/adapters/types.ts` — `StructuredRun.providerFailure`, `RunReq.armEnv`, `RunOptions` additions.
- `packages/core/src/run.ts` — classify provider failure; honour `opts.structured`; seed and thread the arm.
- `packages/core/src/results.ts` — `runDirFor` gains an arm segment; `ResultsFile.arm`.
- `packages/adapters/src/pi.ts` — emit the text-mode failure marker; surface `providerFailure`; pass `armEnv`.
- `packages/adapters/src/pi-json.ts` — collect provider-failure diagnostics; accept `env`.
- `packages/cli/src/cli.ts` — `--structured`, `--arm`, usage text.
- `packages/core/src/index.ts` — export the new modules.

---

## Task 1: Classify a provider failure from a structured stream

pi's `--mode json` reports an invalidated OAuth token as a `provider_transport_failure` diagnostic with `stopReason: "error"`, zero tokens, **and exit code 0**. Nothing reads it today, so the cell records a model-attributable failure.

**Files:**
- Create: `packages/core/src/provider-failure.ts`
- Create: `packages/core/test/provider-failure.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `PROVIDER_FAILURE_MARKER = "[skill-harness] provider failure:"` (string constant)
  - `providerFailureFromJsonLine(line: string): string | null`
  - `providerFailureFromTranscript(transcript: string): string | null`

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/provider-failure.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/provider-failure.test.ts`
Expected: FAIL — `Failed to resolve import "../src/provider-failure.js"`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/core/src/provider-failure.ts`:

```ts
/**
 * Provider-side failure detection.
 *
 * A provider outage is INFRASTRUCTURE, never a model verdict. Measured 2026-08-22:
 * an invalidated `openai-codex` OAuth token makes pi report
 * `stopReason: "error"` with a `provider_transport_failure` diagnostic and **exit 0**
 * in `--mode json`, and exit 1 with `Encountered invalidated oauth token for user,
 * failing request` on stderr in text mode. Neither path was classified, so a wave
 * against a dead token produced model FAILs shaped exactly like findings.
 *
 * Two entry points because the two run paths surface it differently, and the
 * structured one is the WEAKER signal — it hides the real message behind a generic
 * transport error and exits 0. Do not assume `--structured` improves diagnosis.
 */

/**
 * Written into a transcript by the adapter when pi failed provider-side, so the
 * text path can carry a machine-readable signal through a `string` return without
 * widening `HarnessAdapter.run`. Read back by `providerFailureFromTranscript`.
 *
 * Line-anchored on read: the marker must not be forgeable by a model that types
 * the same words into its answer.
 */
export const PROVIDER_FAILURE_MARKER = "[skill-harness] provider failure:";

/** Diagnostic types that mean the provider never ran the request. */
const FAILURE_DIAGNOSTICS = new Set(["provider_transport_failure"]);

interface Diagnostic {
  type?: unknown;
  error?: { message?: unknown } | null;
}

/**
 * A provider failure named by one `pi --mode json` line, or null.
 *
 * Fail-closed on the diagnostic, fail-open on the parse: an unreadable line is not
 * evidence of a failure, and throwing here would abort a wave over one bad line.
 */
export function providerFailureFromJsonLine(line: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  const message = (parsed as { message?: Record<string, unknown> } | null)?.message;
  if (!message || typeof message !== "object") return null;
  const diagnostics = (message as { diagnostics?: unknown }).diagnostics;
  if (!Array.isArray(diagnostics)) return null;
  for (const raw of diagnostics as Diagnostic[]) {
    if (typeof raw?.type !== "string" || !FAILURE_DIAGNOSTICS.has(raw.type)) continue;
    const provider = typeof (message as { provider?: unknown }).provider === "string"
      ? (message as { provider: string }).provider
      : "unknown provider";
    const detail = typeof raw.error?.message === "string" ? raw.error.message : raw.type;
    return `${provider}: ${detail}`;
  }
  return null;
}

/** The failure the adapter recorded in a transcript, or null. */
export function providerFailureFromTranscript(transcript: string): string | null {
  for (const line of transcript.split("\n")) {
    if (!line.startsWith(PROVIDER_FAILURE_MARKER)) continue;
    return line.slice(PROVIDER_FAILURE_MARKER.length).trim();
  }
  return null;
}
```

Append to `packages/core/src/index.ts`:

```ts
export * from "./provider-failure.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/provider-failure.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Mutation-check**

Change `FAILURE_DIAGNOSTICS` to `new Set([])` and re-run. Expected: FAIL. Then change `line.startsWith(` to `line.includes(` and re-run. Expected: the "does not fire on prose" test FAILS. Restore both.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/provider-failure.ts packages/core/src/index.ts packages/core/test/provider-failure.test.ts
git commit -m "feat(core): classify a provider-side failure from either run path"
```

---

## Task 2: Adapter emits the failure — both paths

**Files:**
- Modify: `packages/adapters/src/pi-json.ts` (`PiJsonRunResult`, the `rl.on("line")` handler)
- Modify: `packages/adapters/src/pi.ts` (`run`, `runStructured`)
- Modify: `packages/core/src/adapters/types.ts` (`StructuredRun`)
- Modify: `packages/adapters/test/pi.test.ts`

**Interfaces:**
- Consumes: `PROVIDER_FAILURE_MARKER`, `providerFailureFromJsonLine` (Task 1).
- Produces: `PiJsonRunResult.providerFailure: string | null`; `StructuredRun.providerFailure?: string`; a text transcript whose failure line begins with `PROVIDER_FAILURE_MARKER`.

- [ ] **Step 1: Write the failing test**

Append to `packages/adapters/test/pi.test.ts` (it already mocks `exec` as `mockedExec` — reuse that):

```ts
import { PROVIDER_FAILURE_MARKER } from "@skill-harness/core";

describe("provider failure in text mode", () => {
  it("marks a provider failure so the transcript is not read as a model answer", async () => {
    mockedExec.mockResolvedValue({
      code: 1,
      stdout: "",
      stderr: "Encountered invalidated oauth token for user, failing request",
    });
    const dir = mkdtempSync(join(tmpdir(), "sc-skill-"));
    writeFileSync(join(dir, "SKILL.md"), "---\nname: s\n---\n\n## H\nbody\n", "utf8");
    const transcript = await piAdapter.run({
      skillDir: dir,
      model: { provider: "openai-codex", model: "gpt-5.6-sol" },
      mode: "force",
      turns: ["hi"],
      cwd: "/tmp",
    });
    expect(transcript).toContain(PROVIDER_FAILURE_MARKER);
    expect(transcript).toContain("invalidated oauth token");
  });

  it("leaves an ordinary non-zero exit unmarked", async () => {
    mockedExec.mockResolvedValue({ code: 2, stdout: "partial", stderr: "some other problem" });
    const dir = mkdtempSync(join(tmpdir(), "sc-skill-"));
    writeFileSync(join(dir, "SKILL.md"), "---\nname: s\n---\n\n## H\nbody\n", "utf8");
    const transcript = await piAdapter.run({
      skillDir: dir,
      model: { provider: "p", model: "m" },
      mode: "force",
      turns: ["hi"],
      cwd: "/tmp",
    });
    expect(transcript).not.toContain(PROVIDER_FAILURE_MARKER);
    expect(transcript).toContain("[pi exited 2]");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/adapters/test/pi.test.ts`
Expected: FAIL — the transcript has no marker.

- [ ] **Step 3: Write minimal implementation**

In `packages/core/src/adapters/types.ts`, add to `StructuredRun`:

```ts
  /**
   * Set when pi failed provider-side (auth, transport) rather than the model
   * answering badly. `run.ts` turns this into ERROR — never a model verdict.
   */
  providerFailure?: string;
```

In `packages/adapters/src/pi.ts`, add near the top:

```ts
import { PROVIDER_FAILURE_MARKER } from "@skill-harness/core";

/**
 * stderr fragments that mean the provider refused the request, so the run measured
 * nothing about the model. Substring matching on a message pi passes through from
 * the provider — deliberately narrow: a stderr line we cannot classify stays an
 * ordinary non-zero exit, because calling a real model failure "infrastructure"
 * would hide a regression.
 */
const PROVIDER_STDERR_SIGNATURES = [
  "invalidated oauth token",
  "invalid_api_key",
  "insufficient_quota",
  "authentication",
];

function providerStderr(stderr: string): string | null {
  const hay = stderr.toLowerCase();
  return PROVIDER_STDERR_SIGNATURES.some((sig) => hay.includes(sig)) ? stderr.trim() : null;
}
```

In `run()`, replace **both** `if (r.code !== 0) parts.push(...)` lines. Single-turn:

```ts
      if (r.code !== 0) {
        const provider = providerStderr(r.stderr);
        parts.push(provider
          ? `${PROVIDER_FAILURE_MARKER} ${provider}\n`
          : `[pi exited ${r.code}]\n${r.stderr.trim()}\n`);
      }
```

Multi-turn (keep the turn number in the unclassified branch):

```ts
      if (r.code !== 0) {
        const provider = providerStderr(r.stderr);
        parts.push(provider
          ? `${PROVIDER_FAILURE_MARKER} ${provider}\n`
          : `[pi exited ${r.code} on turn ${i + 1}]\n${r.stderr.trim()}\n`);
      }
```

In `packages/adapters/src/pi-json.ts`, add `providerFailure: string | null` to `PiJsonRunResult`, import `providerFailureFromJsonLine` from `@skill-harness/core`, declare `let providerFailure: string | null = null;` beside `let stderr = "";`, and inside the `rl.on("line")` handler — **after** the `SKIPPED_TYPE_RE` prefilter returns, so the quadratic lines are still dropped first:

```ts
      if (providerFailure === null) providerFailure = providerFailureFromJsonLine(line);
```

Include `providerFailure` in the object the `close` handler resolves with.

In `runStructured`, collect it across turns and return it. Beside the existing per-turn bookkeeping:

```ts
    let providerFailure: string | null = null;
    // ... inside the turn loop, after the runPiJson call:
    if (providerFailure === null && r.providerFailure) providerFailure = r.providerFailure;
```

and in the returned object:

```ts
      ...(providerFailure ? { providerFailure } : {}),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/adapters/test/pi.test.ts`
Expected: PASS.

- [ ] **Step 5: Mutation-check**

Empty `PROVIDER_STDERR_SIGNATURES` to `[]` and re-run. Expected: the first new test FAILS, the second still passes. Restore.

- [ ] **Step 6: Full suite, then commit**

```bash
npx vitest run
git add packages/adapters/src/pi.ts packages/adapters/src/pi-json.ts packages/core/src/adapters/types.ts packages/adapters/test/pi.test.ts
git commit -m "feat(adapters): surface a provider failure instead of blaming the model"
```

---

## Task 3: `run.ts` turns a provider failure into ERROR

**Files:**
- Modify: `packages/core/src/run.ts:246-330` (the rep loop) and the ERROR chain at `:438-458`
- Create: `packages/core/test/provider-failure-run.test.ts`

**Interfaces:**
- Consumes: `providerFailureFromTranscript` (Task 1), `StructuredRun.providerFailure` (Task 2), `infrastructureFailure` (existing local in `runSkillModel`).
- Produces: a rep whose verdict is `ERROR` with `reason` naming the provider, and **zero judge calls**.

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/provider-failure-run.test.ts`. Copy the `spyAdapter` helper shape from `packages/core/test/trace-integration.test.ts` — the load-bearing assertion is the judge-call count.

```ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSkillModel } from "../src/run.js";
import { loadSpec } from "../src/spec.js";
import { PROVIDER_FAILURE_MARKER } from "../src/provider-failure.js";
import type { HarnessAdapter } from "../src/adapters/types.js";

function skillWithOneScenario(): { dir: string; specPath: string } {
  const root = mkdtempSync(join(tmpdir(), "sh-provfail-"));
  const dir = join(root, "greeter");
  mkdirSync(join(dir, "tests"), { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), "---\nname: greeter\n---\n\n## Greet\nSay hello.\n", "utf8");
  const specPath = join(dir, "tests", "specification.yaml");
  writeFileSync(
    specPath,
    ["skill: greeter", "scenarios:", "  - id: A1", "    title: greets", "    turns: ['hi']", "    checklist: ['says hello']"].join("\n") + "\n",
    "utf8",
  );
  return { dir, specPath };
}

/** Adapter that fails provider-side in the TEXT path and counts judge calls. */
function textFailAdapter(): { adapter: HarnessAdapter; judgeCalls: () => number } {
  let judgeCalls = 0;
  const adapter: HarnessAdapter = {
    name: "fake",
    available: async () => true,
    run: async () => `>>> USER:\nhi\n\n<<< ASSISTANT:\n\n${PROVIDER_FAILURE_MARKER} openai-codex: invalidated oauth token\n`,
    judge: async () => {
      judgeCalls += 1;
      return "VERDICT: PASS\n1. PASS";
    },
    version: async () => "0.84.2",
  };
  return { adapter, judgeCalls: () => judgeCalls };
}

describe("a provider failure is infrastructure, not a model verdict", () => {
  it("records ERROR and spends no judge call (text path)", async () => {
    const { dir, specPath } = skillWithOneScenario();
    const { adapter, judgeCalls } = textFailAdapter();
    const summary = await runSkillModel({
      spec: loadSpec(specPath),
      skillDir: dir,
      specPath,
      adapter,
      model: { provider: "openai-codex", model: "gpt-5.6-sol" },
      modelToken: "openai-codex:gpt-5.6-sol",
      judge: { provider: "claude-code", model: "claude-opus-4-8" },
      mode: "force",
      timestamp: "2026-08-22T00:00:00.000Z",
    });
    const a1 = summary.results.scenarios.find((s) => s.id === "A1")!;
    expect(a1.judge_verdict).toBe("ERROR");
    expect(a1.judge_reason).toContain("openai-codex");
    expect(judgeCalls()).toBe(0);
  });

  it("records ERROR from a structured providerFailure with a success exit", async () => {
    const { dir, specPath } = skillWithOneScenario();
    let judgeCalls = 0;
    const adapter: HarnessAdapter = {
      name: "fake",
      available: async () => true,
      run: async () => ">>> USER:\nhi\n\n<<< ASSISTANT:\nhello\n",
      runStructured: async () => ({
        transcript: ">>> USER:\nhi\n\n<<< ASSISTANT:\n\n",
        traces: [],
        providerFailure: "openai-codex: WebSocket error",
      }),
      judge: async () => { judgeCalls += 1; return "VERDICT: PASS\n1. PASS"; },
      version: async () => "0.84.2",
    };
    const summary = await runSkillModel({
      spec: loadSpec(specPath),
      skillDir: dir,
      specPath,
      adapter,
      model: { provider: "openai-codex", model: "gpt-5.6-sol" },
      modelToken: "openai-codex:gpt-5.6-sol",
      judge: { provider: "claude-code", model: "claude-opus-4-8" },
      mode: "force",
      timestamp: "2026-08-22T00:00:00.000Z",
      structured: true,
    });
    const a1 = summary.results.scenarios.find((s) => s.id === "A1")!;
    expect(a1.judge_verdict).toBe("ERROR");
    expect(judgeCalls).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/provider-failure-run.test.ts`
Expected: FAIL — the first case judges the transcript (`judgeCalls()` is 1) and the second rejects `structured` as an unknown option.

- [ ] **Step 3: Write minimal implementation**

In `packages/core/src/run.ts`, import the classifier:

```ts
import { providerFailureFromTranscript } from "./provider-failure.js";
```

Add to `RunOptions` (after `canary`):

```ts
  /**
   * Take the structured path even when no scenario declares a trace or trajectory
   * assertion. The subject half of `ScenarioMetrics` — tokens, `subject_cost_usd` —
   * is only ever populated from traces, so without this a run records no cost or
   * token data at all, which is why the reference corpus has none.
   */
  structured?: boolean;
```

Change the structured branch condition (currently `if (scenario.traceAssert || scenario.trajectoryAssert)`) to:

```ts
          const wantStructured = Boolean(opts.structured) || Boolean(scenario.traceAssert) || Boolean(scenario.trajectoryAssert);
          if (wantStructured) {
```

Keep the existing "adapter cannot produce traces" throw for gate-driven cases, but let `--structured` degrade rather than abort — a missing capability is only ERROR when a gate depends on it:

```ts
            if (!ctx.adapter.runStructured) {
              if (scenario.traceAssert || scenario.trajectoryAssert) {
                throw new Error(
                  `scenario \`${scenario.id}\` declares structured objective assertions, but the \`${ctx.adapter.name}\` adapter` +
                    ` cannot produce execution traces/events — the gate would have no evidence to read.`,
                );
              }
              transcript = await ctx.adapter.run(req);
            } else {
              const structured = await ctx.adapter.runStructured({ ...req, scenarioId: scenario.id, rep });
              transcript = structured.transcript;
              traces = structured.traces;
              events = structured.events ?? [];
              eventErrors = structured.eventErrors ?? [];
              if (structured.providerFailure) infrastructureFailure = `provider failure — ${structured.providerFailure}`;
            }
```

Immediately after the `if (wantStructured) { ... } else { transcript = await ctx.adapter.run(req); }` block, classify the text path too:

```ts
        // A provider outage is infrastructure, never a model verdict. Checked on
        // every path: the text path carries the marker in the transcript, the
        // structured path sets `providerFailure` above and exits 0 while doing it.
        if (!infrastructureFailure) {
          const provider = providerFailureFromTranscript(transcript);
          if (provider) infrastructureFailure = `provider failure — ${provider}`;
        }
```

Place this **before** `noResponse = hasEmptyAssistantTurn(transcript);` so a provider failure is not first misread as an empty response and retried.

`infrastructureFailure` already reaches `verdict = "ERROR"` at `run.ts:445` ahead of the judge, so no change is needed in the ERROR chain.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/provider-failure-run.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Mutation-check**

Delete the `if (!infrastructureFailure) { ... }` block and re-run. Expected: the text-path test FAILS with `judgeCalls()` of 1. Restore. Then delete the `if (structured.providerFailure)` line. Expected: the structured test FAILS. Restore.

- [ ] **Step 6: Full suite, then commit**

```bash
npx vitest run
git add packages/core/src/run.ts packages/core/test/provider-failure-run.test.ts
git commit -m "feat(core): a provider failure is ERROR and costs no judge call"
```

---

## Task 4: `--structured` on the CLI

**Files:**
- Modify: `packages/cli/src/cli.ts` (run command args ~`:186-250`, usage text ~`:896-930`)
- Modify: `packages/cli/test/run-tuning.test.ts`

**Interfaces:**
- Consumes: `RunOptions.structured` (Task 3).
- Produces: `--structured` accepted by `run` and forwarded to `runSkillModel`.

- [ ] **Step 1: Write the failing test**

Append to `packages/cli/test/run-tuning.test.ts`:

```ts
it("run --help documents --structured and what it buys", () => {
  const usage = help();
  expect(usage).toContain("--structured");
  expect(usage).toMatch(/cost|token/i);
});
```

`help()` is already exported from `packages/cli/src/cli.ts:893` (it is rendered per call, not frozen at module load). Add it to this test file's existing import: `import { parseRunTuning, releaseExitCode, help, type Args } from "../src/cli.js";`

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/cli/test/run-tuning.test.ts`
Expected: FAIL — usage has no `--structured`.

- [ ] **Step 3: Write minimal implementation**

Beside `const canary = flagBool(args, "canary");` add:

```ts
  const structured = flagBool(args, "structured");
```

Add `structured,` to the `runSkillModel({ ... })` call. In the usage text, under the `run` block:

```
                     [--structured]  record subject tokens, cost and wall time (needs pi --mode json)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/cli/test/run-tuning.test.ts`
Expected: PASS.

- [ ] **Step 5: Rebuild the pi-extension bundle and commit**

`cli`/`core` source changed, so the committed bundle must be regenerated or `bundle.test.ts` goes red.

```bash
npm run build && npm run build:ext
npx vitest run
git add packages/cli/src/cli.ts packages/cli/test/run-tuning.test.ts packages/pi-extension/dist/index.js
git commit -m "feat(cli): --structured records subject cost, tokens and wall time"
```

---

## Task 5: `arms.yaml` — load and validate

**Files:**
- Create: `packages/core/src/arms.ts`
- Create: `packages/core/test/arms.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface Arm { name: string; extensions: string[]; seedSkills: string[]; requireDefinitions: number; env: Record<string, string> }`
  - `NONE_ARM: Arm` (name `"none"`, everything else empty/zero)
  - `loadArms(skillsRoot: string): Map<string, Arm>` — absolute-resolved, `~` expanded
  - `resolveArm(skillsRoot: string, name: string | null): Arm`

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/arms.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, isAbsolute } from "node:path";
import { loadArms, resolveArm, NONE_ARM } from "../src/arms.js";

function corpus(armsYaml: string | null, extName = "grants.ts"): string {
  const root = mkdtempSync(join(tmpdir(), "sh-arms-"));
  mkdirSync(join(root, "tests"), { recursive: true });
  mkdirSync(join(root, "ext"), { recursive: true });
  writeFileSync(join(root, "ext", extName), "export default function () {}\n", "utf8");
  if (armsYaml !== null) writeFileSync(join(root, "tests", "arms.yaml"), armsYaml, "utf8");
  return root;
}

const VALID = (root: string) => `
arms:
  - name: pi-daddy
    extensions: [${root}/ext/grants.ts]
    seed_skills: [agents]
    require_definitions: 6
    env:
      PI_GRANTS_GRANT: "tool:read"
      PI_GRANTS_LEDGER: "<run-dir>/pi-daddy.ledger.jsonl"
`;

describe("loadArms", () => {
  it("resolves extension paths to absolute", () => {
    const root = corpus("placeholder");
    writeFileSync(join(root, "tests", "arms.yaml"), VALID(root), "utf8");
    const arm = loadArms(root).get("pi-daddy")!;
    expect(isAbsolute(arm.extensions[0])).toBe(true);
    expect(arm.requireDefinitions).toBe(6);
    expect(arm.env.PI_GRANTS_GRANT).toBe("tool:read");
  });

  it("refuses an extension path that does not exist", () => {
    const root = corpus("arms:\n  - name: a\n    extensions: [/nope/missing.ts]\n");
    expect(() => loadArms(root)).toThrow(/\/nope\/missing\.ts/);
  });

  it("refuses two arms with the same name", () => {
    const root = corpus("placeholder");
    writeFileSync(join(root, "tests", "arms.yaml"), VALID(root) + VALID(root).replace("arms:\n", ""), "utf8");
    expect(() => loadArms(root)).toThrow(/pi-daddy/);
  });

  it("refuses the reserved name `none`", () => {
    const root = corpus("arms:\n  - name: none\n    extensions: []\n");
    expect(() => loadArms(root)).toThrow(/reserved/);
  });

  it("is empty when the corpus declares no arms", () => {
    expect(loadArms(corpus(null)).size).toBe(0);
  });
});

describe("resolveArm", () => {
  it("returns the none arm for a null name", () => {
    expect(resolveArm(corpus(null), null)).toEqual(NONE_ARM);
  });

  it("names the available arms when asked for an unknown one", () => {
    const root = corpus("placeholder");
    writeFileSync(join(root, "tests", "arms.yaml"), VALID(root), "utf8");
    expect(() => resolveArm(root, "typo")).toThrow(/pi-daddy/);
  });

  it("refuses an arm name that would not survive a directory name", () => {
    const root = corpus("arms:\n  - name: 'bad/name'\n    extensions: []\n");
    expect(() => loadArms(root)).toThrow(/bad\/name/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/arms.test.ts`
Expected: FAIL — `Failed to resolve import "../src/arms.js"`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/core/src/arms.ts`:

```ts
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { load } from "js-yaml";

/**
 * An arm: a named bundle of harness-side conditions a run is measured under.
 *
 * Why arms live HERE and not in `specification.yaml`. An arm is meant to be
 * A/B'd — the control and the treatment must be the same experiment run twice.
 * Declaring it in the spec would move the spec digest, which both stales every
 * committed run in the corpus and makes control and treatment textually
 * different experiments. So `arms.yaml` is deliberately part of NO digest, and
 * the arm is carried in the run-dir TAG instead: `lint` and `stability` key on
 * the tag, so two arms are separate lineages that can never be misread as one
 * lineage flipping its verdict run-over-run.
 */
export interface Arm {
  name: string;
  /** Absolute paths, one `--extension` each. */
  extensions: string[];
  /** Dirs (relative to the skills root) copied into `<workspace>/.pi/skills/`. */
  seedSkills: string[];
  /** Minimum definitions the seeding must produce, else the run ERRORs. */
  requireDefinitions: number;
  /** Env for the subject process. `<run-dir>` is substituted per run. */
  env: Record<string, string>;
}

/** The implicit control: today's behaviour, byte-identical, no extensions. */
export const NONE_ARM: Arm = { name: "none", extensions: [], seedSkills: [], requireDefinitions: 0, env: {} };

/** `none` is the control's name; an arm may not shadow it. */
const RESERVED = new Set(["none"]);

/**
 * Arm names become a path segment, so they are restricted to what survives one
 * unambiguously — no separators, no dots, nothing needing quoting.
 */
const NAME_RE = /^[A-Za-z0-9_-]+$/;

function expandHome(p: string): string {
  return p === "~" || p.startsWith("~/") ? join(homedir(), p.slice(1)) : p;
}

/** `<skills-root>/tests/arms.yaml`, or an empty map when the corpus declares none. */
export function loadArms(skillsRoot: string): Map<string, Arm> {
  const file = join(skillsRoot, "tests", "arms.yaml");
  const out = new Map<string, Arm>();
  if (!existsSync(file)) return out;

  const doc = load(readFileSync(file, "utf8")) as { arms?: unknown } | null;
  const raw = Array.isArray(doc?.arms) ? (doc!.arms as Record<string, unknown>[]) : [];

  for (const entry of raw) {
    const name = typeof entry?.name === "string" ? entry.name.trim() : "";
    if (!NAME_RE.test(name)) {
      throw new Error(`${file}: arm name \`${name}\` must match ${NAME_RE} — it becomes a run-directory segment`);
    }
    if (RESERVED.has(name)) throw new Error(`${file}: arm name \`${name}\` is reserved for the implicit control`);
    if (out.has(name)) throw new Error(`${file}: two arms are both named \`${name}\``);

    const extensions = (Array.isArray(entry.extensions) ? entry.extensions : []).map((p) => {
      const expanded = expandHome(String(p));
      const abs = isAbsolute(expanded) ? expanded : resolve(skillsRoot, expanded);
      // Same refusal `extensionFlags` makes, made earlier and for the same reason:
      // pi would start without it and the scenario would silently test an agent
      // with no delegation tool at all.
      if (!existsSync(abs)) {
        throw new Error(`${file}: arm \`${name}\` names extension ${abs}, which does not exist — pi would start without it`);
      }
      return abs;
    });

    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries((entry.env ?? {}) as Record<string, unknown>)) env[k] = String(v);

    out.set(name, {
      name,
      extensions,
      seedSkills: (Array.isArray(entry.seed_skills) ? entry.seed_skills : []).map(String),
      requireDefinitions: Number(entry.require_definitions ?? 0) || 0,
      env,
    });
  }
  return out;
}

/** The named arm, or the control when no `--arm` was given. */
export function resolveArm(skillsRoot: string, name: string | null): Arm {
  if (!name || name === NONE_ARM.name) return NONE_ARM;
  const arms = loadArms(skillsRoot);
  const arm = arms.get(name);
  if (!arm) {
    const known = [...arms.keys()];
    throw new Error(
      `unknown arm \`${name}\` — ${known.length ? `declared arms: ${known.join(", ")}` : `no arms declared in ${join(skillsRoot, "tests", "arms.yaml")}`}`,
    );
  }
  return arm;
}
```

Append to `packages/core/src/index.ts`:

```ts
export * from "./arms.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/arms.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Mutation-check**

Delete the `if (!existsSync(abs))` throw and re-run. Expected: the missing-extension test FAILS. Restore. Change `NAME_RE` to `/.*/` and re-run. Expected: the `bad/name` test FAILS. Restore.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/arms.ts packages/core/src/index.ts packages/core/test/arms.test.ts
git commit -m "feat(core): load and validate arms from a corpus-side arms.yaml"
```

---

## Task 6: Seed pi-daddy definitions, and refuse when there is nothing to spawn

pi-daddy resolves spawnable definitions from `<cwd>/.pi/skills` and `~/.pi/agent/skills` (`catalog.ts:55`). skill-harness runs pi in a neutral temp workspace, so without seeding the extension loads and has **nothing to spawn** — the arm would run green and measure nothing.

**Files:**
- Modify: `packages/core/src/arms.ts`
- Modify: `packages/core/test/arms.test.ts`

**Interfaces:**
- Consumes: `Arm` (Task 5).
- Produces: `seedArmDefinitions(arm: Arm, skillsRoot: string, workspaceCwd: string, opts?: { ambientSkillsDir?: string }): number` — returns the definition count, throws on any of the three refusals.

- [ ] **Step 1: Write the failing test**

Append to `packages/core/test/arms.test.ts`:

```ts
import { seedArmDefinitions } from "../src/arms.js";
import { readdirSync } from "node:fs";

function armWith(over: Partial<Arm>): Arm {
  return { name: "pi-daddy", extensions: [], seedSkills: ["agents"], requireDefinitions: 2, env: {}, ...over };
}

function corpusWithAgents(count: number): string {
  const root = mkdtempSync(join(tmpdir(), "sh-seed-"));
  mkdirSync(join(root, "agents"), { recursive: true });
  for (let i = 0; i < count; i++) {
    writeFileSync(join(root, "agents", `a${i}.md`), `---\nname: a${i}\ntools: read\n---\n\nbody\n`, "utf8");
  }
  return root;
}

describe("seedArmDefinitions", () => {
  const emptyAmbient = () => mkdtempSync(join(tmpdir(), "sh-ambient-empty-"));

  it("copies definitions into <workspace>/.pi/skills and counts them", () => {
    const root = corpusWithAgents(3);
    const ws = mkdtempSync(join(tmpdir(), "sh-ws-"));
    const n = seedArmDefinitions(armWith({}), root, ws, { ambientSkillsDir: emptyAmbient() });
    expect(n).toBe(3);
    expect(readdirSync(join(ws, ".pi", "skills")).sort()).toEqual(["a0.md", "a1.md", "a2.md"]);
  });

  it("ERRORs when seeding produces fewer definitions than required", () => {
    const root = corpusWithAgents(1);
    const ws = mkdtempSync(join(tmpdir(), "sh-ws-"));
    expect(() => seedArmDefinitions(armWith({ requireDefinitions: 6 }), root, ws, { ambientSkillsDir: emptyAmbient() }))
      .toThrow(/1 .*6|seeded 1/);
  });

  it("ERRORs when the ambient skills root is non-empty", () => {
    const root = corpusWithAgents(3);
    const ws = mkdtempSync(join(tmpdir(), "sh-ws-"));
    const ambient = mkdtempSync(join(tmpdir(), "sh-ambient-full-"));
    writeFileSync(join(ambient, "leaky.md"), "---\nname: leaky\n---\n", "utf8");
    expect(() => seedArmDefinitions(armWith({}), root, ws, { ambientSkillsDir: ambient })).toThrow(/leaky|ambient/i);
  });

  it("is a no-op for the control arm", () => {
    const ws = mkdtempSync(join(tmpdir(), "sh-ws-"));
    expect(seedArmDefinitions(NONE_ARM, corpusWithAgents(3), ws, { ambientSkillsDir: emptyAmbient() })).toBe(0);
    expect(existsSync(join(ws, ".pi"))).toBe(false);
  });
});
```

Add `existsSync` to the `node:fs` import at the top of the test file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/arms.test.ts`
Expected: FAIL — `seedArmDefinitions` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `packages/core/src/arms.ts`:

```ts
import { copyFileSync, mkdirSync, readdirSync, statSync } from "node:fs";

/** pi's second skill root, which pi-daddy reads too. */
function defaultAmbientSkillsDir(): string {
  return join(homedir(), ".pi", "agent", "skills");
}

/**
 * Copy an arm's definitions into `<workspace>/.pi/skills/` and return the count.
 *
 * Three refusals, each with a negative control in the suite, because a
 * positive-only check measures less than it claims:
 *
 *  1. **Fewer definitions than required.** pi-daddy spawns definitions by path.
 *     Zero definitions means the arm has nothing to spawn, so it would run green
 *     and measure nothing — a vacuous result shaped exactly like a finding.
 *  2. **A missing seed directory** — the `--skill <nonexistent>` class: pi accepts
 *     silently, so the run would look fine and measure a different thing.
 *  3. **A non-empty ambient skills root.** pi-daddy reads `~/.pi/agent/skills` as
 *     well as the workspace, so anything there is an uncontrolled variable in the
 *     measurement. Empty on the reference box today — that is luck, not a
 *     guarantee, and this check is what turns it into one.
 */
export function seedArmDefinitions(
  arm: Arm,
  skillsRoot: string,
  workspaceCwd: string,
  opts: { ambientSkillsDir?: string } = {},
): number {
  if (arm.name === NONE_ARM.name || arm.seedSkills.length === 0) return 0;

  const ambient = opts.ambientSkillsDir ?? defaultAmbientSkillsDir();
  let ambientEntries: string[] = [];
  try {
    ambientEntries = readdirSync(ambient);
  } catch {
    ambientEntries = []; // absent is as good as empty: nothing can leak from it
  }
  if (ambientEntries.length > 0) {
    throw new Error(
      `arm \`${arm.name}\`: the ambient skill root ${ambient} is not empty (${ambientEntries.slice(0, 5).join(", ")}) — ` +
        `pi-daddy reads it as well as the workspace, so those definitions would be an uncontrolled variable in the measurement. ` +
        `Move them aside for the run.`,
    );
  }

  const dest = join(workspaceCwd, ".pi", "skills");
  mkdirSync(dest, { recursive: true });

  let count = 0;
  for (const rel of arm.seedSkills) {
    const src = resolve(skillsRoot, rel);
    let names: string[];
    try {
      names = readdirSync(src);
    } catch {
      throw new Error(`arm \`${arm.name}\`: seed_skills names ${src}, which cannot be read — pi would start with nothing to spawn`);
    }
    for (const name of names) {
      const from = join(src, name);
      if (!name.endsWith(".md") || !statSync(from).isFile()) continue;
      copyFileSync(from, join(dest, name));
      count += 1;
    }
  }

  if (count < arm.requireDefinitions) {
    throw new Error(
      `arm \`${arm.name}\`: seeded ${count} definition(s) into ${dest} but require_definitions is ${arm.requireDefinitions} — ` +
        `pi-daddy would have nothing (or too little) to spawn, and the arm would measure nothing while looking green.`,
    );
  }
  return count;
}
```

Merge the new `node:fs` import with the existing ones at the top of the file rather than adding a second import statement.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/arms.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Mutation-check**

Delete the `count < arm.requireDefinitions` throw → the second test must FAIL. Delete the `ambientEntries.length > 0` throw → the third must FAIL. Restore both.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/arms.ts packages/core/test/arms.test.ts
git commit -m "feat(core): seed arm definitions and refuse an arm with nothing to spawn"
```

---

## Task 7: The arm in the run tag and in the record

**Files:**
- Modify: `packages/core/src/results.ts` (`runDirFor` ~`:272`, `ResultsFile` ~`:124-196`, the writer's field list ~`:366`)
- Modify: `packages/core/test/results.test.ts`

**Interfaces:**
- Consumes: `Arm` (Task 5).
- Produces: `runDirFor(skillDir, harness, model, timestamp, armName?)`; `ResultsFile.arm?: { name: string; extensions: string[]; definitions: number }`.

- [ ] **Step 1: Write the failing test**

Append to `packages/core/test/results.test.ts`:

```ts
describe("runDirFor with an arm", () => {
  const model = { provider: "openai-codex", model: "gpt-5.6-sol:medium" };

  it("is byte-identical to today's path for the control arm", () => {
    const bare = runDirFor("/s", "pi", model, "2026-08-22T00:00:00.000Z");
    expect(runDirFor("/s", "pi", model, "2026-08-22T00:00:00.000Z", "none")).toBe(bare);
    expect(runDirFor("/s", "pi", model, "2026-08-22T00:00:00.000Z", undefined)).toBe(bare);
    expect(bare).toContain("pi-openai-codex-gpt-5.6-sol-medium");
  });

  it("appends the arm with a separator modelSlug can never emit", () => {
    const dir = runDirFor("/s", "pi", model, "2026-08-22T00:00:00.000Z", "pi-daddy");
    expect(dir).toContain("pi-openai-codex-gpt-5.6-sol-medium+pi-daddy");
    // splittable back into exactly two halves
    const tag = dir.split("/").slice(-2)[0];
    expect(tag.split("+")).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/results.test.ts`
Expected: FAIL — `runDirFor` takes four arguments.

- [ ] **Step 3: Write minimal implementation**

Replace `runDirFor` in `packages/core/src/results.ts`:

```ts
/**
 * `<skillDir>/tests/results/<harness>-<model-slug>[+<arm>]/<timestamp-slug>/`
 *
 * The arm is part of the run's IDENTITY, not of the spec's digest. `lint` and
 * `stability` both key on this tag, so two arms become separate lineages that can
 * never be misread as one lineage flipping run-over-run — and no
 * `specification.yaml` byte moves, so every committed run stays valid.
 *
 * `+` is deliberate and is appended OUTSIDE `modelSlug`, whose character class
 * (`[^A-Za-z0-9._-]`) cannot emit one. So the separator can never occur inside a
 * slug and the tag stays unambiguously splittable back into model and arm. The
 * control arm appends nothing, so its paths are byte-identical to before arms
 * existed.
 */
export function runDirFor(
  skillDir: string,
  harness: string,
  model: ModelRef,
  timestamp: string,
  armName?: string,
): string {
  const arm = armName && armName !== "none" ? `+${armName}` : "";
  return join(skillDir, "tests", "results", `${harness}-${modelSlug(model)}${arm}`, timestampSlug(timestamp));
}
```

Add to `ResultsFile`, after `mode`:

```ts
  /**
   * The arm this run was measured under, absent for the control.
   *
   * Recorded rather than inferred from the tag: the tag says which arm, this says
   * what the arm actually loaded — a run whose extension list or definition count
   * differed from today's `arms.yaml` is not comparable, and only the record can
   * show that.
   */
  arm?: { name: string; extensions: string[]; definitions: number };
```

Add `...(draft.arm ? { arm: draft.arm } : {}),` to the object `writeResults` builds, and the matching optional field to `ResultsDraft`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/results.test.ts`
Expected: PASS.

- [ ] **Step 5: Mutation-check**

Change `armName !== "none"` to `armName !== ""` and re-run. Expected: the control-arm test FAILS (a `none` arm would start creating a `+none` directory, forking the corpus's lineage silently). Restore.

- [ ] **Step 6: Full suite, then commit**

```bash
npx vitest run
git add packages/core/src/results.ts packages/core/test/results.test.ts
git commit -m "feat(core): carry the arm in the run tag and in the record"
```

---

## Task 8: Thread the arm through the run

**Files:**
- Modify: `packages/core/src/adapters/types.ts` (`RunReq`)
- Modify: `packages/core/src/run.ts` (`RunOptions`, `runDirFor` call, workspace setup, `req` construction)
- Modify: `packages/adapters/src/pi.ts` (`run`, `runStructured` — pass env)
- Modify: `packages/adapters/src/pi-json.ts` (`PiJsonRunOptions.env`, the `spawn` call)
- Create: `packages/core/test/arm-run-integration.test.ts`

**Interfaces:**
- Consumes: `Arm`, `seedArmDefinitions` (Tasks 5–6); `runDirFor(..., armName)` (Task 7).
- Produces: `RunReq.armEnv?: Record<string, string>`; `RunOptions.arm?: Arm`; `results.yaml` carrying `arm:`; the subject process receiving `--extension <abs>` per arm extension and the arm's env with `<run-dir>` substituted.

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/arm-run-integration.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSkillModel } from "../src/run.js";
import { loadSpec } from "../src/spec.js";
import type { Arm } from "../src/arms.js";
import type { HarnessAdapter, RunReq } from "../src/adapters/types.js";

function corpus(): { root: string; dir: string; specPath: string } {
  const root = mkdtempSync(join(tmpdir(), "sh-armrun-"));
  const dir = join(root, "greeter");
  mkdirSync(join(dir, "tests"), { recursive: true });
  mkdirSync(join(root, "agents"), { recursive: true });
  for (const n of ["plan", "review"]) {
    writeFileSync(join(root, "agents", `${n}.md`), `---\nname: ${n}\ntools: read\n---\n\nbody\n`, "utf8");
  }
  writeFileSync(join(dir, "SKILL.md"), "---\nname: greeter\n---\n\n## Greet\nSay hello.\n", "utf8");
  const specPath = join(dir, "tests", "specification.yaml");
  writeFileSync(
    specPath,
    ["skill: greeter", "scenarios:", "  - id: A1", "    title: greets", "    turns: ['hi']", "    checklist: ['says hello']"].join("\n") + "\n",
    "utf8",
  );
  return { root, dir, specPath };
}

function recordingAdapter(): { adapter: HarnessAdapter; reqs: RunReq[] } {
  const reqs: RunReq[] = [];
  const adapter: HarnessAdapter = {
    name: "pi",
    available: async () => true,
    run: async (req) => {
      reqs.push(req);
      return ">>> USER:\nhi\n\n<<< ASSISTANT:\nhello\n";
    },
    judge: async () => "VERDICT: PASS\n1. PASS",
    version: async () => "0.84.2",
  };
  return { adapter, reqs };
}

const ARM = (root: string): Arm => ({
  name: "pi-daddy",
  extensions: [join(root, "agents", "plan.md")], // any existing file: the adapter is faked
  seedSkills: ["agents"],
  requireDefinitions: 2,
  env: { PI_GRANTS_LEDGER: "<run-dir>/pi-daddy.ledger.jsonl", PI_GRANTS_GRANT: "tool:read" },
});

describe("an arm reaches the subject and the record", () => {
  it("writes into a +arm tag, records the arm, and substitutes <run-dir>", async () => {
    const { root, dir, specPath } = corpus();
    const { adapter, reqs } = recordingAdapter();
    const ambient = mkdtempSync(join(tmpdir(), "sh-ambient-"));
    const summary = await runSkillModel({
      spec: loadSpec(specPath),
      skillDir: dir,
      specPath,
      adapter,
      model: { provider: "openai-codex", model: "gpt-5.6-sol:medium" },
      modelToken: "openai-codex:gpt-5.6-sol:medium",
      judge: { provider: "claude-code", model: "claude-opus-4-8" },
      mode: "force",
      timestamp: "2026-08-22T00:00:00.000Z",
      arm: ARM(root),
      skillsRoot: root,
      ambientSkillsDir: ambient,
    });

    expect(summary.runDir).toContain("+pi-daddy");
    expect(summary.results.arm).toEqual({
      name: "pi-daddy",
      extensions: [join(root, "agents", "plan.md")],
      definitions: 2,
    });

    const req = reqs[0];
    expect(req.extensions).toContain(join(root, "agents", "plan.md"));
    expect(req.armEnv!.PI_GRANTS_LEDGER).toBe(join(summary.runDir, "pi-daddy.ledger.jsonl"));
    expect(req.armEnv!.PI_GRANTS_GRANT).toBe("tool:read");
    expect(existsSync(join(req.cwd, ".pi", "skills", "plan.md"))).toBe(true);
  });

  it("changes nothing for the control arm", async () => {
    const { root, dir, specPath } = corpus();
    const { adapter, reqs } = recordingAdapter();
    const summary = await runSkillModel({
      spec: loadSpec(specPath),
      skillDir: dir,
      specPath,
      adapter,
      model: { provider: "openai-codex", model: "gpt-5.6-sol:medium" },
      modelToken: "openai-codex:gpt-5.6-sol:medium",
      judge: { provider: "claude-code", model: "claude-opus-4-8" },
      mode: "force",
      timestamp: "2026-08-22T00:00:00.000Z",
      skillsRoot: root,
    });
    expect(summary.runDir).not.toContain("+");
    expect(summary.results.arm).toBeUndefined();
    expect(reqs[0].armEnv).toBeUndefined();
    expect(existsSync(join(reqs[0].cwd, ".pi"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/arm-run-integration.test.ts`
Expected: FAIL — `arm`, `skillsRoot` and `ambientSkillsDir` are not `RunOptions`.

- [ ] **Step 3: Write minimal implementation**

In `packages/core/src/adapters/types.ts`, add to `RunReq`:

```ts
  /**
   * Extra env for the subject process, from the arm. Merged over `process.env` by
   * the adapter — an arm must be able to add `PI_GRANTS_*` without the harness
   * inheriting a caller's copy of them.
   */
  armEnv?: Record<string, string>;
```

In `packages/core/src/run.ts`, add to `RunOptions`:

```ts
  /** The arm this run is measured under. Absent means the control (`none`). */
  arm?: Arm;
  /** Skills root — `seed_skills` paths resolve against it. Defaults to the skill's parent. */
  skillsRoot?: string;
  /** Injectable ambient skill root, for tests. Production reads `~/.pi/agent/skills`. */
  ambientSkillsDir?: string;
```

Import `NONE_ARM`, `seedArmDefinitions` and the `Arm` type from `./arms.js`.

Pass the arm name to the run dir:

```ts
  const arm = opts.arm ?? NONE_ARM;
  const runDir = runDirFor(skillDir, adapter.name, model, timestamp, arm.name);
```

After each workspace is created and before the subject runs, seed it and build the env. Do this where `ws` is available (beside the existing `before = snapshotPaths(...)` setup), so a retry's fresh workspace is re-seeded:

```ts
      const skillsRoot = opts.skillsRoot ?? dirname(skillDir);
      const definitions = seedArmDefinitions(arm, skillsRoot, ws.cwd, { ambientSkillsDir: opts.ambientSkillsDir });
      const armEnv = Object.keys(arm.env).length
        ? Object.fromEntries(Object.entries(arm.env).map(([k, v]) => [k, v.split("<run-dir>").join(runDir)]))
        : undefined;
```

Add to the `req` object built for the non-seeded branch, merging the arm's extensions with any the scenario declares:

```ts
            extensions: [
              ...(scenario.extensions?.map((e) => resolve(dirname(ctx.specPath), e)) ?? []),
              ...arm.extensions,
            ],
            ...(armEnv ? { armEnv } : {}),
```

Do the same for the `runSeeded` call's request. Record the arm on the results draft:

```ts
    ...(arm.name === NONE_ARM.name ? {} : { arm: { name: arm.name, extensions: arm.extensions, definitions } }),
```

In `packages/adapters/src/pi.ts`, pass the env through both paths. `exec` already accepts `env`:

```ts
    const env = req.armEnv ? { ...process.env, ...req.armEnv } : undefined;
```

then add `env` to each `exec("pi", args, { cwd: req.cwd, timeoutMs: PI_TIMEOUT_MS, env })` call, and pass `env` into `runPiJson` from `runStructured`.

In `packages/adapters/src/pi-json.ts`, add `env?: NodeJS.ProcessEnv;` to `PiJsonRunOptions` and `env: opts.env,` to the `spawn` options object. (`spawn` treats `undefined` as "inherit", so the control arm is unaffected.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/arm-run-integration.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Mutation-check**

Remove `...arm.extensions` from the `extensions` array → the first test FAILS. Change `v.split("<run-dir>").join(runDir)` to plain `v` → the `<run-dir>` assertion FAILS. Restore both.

- [ ] **Step 6: Full suite, then commit**

```bash
npx vitest run
git add packages/core/src/run.ts packages/core/src/adapters/types.ts packages/adapters/src/pi.ts packages/adapters/src/pi-json.ts packages/core/test/arm-run-integration.test.ts
git commit -m "feat: thread an arm's extensions, seeded definitions and env into the subject"
```

---

## Task 9: `--arm` on the CLI, and prove lint is undisturbed

**Files:**
- Modify: `packages/cli/src/cli.ts` (run command, usage text)
- Modify: `packages/cli/test/run-tuning.test.ts`
- Create: `packages/core/test/arm-lint-lineage.test.ts`

**Interfaces:**
- Consumes: `resolveArm` (Task 5); `RunOptions.arm`, `RunOptions.skillsRoot` (Task 8).
- Produces: `run --arm <name>` wired end to end.

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/arm-lint-lineage.test.ts`. The claim under test is the design's central one: an arm-tagged directory is a separate lineage, so it neither adds findings to nor removes findings from the control's.

```ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintSkill } from "../src/lint.js";

/**
 * Build a corpus with one run dir, lint it, then clone that run dir under a
 * `+pi-daddy` tag and lint again. The finding count must not move: `lint` keys on
 * the tag, so the arm is a separate lineage rather than a newer run of the same one.
 */
describe("an arm tag is its own lineage", () => {
  it("adding an arm-tagged run does not change the control's findings", () => {
    // Build a minimal spec'd skill with one committed run dir using the `skill()`
    // helper that already exists at the top of packages/core/test/lint.test.ts —
    // import or copy that helper rather than writing a second one, so this test
    // and the existing lint tests cannot drift apart on corpus shape.
    const skillDir = skillWithOneCommittedRun();
    const before = lintSkill(skillDir);

    const results = join(skillDir, "tests", "results");
    const [tag] = readdirSync(results);
    cpSync(join(results, tag), join(results, `${tag}+pi-daddy`), { recursive: true });

    const after = lintSkill(skillDir);
    expect(after.length).toBe(before.length);
  });
});
```

Before writing this, read `packages/core/test/lint.test.ts`. The real entry point is
`lintSkill(skillDir): LintFinding[]` (`lint.ts:57`) — **per skill, returning an array**, not a
root-level call returning an object. That file already has a `skill(specYaml, extra?)` helper
that builds a spec'd skill in a temp dir and a `writeResults` import for planting a run;
build `skillWithOneCommittedRun()` on top of those two rather than inventing a third corpus
builder.

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `npx vitest run packages/core/test/arm-lint-lineage.test.ts`
Expected: PASS on the first try — `lint.ts:376` enumerates tag dirs with a bare `readdirSync` and never parses a tag name. **This is a characterization test, so its value is entirely in the mutation check in Step 5.** If it FAILS, stop: the design's central assumption is wrong and the arm cannot live in the tag.

- [ ] **Step 3: Write minimal implementation**

In `packages/cli/src/cli.ts`, beside `const canary = ...`:

```ts
  const armName = flagStr(args, "arm") || null;
```

Resolve it once per skills root, before the skill loop, so a typo'd arm fails before any token is spent:

```ts
  const arm = resolveArm(root, armName);
```

Add `arm,` and `skillsRoot: root,` to the `runSkillModel({ ... })` call, and import `resolveArm` from `@skill-harness/core`. Add to the usage text under `run`:

```
                     [--arm <name>]  measure under a named arm from <skills-root>/tests/arms.yaml
                                     (loads its extensions, seeds pi-daddy definitions, tags the run dir)
```

Append to `packages/cli/test/run-tuning.test.ts`:

```ts
it("run --help documents --arm and where arms are declared", () => {
  const usage = help();
  expect(usage).toContain("--arm");
  expect(usage).toContain("arms.yaml");
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/cli/test/run-tuning.test.ts packages/core/test/arm-lint-lineage.test.ts`
Expected: PASS.

- [ ] **Step 5: Mutation-check the lineage claim**

This is the important one. Temporarily change `runDirFor`'s arm segment from `+${armName}` to `""` (so both arms collide in one tag), rebuild the cloned dir as a *newer* timestamp inside the control's tag, and re-run. Expected: the finding count MOVES, proving the test can detect a collapsed lineage. Restore.

- [ ] **Step 6: Verify against the real corpus**

The global invariant. Run:

```bash
npm run build
node bin/skill-harness.js lint all --skills ../principal-pi-skills 2>&1 | tail -1
```

Expected, exactly: `7 skill(s), 104 finding(s), 32 note(s) (do not fail the gate)`

If the number moved, an arm leaked into a digest — stop and find out why before continuing.

- [ ] **Step 7: Rebuild the bundle, full suite, commit**

```bash
npm run build:ext
npx vitest run
git add packages/cli/src/cli.ts packages/cli/test/run-tuning.test.ts packages/core/test/arm-lint-lineage.test.ts packages/pi-extension/dist/index.js
git commit -m "feat(cli): --arm selects a measurement arm, tagged as its own lineage"
```

---

## Task 10: `arms.yaml` for the reference corpus

This lands in `principal-pi-skills` (`../principal-pi-skills`, HEAD `2c53559`), not in this repo. It is data, not code, so it gets no unit test — Task 11's probe is its test.

**Files:**
- Create: `../principal-pi-skills/tests/arms.yaml`

- [ ] **Step 1: Confirm the pi-daddy extension path exists**

```bash
ls ~/prepos/pi-daddy/packages/pi-daddy/extensions/grants.ts
ls ~/prepos/pi-daddy/packages/pi-daddy/dist/index.js
```

Both must exist. If `dist/` is missing, run `npm run build` in `~/prepos/pi-daddy` first — the extension imports from it.

- [ ] **Step 2: Write the file**

```bash
mkdir -p ../principal-pi-skills/tests
cat > ../principal-pi-skills/tests/arms.yaml <<'YAML'
# Measurement arms. Deliberately NOT part of any spec digest: an arm is meant to
# be A/B'd, so control and treatment must be the same experiment run twice. The
# arm is carried in the run-dir tag instead, which `lint` and `stability` key on.
#
# The implicit `none` arm is the control — no extension, no seeded definitions,
# byte-identical to a run from before arms existed.
arms:
  # Governed delegation. NOTE this arm changes TWO things at once versus the
  # control: a spawn tool exists at all (no spec here declares env.extensions, so
  # every committed run had none and could only narrate delegating), and spawning
  # is governed. Report it as "governed delegation vs no delegation", never as
  # "governance changed behaviour".
  - name: pi-daddy
    extensions:
      - ~/prepos/pi-daddy/packages/pi-daddy/extensions/grants.ts
    # pi-daddy resolves definitions by path from <cwd>/.pi/skills, and the harness
    # runs pi in a neutral temp workspace — so without seeding it has nothing to
    # spawn and the arm would measure nothing while looking green.
    seed_skills:
      - agents
    require_definitions: 6
    env:
      # Narrow root ceiling. There is NO OS sandbox — core's SandboxBackend seam is
      # fake-backed — so this bounds the intended path; it is not containment, and
      # no report may claim otherwise.
      PI_GRANTS_GRANT: "tool:read,tool:grep,tool:find,tool:ls"
      PI_GRANTS_MAX_DEPTH: "1"
      # Per-run ledger. This is the arm's DELIVERY PROOF: zero spawn events means
      # the model never delegated, and "pi-daddy changed nothing" would be
      # indistinguishable from "pi-daddy was never used".
      PI_GRANTS_LEDGER: "<run-dir>/pi-daddy.ledger.jsonl"
YAML
```

- [ ] **Step 3: Prove the loader accepts it and lint is unmoved**

```bash
node bin/skill-harness.js lint all --skills ../principal-pi-skills 2>&1 | tail -1
```

Expected, unchanged: `7 skill(s), 104 finding(s), 32 note(s) (do not fail the gate)`

- [ ] **Step 4: Commit in the sister repo**

```bash
cd ../principal-pi-skills
git checkout -b feat/measurement-arms
git add tests/arms.yaml
git commit -m "feat: declare a pi-daddy measurement arm"
cd -
```

---

## Task 11: Re-run the thinking spike

**Blocked** until the owner re-authenticates `openai-codex`. `~/.pi/agent/auth.json` holds the credential; `pi auth check` reports `ready` even when it is invalidated, so it cannot be the gate.

- [ ] **Step 1: Probe with one real call**

```bash
pi --no-context-files --no-extensions --no-skills --no-session \
   --provider openai-codex --model gpt-5.6-sol -p "Reply with exactly: ok" </dev/null; echo "exit=$?"
```

Expected: `ok` and `exit=0`. If you see `Encountered invalidated oauth token for user, failing request` and `exit=1`, stop — re-authenticate first.

- [ ] **Step 2: Does the `:medium` suffix bind?**

```bash
for m in "gpt-5.6-sol:medium" "gpt-5.6-sol"; do
  echo "== $m"
  pi --no-context-files --no-extensions --no-skills --no-session \
     --provider openai-codex --model "$m" --mode json \
     -p "Reply with exactly: ok" </dev/null 2>/dev/null \
  | grep -o '"usage":{[^}]*}' | tail -1
done
pi --no-context-files --no-extensions --no-skills --no-session \
   --provider openai-codex --model gpt-5.6-sol --thinking medium --mode json \
   -p "Reply with exactly: ok" </dev/null 2>/dev/null | grep -o '"usage":{[^}]*}' | tail -1
```

Compare the three. If `gpt-5.6-sol:medium` matches the explicit `--thinking medium` call and differs from the bare one, **the suffix binds and no code change is needed** — record that in the spec's §4 and skip Step 3.

- [ ] **Step 3: Only if it does not bind — add a thinking segment**

Write the failing test first, in `packages/core/test/model-ref.test.ts`:

```ts
it("parses a thinking level from a third segment", () => {
  expect(parseModelRef("openai-codex:gpt-5.6-sol:medium")).toEqual({
    provider: "openai-codex", model: "gpt-5.6-sol", thinking: "medium",
  });
});
it("leaves a two-segment token alone", () => {
  expect(parseModelRef("fireworks:accounts/f/models/x")).toEqual({
    provider: "fireworks", model: "accounts/f/models/x",
  });
});
```

Then extend `ModelRef` with `thinking?: string`, split only on a trailing segment matching `/^(off|minimal|low|medium|high|xhigh|max)$/`, keep `modelSlug` including the level so tags stay distinct, and emit `--thinking` in `pi.ts`'s `common` array. Mutation-check by removing the `--thinking` push and asserting the args test fails.

- [ ] **Step 4: Record the outcome in the spec and commit**

Update §4's "Spike result" section with what was measured, then:

```bash
git add docs/superpowers/specs/2026-08-22-codex-arms-campaign-design.md
git commit -m "docs: record whether pi binds a thinking suffix on --model"
```

---

## Task 12: The Wave 0 runbook

**Files:**
- Create: `docs/CODEX-ARMS-RUNBOOK.md`

- [ ] **Step 1: Write it**

Structure, free and offline commands first, every command copy-pasteable:

1. **Preflight (free).** `pi --version` (expect ≥ 0.84.2); the Task 11 Step 1 one-call probe with the explicit warning that `pi auth check` reports `ready` against an invalidated token and must not be used as the gate; `ls ~/.pi/agent/skills` must be empty or the arm refuses; `node bin/skill-harness.js lint all --skills ../principal-pi-skills | tail -1` recorded as the before-baseline (`104 finding(s), 32 note(s)`).
2. **Wave 0, control arm.**
   ```bash
   node bin/skill-harness.js run review --skills ../principal-pi-skills \
     --mode force --model openai-codex:gpt-5.6-sol:medium \
     --reps 1 --structured
   ```
3. **Wave 0, pi-daddy arm.** The same, plus `--arm pi-daddy`.
4. **The four pass criteria, and how to check each.**
   - Provider and thinking level confirmed → Task 11's comparison.
   - Cost and latency recorded → `grep -A6 'metrics:' <run-dir>/results.yaml` shows non-null `input_tokens` and `subject_cost_usd`.
   - At least one ledger spawn event → `wc -l <run-dir>/pi-daddy.ledger.jsonl`. **Zero is a reportable outcome, not a pass:** the arm loaded but nothing delegated, so the comparison is vacuous.
   - A readable verdict delta → `node bin/skill-harness.js review review --skills ../principal-pi-skills`.
5. **What Wave 0 does not license.** Its verdict delta is `--reps 1` on one model and is **not a finding** — `lint` already reports `review/S6` and `review/S9` flipping run-to-run in this corpus. Wave 0 proves plumbing. Wave 1's scope is a separate decision.
6. **Reading a failure.** A cell reading `ERROR provider failure — …` is infrastructure, not the skill: fix the provider and re-run. This is the classification Tasks 1–3 added; before them the same outage produced 44 model FAILs shaped exactly like findings.
7. **Two deferred decisions**, with pointers to spec §10 (model pinning; and why a pin cannot live in a document `force` delivers) and §11 (purging the fireworks era; `results.yaml` is git-recoverable, the 8,383 transcripts are not).

- [ ] **Step 2: Verify every command in the doc is real**

For each command, either run it (the free ones) or confirm the flag exists in `node bin/skill-harness.js --help`. A runbook with a flag that does not exist is worse than no runbook.

- [ ] **Step 3: Commit**

```bash
git add docs/CODEX-ARMS-RUNBOOK.md
git commit -m "docs: add the Codex arms Wave 0 runbook"
```

---

## Task 13: Release hygiene

- [ ] **Step 1: Full suite and typecheck**

```bash
npx vitest run
npm run typecheck
```

Expected: all green. Test count should be 1,289 plus the ~25 added here.

- [ ] **Step 2: Prove the suite passes without `pi` on PATH**

CI has none, and a test that shells out passes locally and fails there.

```bash
env PATH="/usr/bin:/bin" npx vitest run 2>&1 | tail -5
```

- [ ] **Step 3: Confirm the bundle is current**

```bash
npm run build && npm run build:ext && git status --short packages/pi-extension/dist/
```

Expected: no diff. A diff means the bundle was committed stale.

- [ ] **Step 4: Update the handoff**

Add to `docs/NEXT-SESSION.md`: arms axis and provider-failure classification shipped; §10's force/frontmatter finding still open and unfixed; Wave 0 blocked on Codex re-auth; model pinning and the fireworks purge both deferred pending Wave 0.

- [ ] **Step 5: Commit and open the PR**

`gh pr edit` is broken on this repo — it prefetches classic Projects, exits 1, and writes nothing. Use `gh api -X PATCH`. And `gh` needs an account switch for PR writes, which reverts mid-session, so re-run it before every write.

```bash
gh auth switch -u mojomanyana
git push -u origin HEAD
gh pr create --title "feat: Codex subject axis and the pi-daddy arms axis" --body-file /tmp/pr-body.md
gh auth switch -u mojo-cosmic
```

---

## Self-Review

**Spec coverage:** §1 needs no work (nothing to build). §2 decisions are realised in Tasks 8–10. §3's deferrals are recorded in Task 12 step 7 and Task 13 step 4. §4 → Task 11. §5's mechanism → Tasks 5–8; its three refusals → Tasks 5–6; containment caveat → Task 10's `arms.yaml` comments; delivery proof → Task 10's `PI_GRANTS_LEDGER` and Task 12's criterion 3; the confound → Task 10's comment and Task 12 step 5. §6 force-only is a runbook choice, Task 12. §7 → Tasks 3–4. §7b → Tasks 1–3. §8 Wave 0 → Task 12. §9 testing constraints → Global Constraints plus a mutation step in every task. §10 and §11 carry no tasks by design, and are surfaced in Task 12/13. §12 → Task 12. §13's two README defects are explicitly out of scope in the spec and get no task.

**Placeholder scan:** Task 9 Step 1 and Task 12 Step 1 delegate to existing helpers and a prose outline rather than inlining full code. Both are deliberate and bounded: Task 9 must reuse `lint.test.ts`'s corpus helper rather than fork a second one (the instruction names the file to read), and Task 12 is a document whose content is enumerated point by point with its commands given verbatim elsewhere in the plan. No other step defers work.

**Type consistency checked:** `Arm` fields (`seedSkills`, `requireDefinitions`) are camelCase in TypeScript and snake_case in YAML — `loadArms` is the only translation point, and Task 6's test constructs `Arm` with the camelCase names. `runDirFor`'s fifth parameter is `armName?: string` everywhere. `StructuredRun.providerFailure` and `PiJsonRunResult.providerFailure` share a name deliberately; `RunReq.armEnv` and `RunOptions.arm` do not collide. `PROVIDER_FAILURE_MARKER` is imported from `@skill-harness/core` in adapters and by relative path inside core.
