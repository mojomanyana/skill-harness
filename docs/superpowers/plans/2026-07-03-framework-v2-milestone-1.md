# skill-check v2 — Milestone 1: workspace restructure (core / adapters / cli)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure skill-check into an npm-workspaces monorepo (`packages/core`, `packages/adapters`, `packages/cli`) with zero behavior change, locked by an injected-adapter golden test, and land the claude-cli judge routing as a tested, committed feature.

**Architecture:** Pure library `@skill-check/core` (pipeline: spec → discover → run → grade → score → results, plus seeded gates and report rendering); `@skill-check/adapters` (pi harness + claude-cli judge routing); `@skill-check/cli` (command surface + review-UI server). Root `bin/skill-check.js` launcher keeps working in both built and tsx-dev modes.

**Tech Stack:** Node ≥20, TypeScript 5.6 (NodeNext ESM), npm workspaces, vitest 2, js-yaml. No new runtime dependencies.

**Repo / branch:** `~/prepos/skill-check`, branch `framework-v2`. The working tree has an intentional uncommitted change in `src/adapters/pi.ts` (claude-cli judge routing) — it is preserved by `git mv` and committed in Task 4. Do not discard it.

**Spec:** `docs/superpowers/specs/2026-07-03-skill-check-framework-design.md` (Milestone 1 of 7; later milestones — results v2 + journal, sandbox workspaces, misfire detector + reps, UI, pi-extension, CI action — get their own plans).

## Global Constraints

- Zero CLI behavior change in this milestone: `skill-check list|run|grade|review|add-test` produce identical output/files before and after.
- ESM throughout (`"type": "module"`, NodeNext); intra-package imports keep `.js` extensions.
- Node engines `>=20`; only dependency `js-yaml` (runtime), dev deps unchanged.
- Every task ends green: `npm run build && npm test` at repo root.
- Package names: `@skill-check/core`, `@skill-check/adapters`, `@skill-check/cli`.

---

### Task 1: Workspace scaffolding (no file moves yet)

