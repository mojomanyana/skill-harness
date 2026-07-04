# skill-check v2 — Milestone 3: workspace sandboxing + `env:` + fan-out scheduler

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every scenario an isolated, disposable working directory (declared per-scenario via `env:`), and let a run fan out across scenarios through an opt-in bounded concurrency pool (`--parallel N`, default sequential).

**Architecture:** Two new pure-ish `@skill-check/core` modules — `scheduler.ts` (an order-preserving promise pool) and `workspace.ts` (`createWorkspace(kind) → {cwd, cleanup}`) — plus a `run.ts` refactor that turns each scenario into a task (create workspace → harness/seeded gates → judge → teardown) run through the pool. `seeded.ts` keeps its objective gates but delegates cwd creation to `workspace.ts`. CLI stays thin.

**Tech Stack:** TypeScript ESM (relative imports end in `.js`), node `fs`/`child_process` sync APIs, `js-yaml`, vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-04-skill-check-m3-workspace-scheduler-design.md`. Master roadmap: `docs/superpowers/specs/2026-07-03-skill-check-framework-design.md` (M3 row).

**Repo / branch:** `~/prepos/skill-check`, branch `framework-v2-m3` (already created; the M3 design doc is committed as `707081b`). Working tree otherwise clean; `main` has M1+M2 merged.

## Global Constraints

- `npm run build && npx vitest run` green at every commit (run from repo root). Current baseline: 79 tests.
- No new npm dependencies.
- ESM: every relative import ends in `.js`. Prefer the sync `node:fs` / `node:child_process` (`execFileSync`) APIs already used in the codebase.
- TDD: write the failing test first, watch it fail for the right reason, then implement.
- Parallelism is **opt-in**: `--parallel N` defaults to `N=1`, which must be byte-identical in behavior to today's sequential loop.
- Every scenario workspace is torn down (`cleanup()` in a `finally`), even on error.
- Backward compatible: existing seeded scenarios (with `mode: seeded` + `fixture:`) run unchanged with no `env:` edits; results.yaml / journal formats unchanged.
- One commit per task, message style `feat(core): …` / `feat(cli): …` matching git log.

## File Structure

| File | Responsibility after M3 |
|---|---|
| `packages/core/src/scheduler.ts` (new) | `runPool(tasks, concurrency)` — order-preserving bounded pool |
| `packages/core/src/workspace.ts` (new) | `WorkspaceKind`, `createWorkspace(kind, {specDir}) → {cwd, cleanup}` |
| `packages/core/src/spec.ts` | parse/validate optional `env:`; `Scenario.workspace: WorkspaceKind` (always populated) |
| `packages/core/src/seeded.ts` | delegates cwd creation to `workspace.ts`; keeps vitest / `diff_contains` gates |
| `packages/core/src/run.ts` | per-scenario task (workspace → produce → judge → teardown) via `runPool`; `concurrency` option; `cwd` option removed |
| `packages/core/src/index.ts` | export the two new modules |
| `packages/cli/src/cli.ts` | `--parallel N` on `run`; drop the neutral-cwd arg to `runSkillModel` |
| `README.md` | document `env:` + `--parallel` |

---

### Task 1: Scheduler — order-preserving bounded pool

**Files:**
- Create: `packages/core/src/scheduler.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/scheduler.test.ts` (new)

**Interfaces:**
- Consumes: nothing.
- Produces: `export function runPool<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]>` — runs at most `max(1, floor(concurrency))` task thunks at once, returns results in **input order**. A thunk that throws rejects the returned promise (fail-fast). Task 5 relies on this exact signature and ordering.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/scheduler.test.ts`:

```ts
import { describe, test, expect } from "vitest";
import { runPool } from "../src/scheduler.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("runPool", () => {
  test("returns results in input order despite out-of-order completion", async () => {
    const delays = [30, 5, 20, 1];
    const tasks = delays.map((d, i) => async () => { await sleep(d); return i; });
    expect(await runPool(tasks, 4)).toEqual([0, 1, 2, 3]);
  });

  test("never exceeds the concurrency ceiling", async () => {
    let inFlight = 0;
    let max = 0;
    const tasks = Array.from({ length: 10 }, () => async () => {
      inFlight++;
      max = Math.max(max, inFlight);
      await sleep(5);
      inFlight--;
      return 1;
    });
    await runPool(tasks, 3);
    expect(max).toBeLessThanOrEqual(3);
    expect(max).toBeGreaterThan(1); // actually parallelised
  });

  test("concurrency <= 1 runs strictly in sequence", async () => {
    const order: number[] = [];
    const tasks = [0, 1, 2].map((i) => async () => { order.push(i); await sleep(1); return i; });
    await runPool(tasks, 1);
    expect(order).toEqual([0, 1, 2]);
  });

  test("empty task list resolves to []", async () => {
    expect(await runPool([], 4)).toEqual([]);
  });

  test("a throwing task rejects runPool", async () => {
    const tasks = [async () => 1, async () => { throw new Error("boom"); }, async () => 3];
    await expect(runPool(tasks, 2)).rejects.toThrow("boom");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/core/test/scheduler.test.ts`
Expected: FAIL — `../src/scheduler.js` does not exist.

- [ ] **Step 3: Implement `scheduler.ts`**

Create `packages/core/src/scheduler.ts`:

```ts
/**
 * Run `tasks` with at most `concurrency` thunks in flight at once, returning
 * their results in input order (not completion order). `concurrency <= 1` runs
 * them strictly sequentially — identical to a plain for-await loop. A thunk that
 * throws rejects the returned promise (fail-fast); in-flight tasks are not
 * cancelled (JS has no cancellation), but no further tasks are started.
 */
export async function runPool<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results: T[] = new Array(tasks.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= tasks.length) return;
      results[i] = await tasks[i]();
    }
  }

  const workerCount = Math.min(limit, tasks.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
```

- [ ] **Step 4: Export from the barrel**

In `packages/core/src/index.ts`, add after the `./journal.js` line:

```ts
export * from "./scheduler.js";
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run packages/core/test/scheduler.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Build + full suite + commit**

Run: `npm run build && npx vitest run`
Expected: build green; full suite green.

```bash
git add packages/core/src/scheduler.ts packages/core/src/index.ts packages/core/test/scheduler.test.ts
git commit -m "feat(core): order-preserving bounded concurrency pool (runPool)"
```

---

### Task 2: Workspace adapter — isolated per-scenario cwd

**Files:**
- Create: `packages/core/src/workspace.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/workspace.test.ts` (new)

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export type WorkspaceKind = "none" | "empty-git" | { fixture: string };
  export interface Workspace { cwd: string; cleanup(): void; }
  export function createWorkspace(kind: WorkspaceKind, opts: { specDir: string }): Workspace;
  ```
  Tasks 3 (type), 4/5 (creation), and `seeded.ts` rely on these. `createWorkspace` throws `Error("fixture not found: <abs>")` for a missing fixture (and leaves no temp dir behind). `cleanup()` is idempotent.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/workspace.test.ts`:

```ts
import { describe, test, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkspace } from "../src/workspace.js";

const tmps: string[] = [];
function fixtureDir(): string {
  const d = mkdtempSync(join(tmpdir(), "sc-ws-fixture-"));
  tmps.push(d);
  return d;
}
afterEach(() => {
  while (tmps.length) rmSync(tmps.pop()!, { recursive: true, force: true });
});