**Files:**
- Modify: `package.json` (root)
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`
- Create: `packages/adapters/package.json`, `packages/adapters/tsconfig.json`
- Create: `packages/cli/package.json`, `packages/cli/tsconfig.json`
- Create: `tsconfig.base.json`, `vitest.workspace.ts`
- Modify: `tsconfig.json` (root — becomes a solution file)

**Interfaces:**
- Consumes: nothing.
- Produces: workspace layout + `npm run build` (tsc project references, `tsc -b`) and `npm test` (vitest workspace) that Tasks 2–6 rely on. Packages are empty placeholders (`src/index.ts` exporting `{}`) until Task 2 moves code in.

- [ ] **Step 1: Root package.json — declare workspaces, keep bin**

Replace root `package.json` scripts/deps sections with (name/version/license/bin/engines unchanged):

```json
{
    "name": "skill-check",
    "version": "0.0.2",
    "description": "Portable test/optimize framework for agent skills: spec'd scenarios, LLM judge, review UI. Monorepo: core, adapters, cli.",
    "license": "MIT",
    "type": "module",
    "private": true,
    "bin": { "skill-check": "./bin/skill-check.js" },
    "workspaces": ["packages/*"],
    "scripts": {
        "build": "tsc -b packages/core packages/adapters packages/cli",
        "dev": "tsx packages/cli/src/cli.ts",
        "test": "vitest run",
        "typecheck": "tsc -b packages/core packages/adapters packages/cli --noEmit"
    },
    "engines": { "node": ">=20" },
    "devDependencies": {
        "@types/js-yaml": "^4.0.9",
        "@types/node": "^22.0.0",
        "tsx": "^4.19.0",
        "typescript": "^5.6.0",
        "vitest": "^2.1.0"
    }
}
```

(`js-yaml` moves to `packages/core`'s dependencies in Step 2. Root becomes `private`; publishing is per-package later.)

- [ ] **Step 2: Package manifests**

`packages/core/package.json`:
```json
{
    "name": "@skill-check/core",
    "version": "0.0.2",
    "type": "module",
    "license": "MIT",
    "main": "./dist/index.js",
    "types": "./dist/index.d.ts",
    "exports": { ".": "./dist/index.js" },
    "dependencies": { "js-yaml": "^4.1.0" }
}
```

`packages/adapters/package.json`:
```json
{
    "name": "@skill-check/adapters",
    "version": "0.0.2",
    "type": "module",
    "license": "MIT",
    "main": "./dist/index.js",
    "types": "./dist/index.d.ts",
    "exports": { ".": "./dist/index.js" },
    "dependencies": { "@skill-check/core": "0.0.2" }
}
```

`packages/cli/package.json`:
```json
{
    "name": "@skill-check/cli",
    "version": "0.0.2",
    "type": "module",
    "license": "MIT",
    "main": "./dist/cli.js",
    "exports": { ".": "./dist/cli.js" },
    "dependencies": {
        "@skill-check/core": "0.0.2",
        "@skill-check/adapters": "0.0.2"
    }
}
```

- [ ] **Step 3: TS project references**

`tsconfig.base.json` (root):
```json
{
    "compilerOptions": {
        "target": "ES2022",
        "module": "NodeNext",
        "moduleResolution": "NodeNext",
        "strict": true,
        "esModuleInterop": true,
        "skipLibCheck": true,
        "sourceMap": true,
        "resolveJsonModule": true,
        "composite": true,
        "declaration": true
    }
}
```

`packages/core/tsconfig.json`:
```json
{
    "extends": "../../tsconfig.base.json",
    "compilerOptions": { "outDir": "dist", "rootDir": "src" },
    "include": ["src"]
}
```

`packages/adapters/tsconfig.json`:
```json
{
    "extends": "../../tsconfig.base.json",
    "compilerOptions": { "outDir": "dist", "rootDir": "src" },
    "include": ["src"],
    "references": [{ "path": "../core" }]
}
```

`packages/cli/tsconfig.json`:
```json
{
    "extends": "../../tsconfig.base.json",
    "compilerOptions": { "outDir": "dist", "rootDir": "src" },
    "include": ["src"],
    "references": [{ "path": "../core" }, { "path": "../adapters" }]
}
```

Root `tsconfig.json` becomes:
```json
{
    "files": [],
    "references": [
        { "path": "packages/core" },
        { "path": "packages/adapters" },
        { "path": "packages/cli" }
    ]
}
```

`vitest.workspace.ts` (root):
```ts
export default ["packages/*"];
```

- [ ] **Step 4: Placeholder sources so the empty workspace builds**

Create `packages/core/src/index.ts`, `packages/adapters/src/index.ts`, `packages/cli/src/cli.ts` each containing:
```ts
export {};
```

- [ ] **Step 5: Install + build + old tests still run**

Run: `cd ~/prepos/skill-check && npm install && npm run build`
Expected: tsc builds 3 packages, exit 0. (`src/` is untouched and no longer built — that's fine; it still typechecks under tsx for the launcher fallback.)

Run: `npx vitest run test`
Expected: the 7 existing suites in `test/` still PASS (they import from `src/`, untouched).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.base.json vitest.workspace.ts packages
git commit -m "chore(workspace): npm-workspaces scaffolding (core/adapters/cli), src untouched"
```

---

### Task 2: Move the engine into `@skill-check/core`

**Files:**
- Move (git mv, preserving history): `src/spec.ts src/discover.ts src/run.ts src/grade.ts src/score.ts src/results.ts src/seeded.ts src/report.ts` → `packages/core/src/`
- Move: `src/adapters/types.ts` → `packages/core/src/adapters/types.ts`
- Move: `src/util/exec.ts` → `packages/core/src/util/exec.ts`
- Move tests: `test/spec.test.ts test/discover.test.ts test/grade.test.ts test/score.test.ts test/results.test.ts test/report.test.ts test/regressions.test.ts` → `packages/core/test/`
- Modify: `packages/core/src/index.ts` (real barrel export)

**Interfaces:**
- Consumes: Task 1 workspace layout.
- Produces: `@skill-check/core` exporting — exactly, for Tasks 3–5: `parseSpec`, `loadSpec`, `SpecError`, types `Spec`/`Scenario`/`ShipBar`; `discover`, `resolveSkill`, type `DiscoveredSkill`; `runSkillModel`, `formatScorecard`, types `RunOptions`/`RunSummary`; `buildJudgePrompt`, `gradeTranscript`, `parseVerdict`, `judgeResemblesSubject`; `score`, type `ScenarioVerdict`; `readResults`, `writeResults`, `runDirFor`, `transcriptPath`, `ensureResultsGitignore`, types `ResultsFile`/`ScenarioResult`; `runSeeded`; interface `HarnessAdapter`, `parseModelRef`, `modelSlug`, types `ModelRef`/`RunReq`/`JudgeReq`/`RunMode`; `exec`, `onPath`.