describe("createWorkspace", () => {
  test("none: fresh empty dir, no git", () => {
    const ws = createWorkspace("none", { specDir: "/nonexistent" });
    tmps.push(ws.cwd);
    expect(existsSync(ws.cwd)).toBe(true);
    expect(existsSync(join(ws.cwd, ".git"))).toBe(false);
  });

  test("empty-git: dir with an initialised git repo", () => {
    const ws = createWorkspace("empty-git", { specDir: "/nonexistent" });
    tmps.push(ws.cwd);
    expect(existsSync(join(ws.cwd, ".git"))).toBe(true);
  });

  test("fixture: copies fixture files and initialises git", () => {
    const src = fixtureDir();
    writeFileSync(join(src, "hello.txt"), "hi", "utf8");
    const ws = createWorkspace({ fixture: src }, { specDir: "/nonexistent" });
    tmps.push(ws.cwd);
    expect(existsSync(join(ws.cwd, "hello.txt"))).toBe(true);
    expect(existsSync(join(ws.cwd, ".git"))).toBe(true);
  });

  test("fixture: resolves a relative path against specDir", () => {
    const base = fixtureDir();
    mkdirSync(join(base, "fixtures", "f1"), { recursive: true });
    writeFileSync(join(base, "fixtures", "f1", "a.txt"), "x", "utf8");
    const ws = createWorkspace({ fixture: "fixtures/f1" }, { specDir: base });
    tmps.push(ws.cwd);
    expect(existsSync(join(ws.cwd, "a.txt"))).toBe(true);
  });

  test("cleanup removes the dir and is safe to call twice", () => {
    const ws = createWorkspace("none", { specDir: "/nonexistent" });
    ws.cleanup();
    expect(existsSync(ws.cwd)).toBe(false);
    expect(() => ws.cleanup()).not.toThrow();
  });

  test("missing fixture throws and leaves no temp dir", () => {
    expect(() => createWorkspace({ fixture: "/nope/does-not-exist" }, { specDir: "/nonexistent" }))
      .toThrow(/fixture not found/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/core/test/workspace.test.ts`
Expected: FAIL — `../src/workspace.js` does not exist.

- [ ] **Step 3: Implement `workspace.ts`**

Create `packages/core/src/workspace.ts`:

```ts
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

/** How a scenario's working directory is prepared. */
export type WorkspaceKind = "none" | "empty-git" | { fixture: string };

export interface Workspace {
  cwd: string; // absolute path to the isolated temp dir
  cleanup(): void; // remove the temp dir; idempotent, always safe to call
}

/** git init + a baseline commit, so a later `git diff --cached` shows only edits. */
function gitBaseline(cwd: string): void {
  execFileSync("git", ["init", "-q"], { cwd });
  execFileSync("git", ["add", "-A"], { cwd });
  execFileSync(
    "git",
    ["-c", "user.email=sc@local", "-c", "user.name=skill-check", "commit", "-q", "--allow-empty", "-m", "baseline"],
    { cwd }
  );
}

/**
 * Create an isolated temp-dir working directory for one scenario. `none` is an
 * empty dir (no git); `empty-git` initialises a clean repo; `{ fixture }` copies
 * the fixture (relative paths resolve against `specDir`) then initialises a repo
 * with a baseline commit. Child processes run here, never in the user's home.
 */
export function createWorkspace(kind: WorkspaceKind, opts: { specDir: string }): Workspace {
  const cwd = mkdtempSync(join(tmpdir(), "sc-ws-"));
  const cleanup = () => rmSync(cwd, { recursive: true, force: true });
  try {
    if (kind === "none") {
      // empty isolated dir; nothing to set up
    } else if (kind === "empty-git") {
      gitBaseline(cwd);
    } else {
      const src = isAbsolute(kind.fixture) ? kind.fixture : resolve(opts.specDir, kind.fixture);
      if (!existsSync(src)) throw new Error(`fixture not found: ${src}`);
      cpSync(src, cwd, { recursive: true });
      gitBaseline(cwd);
    }
  } catch (e) {
    cleanup(); // never leak a temp dir on a setup failure
    throw e;
  }
  return { cwd, cleanup };
}
```

- [ ] **Step 4: Export from the barrel**

In `packages/core/src/index.ts`, add after the `./scheduler.js` line (from Task 1):

```ts
export * from "./workspace.js";
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run packages/core/test/workspace.test.ts`
Expected: PASS (6 tests). (Requires `git` on PATH — it is, in this environment.)

- [ ] **Step 6: Build + full suite + commit**

Run: `npm run build && npx vitest run`
Expected: green.

```bash
git add packages/core/src/workspace.ts packages/core/src/index.ts packages/core/test/workspace.test.ts
git commit -m "feat(core): createWorkspace — isolated per-scenario cwd (none/empty-git/fixture)"
```

---

### Task 3: Parse and default `env:` in the spec

**Files:**
- Modify: `packages/core/src/spec.ts`
- Test: `packages/core/test/spec.test.ts` (extend)

**Interfaces:**
- Consumes: `WorkspaceKind` from `workspace.js` (Task 2).
- Produces: `Scenario` gains a required, always-populated `workspace: WorkspaceKind`. Default `"none"`; a `mode: seeded` scenario with a `fixture:` and no explicit `env:` resolves to `{ fixture: <that fixture> }`. Task 4/5 read `scenario.workspace` directly and never re-derive the default.

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/spec.test.ts`, add a describe block (import `parseSpec` is already imported there; check the top of the file and reuse it):

```ts
describe("env: workspace parsing", () => {
  const base = (extra: string) => `
skill: demo
judge_persona: a judge.
ship_bar: { total: 1, min_pass: 1 }
scenarios:
  - id: A1
    title: t
    turns: ["hi"]
    checklist: ["ok"]
${extra}`;

  test("defaults to none when env is absent", () => {
    const spec = parseSpec(base(""), "spec.yaml");
    expect(spec.scenarios[0].workspace).toBe("none");
  });

  test("parses workspace: empty-git", () => {
    const spec = parseSpec(base("    env: { workspace: empty-git }\n"), "spec.yaml");
    expect(spec.scenarios[0].workspace).toBe("empty-git");
  });

  test("parses workspace: fixture:<path> into a fixture ref", () => {
    const spec = parseSpec(base("    env: { workspace: fixture:fixtures/x }\n"), "spec.yaml");
    expect(spec.scenarios[0].workspace).toEqual({ fixture: "fixtures/x" });
  });

  test("a seeded scenario with a fixture defaults its workspace to that fixture", () => {
    const text = `
skill: demo
judge_persona: a judge.
ship_bar: { total: 1, min_pass: 1 }
scenarios:
  - id: S1
    title: seeded
    mode: seeded
    fixture: fixtures/seed1
    turns: ["edit it"]
    checklist: ["edited"]
`;
    const spec = parseSpec(text, "spec.yaml");
    expect(spec.scenarios[0].workspace).toEqual({ fixture: "fixtures/seed1" });
  });

  test("rejects an unknown workspace value", () => {
    expect(() => parseSpec(base("    env: { workspace: banana }\n"), "spec.yaml"))
      .toThrow(/env\.workspace must be/);
  });

  test("rejects an empty fixture path", () => {
    expect(() => parseSpec(base("    env: { workspace: 'fixture:' }\n"), "spec.yaml"))
      .toThrow(/fixture path is empty/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/core/test/spec.test.ts`
Expected: FAIL — `workspace` is `undefined` on the parsed scenario; the two error-case tests don't throw.

- [ ] **Step 3: Implement in `spec.ts`**

Add the import at the top of `packages/core/src/spec.ts` (after the `js-yaml` import):

```ts
import type { WorkspaceKind } from "./workspace.js";
```

Add `workspace` to the `Scenario` interface (after `fixture?` / `assert?`):

```ts
export interface Scenario {
  id: string;
  title: string;
  critical: boolean;
  mode: ScenarioMode;
  turns: string[];
  checklist: string[];
  fixture?: string;
  assert?: SeededAssert;
  workspace: WorkspaceKind; // isolated-cwd kind; always populated (default "none")
}
```

Add a resolver function (place it near `assertStringList`, before `parseSpec`):

```ts
/** Resolve a scenario's `env.workspace` into a WorkspaceKind, applying defaults. */
function resolveWorkspace(
  env: unknown,
  mode: ScenarioMode,
  fixture: string | undefined,
  id: string,
  file: string
): WorkspaceKind {
  const raw = env && typeof env === "object" ? (env as Record<string, unknown>).workspace : undefined;
  if (raw === undefined) {
    // Default: a seeded scenario runs in its fixture repo; everything else is bare.
    if (mode === "seeded" && fixture) return { fixture };
    return "none";
  }
  if (raw === "none" || raw === "empty-git") return raw;
  if (typeof raw === "string" && raw.startsWith("fixture:")) {
    const p = raw.slice("fixture:".length).trim();
    if (!p) throw new SpecError(`scenario \`${id}\` env.workspace fixture path is empty`, file);
    return { fixture: p };
  }
  throw new SpecError(`scenario \`${id}\` env.workspace must be none | empty-git | fixture:<path>`, file);
}
```

Populate it in `parseSpec`. The scenario object is built as `const scenario: Scenario = { … }`; the seeded branch sets `scenario.fixture` **after** that literal, so compute `workspace` at the end of the per-scenario map, just before `return scenario;`:

```ts
    scenario.workspace = resolveWorkspace(s.env, mode, scenario.fixture, id, file);

    return scenario;
```

(The `Scenario` literal now needs `workspace` to satisfy the type at construction. Give it a placeholder in the literal and overwrite it: add `workspace: "none",` to the object literal fields, then the line above reassigns it once `scenario.fixture` is known.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/core/test/spec.test.ts`
Expected: PASS (existing + 6 new).

- [ ] **Step 5: Build + full suite + commit**

Run: `npm run build && npx vitest run`
Expected: green. (`runSkillModel`/report build against the new required field — the field is populated by the parser, and no consumer reads it yet.)

```bash
git add packages/core/src/spec.ts packages/core/test/spec.test.ts
git commit -m "feat(core): parse per-scenario env.workspace (none/empty-git/fixture; seeded defaults to its fixture)"
```

---

### Task 4: Route scenarios through workspaces; seeded delegates cwd creation

Wire `createWorkspace` into `run.ts` (still sequential) and refactor `seeded.ts` to run in a workspace prepared by the caller. This keeps the build green because the seeded signature change and its only caller (`run.ts`) change together.

**Files:**
- Modify: `packages/core/src/seeded.ts`
- Modify: `packages/core/src/run.ts`
- Test: `packages/core/test/seeded.test.ts` (new), `packages/core/test/golden-run.test.ts` (adjust)

**Interfaces:**
- Consumes: `createWorkspace` (Task 2), `Scenario.workspace` (Task 3).
- Produces:
  - `seeded.ts`: `runSeeded(scenario: Scenario, opts: { skillDir: string; adapter: HarnessAdapter; model: ModelRef; mode: RunMode; cwd: string }) => Promise<SeededOutcome>` — `cwd` is a workspace already prepared for the scenario (fixture copied + git baseline). No longer creates its own temp dir or resolves fixtures.
  - `run.ts`: `RunOptions` loses `cwd`; each scenario runs in its own workspace. Task 5 relies on the per-scenario `runScenario` helper introduced here.

- [ ] **Step 1: Write the failing seeded test**

Create `packages/core/test/seeded.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { rmSync, writeFileSync, readFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkspace } from "../src/workspace.js";
import { runSeeded } from "../src/seeded.js";
import type { Scenario } from "../src/spec.js";
import type { HarnessAdapter, RunReq } from "../src/adapters/types.js";

const tmps: string[] = [];
afterEach(() => { while (tmps.length) rmSync(tmps.pop()!, { recursive: true, force: true }); });

// Fake harness that actually edits the repo it's given, so gates have something to see.
function editingAdapter(line: string): HarnessAdapter {
  return {
    name: "pi",
    available: async () => true,
    run: async (req: RunReq) => {
      writeFileSync(join(req.cwd, "out.txt"), line, "utf8");
      return `<<< ASSISTANT: wrote ${line}`;
    },
    judge: async () => "VERDICT: PASS\nREASON: ok",
  };
}

const seededScenario = (needle: string): Scenario => ({
  id: "S1", title: "seeded", critical: false, mode: "seeded",
  turns: ["edit it"], checklist: ["edited"],
  fixture: "unused-here", assert: { diff_contains: [needle] },
  workspace: "none", // not read by runSeeded; run.ts owns workspace creation
});

describe("runSeeded (workspace prepared by caller)", () => {
  it("passes the diff_contains gate when the harness makes the expected edit", async () => {
    const fixture = mkdtempSync(join(tmpdir(), "sc-seed-src-")); tmps.push(fixture);
    writeFileSync(join(fixture, "seed.txt"), "seed", "utf8");
    const ws = createWorkspace({ fixture }, { specDir: "/x" }); tmps.push(ws.cwd);

    const r = await runSeeded(seededScenario("MARKER"), {
      skillDir: "/x", adapter: editingAdapter("MARKER"),
      model: { provider: "fireworks", model: "fake" }, mode: "green", cwd: ws.cwd,
    });

    expect(r.gateFailure).toBeNull();
    expect(r.transcript).toContain("diff_contains");
    expect(existsSync(join(ws.cwd, "out.txt"))).toBe(true);
  });

  it("fails the gate when the expected content is absent from the diff", async () => {
    const fixture = mkdtempSync(join(tmpdir(), "sc-seed-src-")); tmps.push(fixture);
    writeFileSync(join(fixture, "seed.txt"), "seed", "utf8");
    const ws = createWorkspace({ fixture }, { specDir: "/x" }); tmps.push(ws.cwd);

    const r = await runSeeded(seededScenario("MARKER"), {
      skillDir: "/x", adapter: editingAdapter("something else"),
      model: { provider: "fireworks", model: "fake" }, mode: "green", cwd: ws.cwd,
    });

    expect(r.gateFailure).toMatch(/MARKER/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/core/test/seeded.test.ts`
Expected: FAIL — `runSeeded`'s current signature takes `specPath`/creates its own repo; the new `cwd`-based call shape doesn't type-check / doesn't behave.

- [ ] **Step 3: Refactor `seeded.ts`**

Replace the `SeededOpts` interface and the top of `runSeeded` in `packages/core/src/seeded.ts`. New file body (imports trimmed — `cpSync`, `mkdtempSync`, `tmpdir`, `dirname`, `isAbsolute`, `resolve` are no longer needed; keep `existsSync` only if used elsewhere — it isn't after this, so drop it):

```ts
import { join } from "node:path";
import type { Scenario } from "./spec.js";
import type { HarnessAdapter, ModelRef, RunMode } from "./adapters/types.js";
import { exec } from "./util/exec.js";

interface SeededOpts {
  skillDir: string;
  adapter: HarnessAdapter;
  model: ModelRef;
  mode: RunMode;
  cwd: string; // a workspace already prepared for this scenario (fixture + git baseline)
}

export interface SeededOutcome {
  transcript: string; // harness output + appended gate report
  gateFailure: string | null; // non-null => objective gate failed (auto-FAIL, skip judge)
}

const VITEST_TIMEOUT_MS = Number(process.env.SKILL_CHECK_VITEST_TIMEOUT_MS ?? 120_000);

/**
 * Run a seeded scenario inside a caller-prepared workspace: let the harness edit
 * the repo, then evaluate objective gates (staged-diff contains + optional vitest
 * pass). A failed gate short-circuits to an auto-FAIL. Workspace creation (fixture
 * copy + git baseline) and teardown are the caller's responsibility (run.ts).
 */
export async function runSeeded(scenario: Scenario, opts: SeededOpts): Promise<SeededOutcome> {
  const repo = opts.cwd;

  const harnessOut = await opts.adapter.run({
    skillDir: opts.skillDir,
    model: opts.model,
    mode: opts.mode,
    turns: scenario.turns,
    cwd: repo,
  });

  await git(repo, ["add", "-A"]);
  const diff = (await git(repo, ["diff", "--cached"])).stdout;

  const parts: string[] = [harnessOut, "", "=== SEEDED GATES ==="];
  let gateFailure: string | null = null;

  const wantDiff = scenario.assert?.diff_contains ?? [];
  for (const needle of wantDiff) {
    const ok = diff.includes(needle);
    parts.push(`  diff_contains ${JSON.stringify(needle)}: ${ok ? "OK" : "MISSING"}`);
    if (!ok && !gateFailure) gateFailure = `staged diff missing ${JSON.stringify(needle)}`;
  }

  if (scenario.assert?.vitest) {
    const v = await exec("npx", ["vitest", "run"], { cwd: repo, timeoutMs: VITEST_TIMEOUT_MS });
    const passed = v.code === 0;
    parts.push(`  vitest run: ${passed ? "PASS" : `FAIL (exit ${v.code})`}`);
    parts.push(indent(v.stdout.trim() || v.stderr.trim()));
    if (!passed && !gateFailure) gateFailure = `vitest failed (exit ${v.code})`;
  }

  return { transcript: parts.join("\n"), gateFailure };
}

function git(cwd: string, args: string[]) {
  return exec("git", args, { cwd, timeoutMs: 30_000 });
}

function indent(s: string): string {
  return s.split("\n").map((l) => `    ${l}`).join("\n");
}
```

(The baseline commit and fixture copy now live in `createWorkspace`; a missing fixture now throws there and is handled by `run.ts`.)

- [ ] **Step 4: Run the seeded test**

Run: `npx vitest run packages/core/test/seeded.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Refactor `run.ts` to create a workspace per scenario (still sequential)**

In `packages/core/src/run.ts`:

Update imports:

```ts
import { createWorkspace } from "./workspace.js";
```

Remove `cwd` from `RunOptions` (delete the `cwd: string;` line and its comment).

Replace the scenario loop body and `produceTranscript` so each scenario gets its own workspace, and the judge runs in it. Replace the whole `for (const scenario of spec.scenarios) { … }` block with a call to a new `runScenario` helper, and gather results:

```ts
  const scenarioResults: ScenarioResult[] = [];
  for (const scenario of spec.scenarios) {
    scenarioResults.push(await runScenario(scenario, { ...opts, runDir, now, log }));
  }
```

Add the `runScenario` helper (replaces the old inline body + `produceTranscript`). Place it after `runSkillModel`:

```ts
interface ScenarioCtx {
  runDir: string;
  now: () => string;
  log: (msg: string) => void;
}

/** Run one scenario end-to-end in its own isolated workspace. */
async function runScenario(scenario: Scenario, ctx: RunOptions & ScenarioCtx): Promise<ScenarioResult> {
  const { spec, judge, mode, runDir, now, log } = ctx;
  log(`  ${scenario.id} (${scenario.title}) …`);
  appendJournal(runDir, { event: "scenario-started", ts: now(), id: scenario.id, title: scenario.title });

  let ws: { cwd: string; cleanup(): void } | null = null;
  let transcript: string;
  let gatePrefix: string | null = null;
  try {
    try {
      ws = createWorkspace(scenario.workspace, { specDir: dirname(ctx.specPath) });
    } catch (e) {
      // A setup failure (e.g. missing fixture) is an objective FAIL, not an infra abort.
      gatePrefix = e instanceof Error ? e.message : String(e);
      transcript = `[workspace setup failed] ${gatePrefix}`;
    }
    if (ws) {
      if (scenario.mode === "seeded") {
        const r = await runSeeded(scenario, {
          skillDir: ctx.skillDir, adapter: ctx.adapter, model: ctx.model, mode, cwd: ws.cwd,
        });
        transcript = r.transcript;
        gatePrefix = r.gateFailure;
      } else {
        transcript = await ctx.adapter.run({
          skillDir: ctx.skillDir, model: ctx.model, mode, turns: scenario.turns, cwd: ws.cwd,
        });
      }
    }

    writeFileSync(transcriptPath(runDir, scenario.id, mode), transcript!, "utf8");
    if (scenario.mode === "seeded") {
      appendJournal(runDir, { event: "gate-result", ts: now(), id: scenario.id, ok: !gatePrefix, detail: gatePrefix ?? "" });
    }

    let judge_verdict: ScenarioResult["judge_verdict"];
    let judge_reason: string;
    let suspect = false;
    if (gatePrefix) {
      judge_verdict = "FAIL";
      judge_reason = gatePrefix;
    } else {
      const prompt = buildJudgePrompt({ skill: spec.skill, persona: spec.judge_persona, scenario, transcript: transcript! });
      const g = await gradeTranscript(ctx.adapter, judge, prompt, ws!.cwd);
      judge_verdict = g.verdict;
      judge_reason = g.reason;
      suspect = g.suspect;
    }

    log(`  → ${scenario.id} ${judge_verdict}${judge_reason ? `: ${judge_reason}` : ""}${suspect ? "  ⚠ suspect misfire" : ""}`);
    appendJournal(runDir, { event: "judge-verdict", ts: now(), id: scenario.id, verdict: judge_verdict, reason: judge_reason, suspect });
    if (suspect) {
      appendJournal(runDir, { event: "misfire-flag", ts: now(), id: scenario.id, reason: judge_reason });
    }
    return { id: scenario.id, judge_verdict, judge_reason, suspect, override: null, note: "" };
  } finally {
    ws?.cleanup();
  }
}
```

Notes for the implementer:
- Do **not** add any extra progress/event hooks beyond the `appendJournal` calls shown.
- `dirname` is already imported in `run.ts` (from `node:path`). `RunOptions` still carries `specPath`.
- Delete the now-unused `produceTranscript` function and its import usage. `runSeeded` is still imported.
- The judge now runs in `ws.cwd` (the scenario workspace), replacing the old `cwd` option.

- [ ] **Step 6: Update the golden test (drop `cwd`)**

In `packages/core/test/golden-run.test.ts`, remove the `cwd: skillDir,` (and `cwd: skillDir` in the second test) lines from the `runSkillModel({ … })` calls — the option no longer exists. Nothing else in the golden test changes; the fake adapter ignores cwd.

- [ ] **Step 7: Build + full suite**

Run: `npm run build && npx vitest run`
Expected: green — golden run still produces the same results.yaml (workspaces are created and torn down transparently; `none` default for the greeting scenarios).

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/seeded.ts packages/core/src/run.ts packages/core/test/seeded.test.ts packages/core/test/golden-run.test.ts
git commit -m "feat(core): run each scenario in an isolated workspace; seeded delegates cwd creation"
```

---

### Task 5: Fan out scenarios through the scheduler

Turn the sequential scenario loop into tasks run via `runPool`, gated by an opt-in `concurrency`.

**Files:**
- Modify: `packages/core/src/run.ts`
- Test: `packages/core/test/golden-run.test.ts` (extend)

**Interfaces:**
- Consumes: `runPool` (Task 1), `runScenario` (Task 4).
- Produces: `RunOptions` gains `concurrency?: number` (default `1`). Task 6 (CLI) passes it.

- [ ] **Step 1: Write the failing determinism test**

In `packages/core/test/golden-run.test.ts`, add a test (the `fakeAdapter`, `FIXTURE`, imports already exist; add `readdirSync` to the `node:fs` import and `runDirFor` isn't needed — reuse the returned `runDir`):

```ts
it("--parallel N produces the same results.yaml as sequential, and cleans up workspaces", async () => {
  const run = async (concurrency: number, ts: string) => {
    const skillDir = mkdtempSync(join(tmpdir(), "sc-golden-par-"));
    cpSync(FIXTURE, skillDir, { recursive: true });
    const specPath = join(skillDir, "tests", "specification.yaml");
    const spec = parseSpec(readFileSync(specPath, "utf8"), specPath);
    const { runDir } = await runSkillModel({
      spec, skillDir, specPath, adapter: fakeAdapter,
      model: { provider: "fireworks", model: "fake-model" },
      modelToken: "fireworks:fake-model",
      judge: { provider: "claude-code", model: "opus" },
      mode: "green", timestamp: ts, now: () => "2026-07-04T00:00:00.000Z",
      concurrency,
    });
    return readFileSync(join(runDir, "results.yaml"), "utf8");
  };
  const seq = await run(1, "2026-07-04T00-00-00-010Z");
  const par = await run(2, "2026-07-04T00-00-00-011Z");
  // Byte-identical except the timestamp line (distinct run dirs).
  const strip = (s: string) => s.replace(/timestamp:.*/g, "timestamp: X");
  expect(strip(par)).toBe(strip(seq));

  // No sc-ws-* workspace temp dirs survive.
  const leaked = readdirSync(tmpdir()).filter((n) => n.startsWith("sc-ws-"));
  expect(leaked).toEqual([]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/core/test/golden-run.test.ts`
Expected: FAIL — `concurrency` is not accepted / has no effect (the test still passes on determinism but may fail the type-check for the unknown option; if it type-errors, that's the expected red).

- [ ] **Step 3: Implement the pool in `run.ts`**

Add the import:

```ts
import { runPool } from "./scheduler.js";
```

Add to `RunOptions`:

```ts
  concurrency?: number; // scenarios in flight at once; default 1 (sequential)
```

Replace the sequential gather from Task 4:

```ts
  const scenarioResults: ScenarioResult[] = [];
  for (const scenario of spec.scenarios) {
    scenarioResults.push(await runScenario(scenario, { ...opts, runDir, now, log }));
  }
```

with the pooled version:

```ts
  const tasks = spec.scenarios.map(
    (scenario) => () => runScenario(scenario, { ...opts, runDir, now, log })
  );
  const scenarioResults = await runPool(tasks, opts.concurrency ?? 1);
```

`runPool` preserves input order, so `scenarioResults` stays in spec order and scoring/persistence are unchanged.

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/core/test/golden-run.test.ts`
Expected: PASS — sequential and `--parallel 2` produce identical results.yaml; no workspace temp dirs leak.

- [ ] **Step 5: Build + full suite + commit**

Run: `npm run build && npx vitest run`
Expected: green.

```bash
git add packages/core/src/run.ts packages/core/test/golden-run.test.ts
git commit -m "feat(core): fan out scenarios through runPool (opt-in concurrency)"
```

---

### Task 6: CLI `--parallel` + docs

**Files:**
- Modify: `packages/cli/src/cli.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `RunOptions.concurrency` (Task 5).
- Produces: `skill-check run … --parallel N`.

- [ ] **Step 1: Wire `--parallel` in `cmdRun`**

In `packages/cli/src/cli.ts` `cmdRun`, after the `label` line add:

```ts
  const parallel = Math.max(1, Number(flagStr(args, "parallel", "1")) || 1);
```

In the `runSkillModel({ … })` call, **remove** `cwd: NEUTRAL_CWD,` (the option no longer exists) and add:

```ts
        concurrency: parallel,
```

(Leave `NEUTRAL_CWD` defined — `cmdGrade` still uses it for the re-judge cwd.)

- [ ] **Step 2: Update HELP**

In the `HELP` string, change the `run` usage line to include `--parallel`:

```
  run    <skill|all> --skills <root> [--model prov:model ...] [--models file]
                     [--mode red|green|force] [--judge prov:model] [--harness pi] [--label name] [--parallel N]
```

- [ ] **Step 3: Behavioral smoke**

Run:
```bash
npm run build
node bin/skill-check.js help    # shows --parallel
```
Expected: help text lists `--parallel N`.

- [ ] **Step 4: README**

In `README.md`, in the `run` section, add two short notes in the repo's existing tone:
- `--parallel N` runs up to N scenarios (and their judges) concurrently; default is 1 (sequential). Use it to speed up large skills; keep it modest to respect provider rate limits.
- Scenarios can declare their workspace with `env: { workspace: none | empty-git | fixture:<path> }` (default `none` — a fresh isolated temp dir; `empty-git` for git scenarios; `fixture:<path>` copies a fixture + inits git). Each scenario runs in its own throwaway dir and never touches your home directory. Seeded scenarios use their `fixture:` automatically.

- [ ] **Step 5: Full build + suite + commit**

Run: `npm run build && npx vitest run`
Expected: green.

```bash
git add packages/cli/src/cli.ts README.md
git commit -m "feat(cli): --parallel N for concurrent scenario runs; document env: + --parallel"
```

---

## Self-review (done at plan time)

- **Spec coverage:** scheduler ✓ (Task 1), workspace adapter incl. none/empty-git/fixture + teardown + missing-fixture ✓ (Task 2), `env:` parse/default/seeded-sugar/validation ✓ (Task 3), seeded delegates cwd + run.ts per-scenario workspace + judge-in-workspace + cleanup-in-finally ✓ (Task 4), opt-in `--parallel`/`concurrency` default-1 + determinism + no-leak ✓ (Tasks 5–6), backward compat (default sequential, seeded unchanged) ✓, non-goals (per-provider caps, watch, top-level fan-out) untouched ✓. Also closes the M2-deferred seeded `gate-result` coverage gap (Task 4's seeded test + the golden run exercising workspaces).
- **Type consistency:** `WorkspaceKind` defined in `workspace.ts`, imported as a type by `spec.ts` (Task 3) and used by `run.ts`/`seeded.ts` callers; `createWorkspace(kind, {specDir}) → {cwd, cleanup}` used identically in Task 4; `runPool(tasks, concurrency)` from Task 1 used in Task 5; `runSeeded(scenario, {skillDir, adapter, model, mode, cwd})` defined in Task 4 and called by `run.ts` in the same task; `RunOptions.cwd` removed in Task 4 and all call sites (golden test Task 4 step 6, CLI Task 6 step 1) updated; `RunOptions.concurrency` added Task 5, passed Task 6.
- **Placeholder scan:** none.