- [ ] **Step 1: git mv the files**

```bash
cd ~/prepos/skill-check
mkdir -p packages/core/src/adapters packages/core/src/util packages/core/test
git mv src/spec.ts src/discover.ts src/run.ts src/grade.ts src/score.ts src/results.ts src/seeded.ts src/report.ts packages/core/src/
git mv src/adapters/types.ts packages/core/src/adapters/types.ts
git mv src/util/exec.ts packages/core/src/util/exec.ts
git mv test/spec.test.ts test/discover.test.ts test/grade.test.ts test/score.test.ts test/results.test.ts test/report.test.ts test/regressions.test.ts packages/core/test/
```

- [ ] **Step 2: Fix intra-core imports**

Moved files keep their relative imports (`./spec.js`, `./adapters/types.js`, `./util/exec.js`) — unchanged by the move. Two files referenced code that is NOT moving into core and must lose those imports:
- `run.ts` imports nothing outside the moved set (verify: its imports are `./spec.js`, `./adapters/types.js`, `./grade.js`, `./score.js`, `./results.js`, `./seeded.js`) — no change.
- `seeded.ts` imports `./spec.js`, `./util/exec.js` — no change.
- Test files: update any `../src/...` import paths to `../src/...` relative to their new location (they moved together with the sources, so `packages/core/test/*.test.ts` importing `../src/spec.js` etc. — adjust each file's import from `../src/` to `../src/` (same shape); run vitest to catch any that used `../../src`).

- [ ] **Step 3: Real barrel `packages/core/src/index.ts`**

```ts
export * from "./spec.js";
export * from "./discover.js";
export * from "./run.js";
export * from "./grade.js";
export * from "./score.js";
export * from "./results.js";
export * from "./seeded.js";
export * from "./report.js";
export * from "./adapters/types.js";
export * from "./util/exec.js";
```

- [ ] **Step 4: Build + test**

Run: `npm run build && npx vitest run packages/core`
Expected: build exit 0; all 7 moved suites PASS. (Root `test/` dir is now empty — remove it: `rmdir test` if empty.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(core): move engine (spec/discover/run/grade/score/results/seeded/report + types/exec) into @skill-check/core"
```

---

### Task 3: Move adapters into `@skill-check/adapters` (carries the claude-cli patch)

**Files:**
- Move: `src/adapters/pi.ts` → `packages/adapters/src/pi.ts` (the working-tree modification rides along — verify it survives with `git diff` after the move)
- Move: `src/adapters/index.ts` → `packages/adapters/src/index.ts`
- Test: create `packages/adapters/test/claude-judge.test.ts`

**Interfaces:**
- Consumes: `@skill-check/core` — `HarnessAdapter`, `RunReq`, `JudgeReq`, `RunMode`, `exec`, `onPath`.
- Produces: `@skill-check/adapters` exporting `piAdapter`, `getAdapter(name: string): HarnessAdapter`, and re-exporting nothing from core (consumers import core directly). Judge routing contract: `judge({model:{provider:"claude-code", model:M}, prompt, cwd})` executes `claude -p <prompt> --model M`; any other provider executes `pi --no-skills --no-context-files --no-session --provider P --model M -p <prompt>`.

- [ ] **Step 1: git mv + import fixes**

```bash
mkdir -p packages/adapters/src packages/adapters/test
git mv src/adapters/pi.ts packages/adapters/src/pi.ts
git mv src/adapters/index.ts packages/adapters/src/index.ts
rmdir src/adapters 2>/dev/null; rmdir src/util 2>/dev/null
```

In `packages/adapters/src/pi.ts` change:
```ts
import type { HarnessAdapter, RunReq, JudgeReq, RunMode } from "./types.js";
import { exec, onPath } from "../util/exec.js";
```
to:
```ts
import type { HarnessAdapter, RunReq, JudgeReq, RunMode } from "@skill-check/core";
import { exec, onPath } from "@skill-check/core";
```

In `packages/adapters/src/index.ts` change `from "./types.js"` to `from "@skill-check/core"` and drop the `export * from "./types.js"` line (core owns types); keep `getAdapter` and `export { piAdapter }`.

Run: `git diff packages/adapters/src/pi.ts | grep claude-code`
Expected: the claude-code judge branch is present in the diff (patch survived the move).

- [ ] **Step 2: Write the failing test for claude-cli judge routing**

`packages/adapters/test/claude-judge.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock core's exec before importing the adapter.
vi.mock("@skill-check/core", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@skill-check/core")>();
  return { ...orig, exec: vi.fn(), onPath: () => true };
});

import { piAdapter } from "../src/index.js";
import { exec } from "@skill-check/core";

const mockedExec = vi.mocked(exec);

beforeEach(() => {
  mockedExec.mockReset();
  mockedExec.mockResolvedValue({ code: 0, stdout: "VERDICT: PASS\nREASON: ok", stderr: "" });
});

describe("judge routing", () => {
  it("routes claude-code judge to the claude CLI", async () => {
    await piAdapter.judge({
      model: { provider: "claude-code", model: "opus" },
      prompt: "grade this",
      cwd: "/tmp",
    });
    const [cmd, args] = mockedExec.mock.calls[0];
    expect(cmd).toBe("claude");
    expect(args).toEqual(["-p", "grade this", "--model", "opus"]);
  });

  it("routes any other provider through pi", async () => {
    await piAdapter.judge({
      model: { provider: "anthropic", model: "claude-opus-4-8" },
      prompt: "grade this",
      cwd: "/tmp",
    });
    const [cmd, args] = mockedExec.mock.calls[0];
    expect(cmd).toBe("pi");
    expect(args).toContain("--provider");
    expect(args).toContain("anthropic");
  });

  it("surfaces judge CLI failure as a tagged string, not a throw", async () => {
    mockedExec.mockResolvedValue({ code: 1, stdout: "", stderr: "boom" });
    const out = await piAdapter.judge({
      model: { provider: "claude-code", model: "opus" },
      prompt: "p",
      cwd: "/tmp",
    });
    expect(out).toMatch(/^\[judge error: claude exited 1\]/);
  });
});
```

- [ ] **Step 3: Run test — expect fail/pass appropriately**

Run: `npm run build && npx vitest run packages/adapters`
Expected: PASS (the implementation already exists via the patch). If any assertion fails, the test has found a real routing discrepancy — fix `pi.ts` to match the contract in Interfaces, not the test.

Note: if `exec`'s return shape differs from `{code, stdout, stderr}` (check `packages/core/src/util/exec.ts`), adjust the mock's resolved value to the actual `ExecResult` shape — the assertions on command/args stay identical.

- [ ] **Step 4: Commit (this is the claude-cli judge landing)**

```bash
git add -A
git commit -m "feat(adapters): @skill-check/adapters package; claude-code judge routing (subscription CLI) with routing tests"
```

---

### Task 4: Move the CLI into `@skill-check/cli`, fix the launcher

**Files:**
- Move: `src/cli.ts` → `packages/cli/src/cli.ts` (replaces Task 1's placeholder), `src/serve.ts` → `packages/cli/src/serve.ts`
- Modify: `bin/skill-check.js`
- Delete: `src/` (now empty), old root `dist/` (`rm -rf dist`, add `dist` cleanup note)

**Interfaces:**
- Consumes: `@skill-check/core` (everything in Task 2's Produces list), `@skill-check/adapters` (`getAdapter`).
- Produces: `packages/cli/dist/cli.js` — the entry the launcher imports. CLI surface unchanged: `run`, `grade`, `review`, `add-test`, `list` with identical flags and output.

- [ ] **Step 1: Move + fix imports**

```bash
git rm packages/cli/src/cli.ts   # placeholder from Task 1
git mv src/cli.ts packages/cli/src/cli.ts
git mv src/serve.ts packages/cli/src/serve.ts
rmdir src
```

In `packages/cli/src/cli.ts`, replace the relative engine imports (lines importing from `./discover.js`, `./spec.js`, `./run.js`, `./grade.js`, `./score.js`, `./results.js`, `./adapters/types.js`) with:
```ts
import {
  discover, resolveSkill,
  loadSpec, parseSpec,
  parseModelRef,
  runSkillModel, formatScorecard, type RunSummary,
  buildJudgePrompt, gradeTranscript,
  score, type ScenarioVerdict,
  readResults, writeResults, type ResultsFile,
} from "@skill-check/core";
import { getAdapter } from "@skill-check/adapters";
import { serveReview } from "./serve.js";
```
(Keep exactly the names the file already uses; this is a path change, not an API change.) `serve.ts`: same treatment for any `./`-engine imports (check its header; it reads results + transcripts, so likely `readResults`/`writeResults`/types from core).

- [ ] **Step 2: Launcher points at the cli package**

`bin/skill-check.js` — replace the two path constants:
```js
const distCli = join(here, "..", "packages", "cli", "dist", "cli.js");
// …
const srcCli = join(here, "..", "packages", "cli", "src", "cli.ts");
```
(Everything else in the launcher is unchanged.)

- [ ] **Step 3: Build + behavioral smoke**

Run:
```bash
npm run build
./bin/skill-check list --skills ~/prepos/principal-pi-skills/proposals
rm -rf packages/*/dist && ./bin/skill-check list --skills ~/prepos/principal-pi-skills/proposals && npm run build
```
Expected: both invocations (built and tsx-fallback) print the same 7-skill listing as before the restructure (compare against `git stash`-free memory: architect/build/debug/decide/git-ops/plan/review, all ●).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(cli): move CLI + review server into @skill-check/cli; launcher targets packages/cli"
```

---

### Task 5: Golden pipeline test with an injected fake adapter

**Files:**
- Create: `packages/core/test/golden-run.test.ts`
- Create: `packages/core/test/fixtures/golden-skill/SKILL.md`
- Create: `packages/core/test/fixtures/golden-skill/tests/specification.yaml`

**Interfaces:**
- Consumes: `runSkillModel(opts: RunOptions)` where `RunOptions = { spec, skillDir, specPath, adapter, model, modelToken, judge, mode, cwd, timestamp, onProgress? }`; `parseSpec`; `readResults`.
- Produces: the behavioral lock later milestones must keep green — a full run (2 scenarios: single-turn + multi-turn) through a `HarnessAdapter` fake, asserting the persisted `results.yaml` grade and scenario verdicts and the transcript files' content.

- [ ] **Step 1: Fixture skill**

`packages/core/test/fixtures/golden-skill/SKILL.md`:
```markdown
---
name: golden-skill
description: Use when testing the skill-check pipeline itself.
---
# Golden Skill
Always answer politely.
```

`packages/core/test/fixtures/golden-skill/tests/specification.yaml`:
```yaml
skill: golden-skill
judge_persona: >
  a polite assistant.
ship_bar:
  total: 2
  min_pass: 2
  no_critical_fail: true
critical: [A1]
scenarios:
  - id: A1
    title: says hello
    critical: true
    turns:
      - "Say hello."
    checklist:
      - greets the user
  - id: B1
    title: holds over two turns
    turns:
      - "Say hello."
      - "Say it again."
    checklist:
      - greets in both turns
```

- [ ] **Step 2: Write the failing golden test**

`packages/core/test/golden-run.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseSpec, runSkillModel, readResults,
  type HarnessAdapter, type RunReq, type JudgeReq,
} from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, "fixtures", "golden-skill");

const fakeAdapter: HarnessAdapter = {
  name: "pi",
  available: async () => true,
  run: async (req: RunReq) =>
    req.turns.map((t, i) => `>>> USER (turn ${i + 1}/${req.turns.length}):\n${t}\n\n<<< ASSISTANT:\nHello!\n`).join("\n"),
  judge: async (_req: JudgeReq) => "1. PASS — greets\nVERDICT: PASS\nREASON: greeted politely",
};

describe("golden pipeline run", () => {
  it("runs, grades, scores, persists — end to end with a fake adapter", async () => {
    const skillDir = mkdtempSync(join(tmpdir(), "sc-golden-"));
    cpSync(FIXTURE, skillDir, { recursive: true });
    const specPath = join(skillDir, "tests", "specification.yaml");
    const spec = parseSpec(readFileSync(specPath, "utf8"), specPath);

    const { runDir, results } = await runSkillModel({
      spec,
      skillDir,
      specPath,
      adapter: fakeAdapter,
      model: { provider: "fireworks", model: "fake-model" },
      modelToken: "fireworks:fake-model",
      judge: { provider: "claude-code", model: "opus" },
      mode: "green",
      cwd: skillDir,
      timestamp: "2026-07-03T00-00-00-000Z",
    });

    expect(results.grade.passed).toBe(2);
    expect(results.grade.ship).toBe(true);
    expect(results.scenarios.map((s) => s.judge_verdict)).toEqual(["PASS", "PASS"]);

    const persisted = readResults(runDir);
    expect(persisted).toBeTruthy();
    expect(persisted!.grade.pct).toBe(100);

    const t = readFileSync(join(runDir, "A1.green.txt"), "utf8");
    expect(t).toContain("Say hello.");
    expect(t).toContain("Hello!");
  });

  it("gates the ship bar on a critical FAIL", async () => {
    const skillDir = mkdtempSync(join(tmpdir(), "sc-golden-"));
    cpSync(FIXTURE, skillDir, { recursive: true });
    const specPath = join(skillDir, "tests", "specification.yaml");
    const spec = parseSpec(readFileSync(specPath, "utf8"), specPath);

    const failingJudge: HarnessAdapter = {
      ...fakeAdapter,
      judge: async () => "1. FAIL — rude\nVERDICT: FAIL\nREASON: no greeting",
    };
    const { results } = await runSkillModel({
      spec, skillDir, specPath,
      adapter: failingJudge,
      model: { provider: "fireworks", model: "fake-model" },
      modelToken: "fireworks:fake-model",
      judge: { provider: "claude-code", model: "opus" },
      mode: "green", cwd: skillDir,
      timestamp: "2026-07-03T00-00-00-001Z",
    });
    expect(results.grade.ship).toBe(false);
    expect(results.grade.passed).toBe(0);
  });
});
```

- [ ] **Step 3: Run — adjust only for real API shape, not behavior**

Run: `npx vitest run packages/core/test/golden-run.test.ts`
Expected: PASS. If a field name differs (e.g. `readResults` signature takes `(runDir)` vs `(path)`), fix the TEST to the actual core API — this task documents current behavior; it must not change engine code. If the run writes `results.yaml` fields the test doesn't cover, leave them — the golden test asserts the load-bearing subset.

- [ ] **Step 4: Full suite + commit**

Run: `npm run build && npm test`
Expected: all suites PASS (core 7 + golden 2 files, adapters 1).

```bash
git add packages/core/test
git commit -m "test(core): golden end-to-end pipeline run via injected fake adapter"
```

---

### Task 6: Docs + push

**Files:**
- Modify: `README.md` (Setup + repo-layout sections only)

**Interfaces:**
- Consumes: everything landed in Tasks 1–5.
- Produces: contributor-facing truth: workspace layout, `npm run build` = `tsc -b`, per-package tests, launcher unchanged for users.

- [ ] **Step 1: README surgical update**

In `README.md`, replace the Setup section's build note with:

```markdown
## Repo layout

    packages/core/       engine: spec, discover, run, grade, score, results, seeded, report
    packages/adapters/   pi harness + claude-code (subscription CLI) judge routing
    packages/cli/        command surface (run/grade/review/add-test/list) + review UI server
    bin/skill-check.js   launcher: packages/cli/dist if built, tsx fallback otherwise

Build: `npm run build` (tsc project references). Test: `npm test` (vitest workspace).
The CLI surface and all commands are unchanged from v0.0.1.
```

Also add one line under the judge documentation: `judge provider claude-code:<model> routes grading through the local claude CLI (Claude subscription OAuth) instead of a metered API key.`

- [ ] **Step 2: Final green check**

Run: `npm run build && npm test && ./bin/skill-check list --skills ~/prepos/principal-pi-skills/proposals`
Expected: build 0, all tests PASS, 7 skills listed.

- [ ] **Step 3: Commit + push branch**

```bash
git add README.md
git commit -m "docs: workspace layout + claude-code judge in README"
git push -u origin framework-v2
```

---

## Self-review notes

- **Spec coverage (M1 scope only):** workspace restructure ✓ (T1–T4), zero behavior change locked by golden test ✓ (T5) + smoke (T4·S3), claude-cli judge committed as tested feature ✓ (T3). Later spec sections (journal, schema 2, env:, scheduler, misfire, UI, extension, action) intentionally out of scope — Milestones 2–7.
- **Placeholders:** none; every code step shows the code, every run step names the command and expectation.
- **Type consistency:** names in Interfaces blocks match `src/` as read (`runSkillModel`, `RunOptions` fields, `HarnessAdapter.{name,available,run,judge}`, `parseSpec(text, file)`, `results.grade.{passed,pct,ship}`); T3·S3 and T5·S3 explicitly instruct adjusting tests to the actual `ExecResult`/`readResults` shapes rather than changing engine code.
