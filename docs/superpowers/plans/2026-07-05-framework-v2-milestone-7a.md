# skill-check v2 — Milestone 7a: lint + free-PR CI action — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `skill-check lint` command (static spec/fixture checks + conditional results-consistency) that exits non-zero on failure and emits GitHub PR annotations, wrapped in a composite GitHub Action so a consumer skills-repo gets free lint checks by adding one workflow file — plus consumer docs and a dogfooding self-CI workflow.

**Architecture:** New pure-core `lintSkill(skillDir): LintFinding[]` (wraps `parseSpec`/`loadSpec`, adds ship_bar/critical/fixture/consistency checks; never throws), a `cmdLint` CLI command that aggregates findings across discovered skills and sets `process.exitCode`, a composite `action.yml` that builds skill-check in-action and runs lint against the consumer's checkout, and a self-CI workflow.

**Tech Stack:** TypeScript ESM (relative imports end in `.js`), node sync `fs`, `js-yaml`, vitest. GitHub Actions (composite action + workflow YAML). No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-07-05-skill-check-m7a-lint-ci-design.md`. Master: `docs/superpowers/specs/2026-07-03-skill-check-framework-design.md` (step 7; CI lines 101–112).

**Repo / branch:** `~/prepos/skill-check`, branch `framework-v2-m7a` (spec committed `a1e1395`). `main` has M1–M6 merged. Baseline: 218 tests.

## Global Constraints

- `npm run build && npx vitest run` green at every commit (repo root). Tests call exported `cmdX(args)`/`lintSkill(...)` directly with hand-built inputs (the `!process.env.VITEST` guard stops `main` auto-dispatch under vitest). No new npm dependencies.
- ESM: every relative import ends in `.js`. Sync `node:fs`.
- **Exit-code contract (the CI gate):** `skill-check lint` → `process.exitCode = 0` when all clean, `1` when ≥1 finding OR a resolution error (unknown skill / bad root). `cmdLint` sets `process.exitCode` itself (it does NOT throw on findings). Tests that call `cmdLint` MUST reset `process.exitCode = 0` in `afterEach`.
- **lint check set:** static always (spec validity via parseSpec; ship_bar `min_pass ≤ total` and `total ≤ scenarios.length`; every `critical` id exists among scenarios; each seeded scenario's `fixture` resolves to an existing dir relative to the spec's dir `dirname(specPath)`); **results-consistency only for skills with committed `results.yaml`** (skipped silently otherwise).
- **GitHub annotations:** emitted ONLY when `process.env.GITHUB_ACTIONS === "true"`, as `::error …::` lines, in addition to the human report.
- `lintSkill` never throws — a bad spec becomes a `{code:"spec"}` finding (parseSpec throws one `SpecError` at a time; catch it).
- **Deferred to 7b (do NOT build):** model runs in CI, pi-in-CI, secrets, `workflow_dispatch`, artifact upload, PR comments, `judge --from-run`, `run --fail-on-not-ship`. **Deferred to publish:** npm publish, `files`/`repository` fields, name-collision fix.

## File Structure

| File | Responsibility |
|---|---|
| `packages/core/src/lint.ts` (new) | `lintSkill(skillDir): LintFinding[]` + `LintFinding` — all lint checks, never throws |
| `packages/core/src/index.ts` | export `./lint.js` |
| `packages/cli/src/cli.ts` | `cmdLint(args)`; register `lint` in `main` switch; `HELP` line |
| `action.yml` (new, repo root) | composite GitHub Action running lint against the consumer checkout |
| `.github/workflows/ci.yml` (new) | self-CI: build/test/typecheck + dogfood the action |
| `README.md` | CI section (the one workflow file a consumer adds) + `lint` in usage |
| `packages/core/test/lint.test.ts` (new) | `lintSkill` unit tests |
| `packages/cli/test/lint-cmd.test.ts` (new) | `cmdLint` exit-code / aggregation / annotation tests |

---

### Task 1: `lintSkill` — static checks (spec, ship_bar, critical, fixture)

**Files:**
- Create: `packages/core/src/lint.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/lint.test.ts` (new)

**Interfaces:**
- Consumes: `loadSpec`, `SpecError` (`./spec.js`); `existsSync`, `statSync` (`node:fs`); `dirname`, `resolve`, `isAbsolute`, `join` (`node:path`).
- Produces:
  ```ts
  export interface LintFinding { skill: string; scenario?: string; code: string; message: string; }
  export function lintSkill(skillDir: string): LintFinding[];
  ```
  `code` ∈ `"spec" | "ship_bar" | "critical" | "fixture" | "consistency"`. Task 2 adds the `"consistency"` findings to the same function; Task 3 consumes `lintSkill` + `LintFinding`.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/lint.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintSkill } from "../src/lint.js";

const tmps: string[] = [];
function skill(specYaml: string, extra?: (dir: string) => void): string {
  const d = mkdtempSync(join(tmpdir(), "sc-lint-"));
  tmps.push(d);
  writeFileSync(join(d, "SKILL.md"), "---\nname: x\n---\n", "utf8");
  mkdirSync(join(d, "tests"), { recursive: true });
  writeFileSync(join(d, "tests", "specification.yaml"), specYaml, "utf8");
  extra?.(d);
  return d;
}
afterEach(() => { while (tmps.length) rmSync(tmps.pop()!, { recursive: true, force: true }); });

const GOOD = `skill: demo\njudge_persona: a judge.\nship_bar: { total: 1, min_pass: 1 }\ncritical: [A1]\nscenarios:\n  - id: A1\n    title: t\n    turns: ["hi"]\n    checklist: ["ok"]\n`;

describe("lintSkill static checks", () => {
  it("clean spec → no findings", () => {
    expect(lintSkill(skill(GOOD))).toEqual([]);
  });
  it("invalid spec → one code:spec finding (does not throw)", () => {
    const f = lintSkill(skill(`skill: demo\n`)); // missing judge_persona/ship_bar/scenarios
    expect(f).toHaveLength(1);
    expect(f[0].code).toBe("spec");
  });
  it("ship_bar min_pass > total → ship_bar finding", () => {
    const f = lintSkill(skill(`skill: d\njudge_persona: j.\nship_bar: { total: 1, min_pass: 2 }\nscenarios:\n  - id: A1\n    title: t\n    turns: ["h"]\n    checklist: ["ok"]\n`));
    expect(f.some((x) => x.code === "ship_bar" && /min_pass/.test(x.message))).toBe(true);
  });
  it("ship_bar total > scenario count → ship_bar finding", () => {
    const f = lintSkill(skill(`skill: d\njudge_persona: j.\nship_bar: { total: 5, min_pass: 1 }\nscenarios:\n  - id: A1\n    title: t\n    turns: ["h"]\n    checklist: ["ok"]\n`));
    expect(f.some((x) => x.code === "ship_bar" && /total/.test(x.message))).toBe(true);
  });
  it("unknown critical id → critical finding", () => {
    const f = lintSkill(skill(`skill: d\njudge_persona: j.\nship_bar: { total: 1, min_pass: 1 }\ncritical: [ZZ]\nscenarios:\n  - id: A1\n    title: t\n    turns: ["h"]\n    checklist: ["ok"]\n`));
    expect(f.some((x) => x.code === "critical" && /ZZ/.test(x.message))).toBe(true);
  });
  it("seeded fixture dir missing → fixture finding", () => {
    const y = `skill: d\njudge_persona: j.\nship_bar: { total: 1, min_pass: 1 }\nscenarios:\n  - id: A1\n    title: t\n    mode: seeded\n    fixture: fixtures/missing\n    turns: ["h"]\n    checklist: ["ok"]\n`;
    const f = lintSkill(skill(y));
    expect(f.some((x) => x.code === "fixture" && x.scenario === "A1")).toBe(true);
  });
  it("seeded fixture dir present → no fixture finding", () => {
    const y = `skill: d\njudge_persona: j.\nship_bar: { total: 1, min_pass: 1 }\nscenarios:\n  - id: A1\n    title: t\n    mode: seeded\n    fixture: fixtures/repo\n    turns: ["h"]\n    checklist: ["ok"]\n`;
    const d = skill(y, (dir) => mkdirSync(join(dir, "tests", "fixtures", "repo"), { recursive: true }));
    expect(lintSkill(d).some((x) => x.code === "fixture")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/core/test/lint.test.ts`
Expected: FAIL — `lintSkill` not exported.

- [ ] **Step 3: Implement `lint.ts` (static checks)**

```ts
import { existsSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { loadSpec, SpecError } from "./spec.js";

export interface LintFinding {
  skill: string;
  scenario?: string;
  code: string; // spec | ship_bar | critical | fixture | consistency
  message: string;
}

/**
 * Validate one skill's spec + fixtures statically (and results-consistency when
 * committed results exist — see the consistency block). Never throws: a bad spec
 * becomes a single `code:"spec"` finding. Returns ALL findings so the CLI can
 * report every problem across every skill.
 */
export function lintSkill(skillDir: string): LintFinding[] {
  const specPath = join(skillDir, "tests", "specification.yaml");
  const findings: LintFinding[] = [];
  let spec: import("./spec.js").Spec;
  try {
    spec = loadSpec(specPath);
  } catch (e) {
    const message = e instanceof SpecError ? e.message : e instanceof Error ? e.message : String(e);
    return [{ skill: skillDir, code: "spec", message }];
  }
  const skill = spec.skill;

  // ship_bar sanity
  if (spec.ship_bar.min_pass > spec.ship_bar.total) {
    findings.push({ skill, code: "ship_bar", message: `ship_bar.min_pass (${spec.ship_bar.min_pass}) > total (${spec.ship_bar.total})` });
  }
  if (spec.ship_bar.total > spec.scenarios.length) {
    findings.push({ skill, code: "ship_bar", message: `ship_bar.total (${spec.ship_bar.total}) > scenario count (${spec.scenarios.length})` });
  }

  // critical ids exist
  const ids = new Set(spec.scenarios.map((s) => s.id));
  for (const cid of spec.critical) {
    if (!ids.has(cid)) findings.push({ skill, code: "critical", message: `critical id \`${cid}\` is not a scenario` });
  }

  // fixture paths exist — check the EFFECTIVE workspace fixture (what the runtime actually
  // copies: run.ts uses scenario.workspace, not the raw scenario.fixture — an inline scenario
  // with env.workspace: fixture:PATH sets workspace.fixture but NOT scenario.fixture). Resolve
  // relative to the spec's dir, matching workspace.ts resolve(specDir, fixture) where specDir = <skillDir>/tests.
  const specDir = dirname(specPath);
  for (const s of spec.scenarios) {
    const fx = typeof s.workspace === "object" && s.workspace !== null ? s.workspace.fixture : undefined;
    if (fx) {
      const abs = isAbsolute(fx) ? fx : resolve(specDir, fx);
      if (!existsSync(abs) || !statSync(abs).isDirectory()) {
        findings.push({ skill, scenario: s.id, code: "fixture", message: `fixture not found: ${fx}` });
      }
    }
  }

  // (Task 2 inserts the results-consistency block here.)
  return findings;
}
```

Add `export * from "./lint.js";` to `packages/core/src/index.ts` (after another export line).

- [ ] **Step 4: Run tests + build + full suite + commit**

Run: `npx vitest run packages/core/test/lint.test.ts` → PASS (7).
Run: `npm run build && npx vitest run` → green (218 + 7).

```bash
git add packages/core/src/lint.ts packages/core/src/index.ts packages/core/test/lint.test.ts
git commit -m "feat(core): lintSkill static checks (spec, ship_bar, critical, fixture)"
```

---

### Task 2: `lintSkill` — conditional results-consistency

**Files:**
- Modify: `packages/core/src/lint.ts`
- Test: `packages/core/test/lint.test.ts` (extend)

**Interfaces:**
- Consumes: `readResults`, `finalizeResults`, `findTranscriptFiles`, `ResultsFile`, `ScoreContext` (`./results.js`); `readdirSync` (`node:fs`).
- Produces: `lintSkill` now also returns `code:"consistency"` findings when committed `results.yaml` exist. Signature unchanged.

- [ ] **Step 1: Write the failing tests**

Add to `packages/core/test/lint.test.ts` (reuse `skill`/`tmps`; add `writeResults` import). Helper to write a run dir + a good results.yaml, then tamper:

```ts
import { writeResults, readResults } from "../src/index.js";
import yaml from "js-yaml";

function withRun(skillDir: string, scenarios: any[], tamper?: (r: any) => void) {
  const runDir = join(skillDir, "tests", "results", "pi-fake", "2026-07-01T00-00-00Z");
  mkdirSync(runDir, { recursive: true });
  // write a consistent results.yaml via the real writer:
  writeResults(runDir, {
    skill: "demo", harness: "pi", model: "fireworks:fake",
    judge: { provider: "anthropic", model: "opus" }, timestamp: "2026-07-01T00:00:00Z",
    label: null, mode: "green", scenarios,
  }, { shipBar: { total: 1, min_pass: 1, no_critical_fail: true }, critical: ["A1"] });
  if (tamper) {
    const r = readResults(runDir);
    tamper(r);
    writeFileSync(join(runDir, "results.yaml"), yaml.dump(r), "utf8");
  }
  return runDir;
}

describe("lintSkill results-consistency", () => {
  const clean = [{ id: "A1", judge_verdict: "PASS", judge_reason: "ok", suspect: false, override: null, note: "" }];
  it("no committed results → consistency skipped (no findings)", () => {
    expect(lintSkill(skill(GOOD)).some((x) => x.code === "consistency")).toBe(false);
  });
  it("consistent results → no consistency finding", () => {
    const d = skill(GOOD); withRun(d, clean);
    expect(lintSkill(d).some((x) => x.code === "consistency")).toBe(false);
  });
  it("tampered effective_grade → consistency finding", () => {
    const d = skill(GOOD);
    withRun(d, clean, (r) => { r.effective_grade.pct = 0; r.effective_grade.ship = false; });
    expect(lintSkill(d).some((x) => x.code === "consistency" && /grade/.test(x.message))).toBe(true);
  });
  it("override without note → consistency finding", () => {
    const d = skill(GOOD);
    withRun(d, [{ id: "A1", judge_verdict: "FAIL", judge_reason: "x", suspect: false, override: "PASS", note: "" }]);
    expect(lintSkill(d).some((x) => x.code === "consistency" && /override/.test(x.message) && /note/.test(x.message))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/core/test/lint.test.ts`
Expected: FAIL — tampered-grade + override-without-note cases produce no consistency findings yet.

- [ ] **Step 3: Implement the consistency block in `lint.ts`**

Add imports: `import { readResults, finalizeResults, findTranscriptFiles, resultsPath, type ResultsFile, type ScoreContext } from "./results.js";`, `readdirSync`, `readFileSync` to the `node:fs` import, and `import yaml from "js-yaml";`. Replace the `// (Task 2 inserts …)` comment with:

```ts
  // results-consistency — only for committed results.yaml (skipped silently otherwise)
  const resultsRoot = join(skillDir, "tests", "results");
  for (const runDir of enumerateRunDirs(resultsRoot)) {
    // Only schema-2 results are recompute-checkable. migrateResults carries a schema-1 grade
    // verbatim (may predate override-aware scoring), so recomputing it would false-flag; skip v1.
    let rawSchema: unknown;
    try { rawSchema = (yaml.load(readFileSync(resultsPath(runDir), "utf8")) as { schema?: unknown })?.schema; } catch { continue; }
    if (rawSchema !== 2) continue;
    let r: ResultsFile;
    try { r = readResults(runDir); } catch { continue; } // a corrupt/partial results.yaml is not this check's concern
    const ctx: ScoreContext | null = r.mode === "green" ? { shipBar: spec.ship_bar, critical: spec.critical } : null;
    const recomputed = finalizeResults(
      { skill: r.skill, harness: r.harness, model: r.model, judge: r.judge, timestamp: r.timestamp, label: r.label, mode: r.mode, scenarios: r.scenarios },
      ctx,
    ).effective_grade;
    if (JSON.stringify(recomputed) !== JSON.stringify(r.effective_grade)) {
      findings.push({ skill, code: "consistency", message: `results.yaml effective_grade is stale in ${runDir} (recompute differs)` });
    }
    for (const s of r.scenarios) {
      if (s.override !== null) {
        if (!s.note || !s.note.trim()) findings.push({ skill, scenario: s.id, code: "consistency", message: `override on ${s.id} has no note (${runDir})` });
        if (findTranscriptFiles(runDir, s.id, r.mode).length === 0) findings.push({ skill, scenario: s.id, code: "consistency", message: `override on ${s.id} has no preserved transcript (${runDir})` });
      }
    }
  }
```

Add the helper (bottom of lint.ts) — enumerate `<resultsRoot>/<tag>/<ts>/` dirs that contain `results.yaml`:

```ts
/** All committed run dirs under a skill's tests/results (<tag>/<timestamp>/results.yaml). Empty if none. */
function enumerateRunDirs(resultsRoot: string): string[] {
  if (!existsSync(resultsRoot)) return [];
  const out: string[] = [];
  for (const tag of readdirSync(resultsRoot)) {
    const tagDir = join(resultsRoot, tag);
    if (!statSync(tagDir).isDirectory()) continue;
    for (const ts of readdirSync(tagDir)) {
      const runDir = join(tagDir, ts);
      if (statSync(runDir).isDirectory() && existsSync(join(runDir, "results.yaml"))) out.push(runDir);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run tests + build + full suite + commit**

Run: `npx vitest run packages/core/test/lint.test.ts` → PASS (11).
Run: `npm run build && npx vitest run` → green.

```bash
git add packages/core/src/lint.ts packages/core/test/lint.test.ts
git commit -m "feat(core): lintSkill conditional results-consistency check"
```

---

### Task 3: `cmdLint` — CLI command, exit code, annotations, dispatch, docs

**Files:**
- Modify: `packages/cli/src/cli.ts`, `README.md`
- Test: `packages/cli/test/lint-cmd.test.ts` (new)

**Interfaces:**
- Consumes: `lintSkill`, `LintFinding` (`@skill-check/core`); `discover`, `resolveSkill` (`@skill-check/core`); `flagStr`, `Args` (cli.ts, existing).
- Produces: `export async function cmdLint(args: Args): Promise<void>` — resolves skills, aggregates findings, prints report (+ annotations under Actions), sets `process.exitCode`. Registered as `case "lint"` in `main`.

- [ ] **Step 1: Write the failing tests**

Create `packages/cli/test/lint-cmd.test.ts`:

```ts
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cmdLint } from "../src/cli.js";

const tmps: string[] = [];
function args(root: string, target = "all") { return { _: [target], flags: { skills: root }, multi: {} }; }
function mkSkill(root: string, name: string, specYaml: string) {
  const d = join(root, name);
  mkdirSync(join(d, "tests"), { recursive: true });
  writeFileSync(join(d, "SKILL.md"), "---\nname: " + name + "\n---\n", "utf8");
  writeFileSync(join(d, "tests", "specification.yaml"), specYaml, "utf8");
}
const GOOD = (id = "A1") => `skill: d\njudge_persona: j.\nship_bar: { total: 1, min_pass: 1 }\nscenarios:\n  - id: ${id}\n    title: t\n    turns: ["h"]\n    checklist: ["ok"]\n`;
const BAD = `skill: d\njudge_persona: j.\nship_bar: { total: 9, min_pass: 1 }\nscenarios:\n  - id: A1\n    title: t\n    turns: ["h"]\n    checklist: ["ok"]\n`;

beforeEach(() => { process.exitCode = 0; delete process.env.GITHUB_ACTIONS; });
afterEach(() => { process.exitCode = 0; delete process.env.GITHUB_ACTIONS; while (tmps.length) rmSync(tmps.pop()!, { recursive: true, force: true }); });
function root() { const d = mkdtempSync(join(tmpdir(), "sc-lintcmd-")); tmps.push(d); return d; }

describe("cmdLint", () => {
  it("all skills clean → exit 0", async () => {
    const r = root(); mkSkill(r, "a", GOOD()); mkSkill(r, "b", GOOD());
    await cmdLint(args(r));
    expect(process.exitCode).toBe(0);
  });
  it("a failing skill → exit 1", async () => {
    const r = root(); mkSkill(r, "a", GOOD()); mkSkill(r, "b", BAD);
    await cmdLint(args(r));
    expect(process.exitCode).toBe(1);
  });
  it("unknown named skill → exit 1", async () => {
    const r = root(); mkSkill(r, "a", GOOD());
    await cmdLint(args(r, "nope"));
    expect(process.exitCode).toBe(1);
  });
  it("emits ::error:: annotations only under GITHUB_ACTIONS", async () => {
    const r = root(); mkSkill(r, "b", BAD);
    const lines: string[] = [];
    const spy = (m: any) => lines.push(String(m));
    const orig = console.log; console.log = spy as any;
    try {
      process.env.GITHUB_ACTIONS = "true";
      await cmdLint(args(r));
    } finally { console.log = orig; }
    expect(lines.some((l) => l.startsWith("::error"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/cli/test/lint-cmd.test.ts`
Expected: FAIL — `cmdLint` not exported.

- [ ] **Step 3: Implement `cmdLint` + register + HELP + README**

Add to the `@skill-check/core` import in cli.ts: `lintSkill`, `type LintFinding` (and `discover`, `resolveSkill` if not already imported — check; `resolveSkill`/`discover` are used by cmdRun/cmdList so likely imported). Add:

```ts
export async function cmdLint(args: Args): Promise<void> {
  const root = flagStr(args, "skills", process.cwd())!;
  const target = args._[0] ?? "all";
  let skillDirs: string[];
  try {
    skillDirs = target === "all"
      ? discover(root).filter((s) => s.hasSpec).map((s) => s.dir)
      : [resolveSkill(root, target).dir];
  } catch (e) {
    console.error(`error: ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
    return;
  }
  if (skillDirs.length === 0) {
    console.error(`no skills with a spec under ${root}`);
    process.exitCode = 1;
    return;
  }
  const gha = process.env.GITHUB_ACTIONS === "true";
  const findings: LintFinding[] = [];
  for (const dir of skillDirs) {
    const f = lintSkill(dir);
    findings.push(...f);
    if (f.length === 0) console.log(`✓ ${dir}`);
    else for (const x of f) {
      const where = x.scenario ? `${dir}/${x.scenario}` : dir; // dir-based label, consistent with the ✓ line
      console.log(`✗ ${where}: ${x.code} — ${x.message}`);
      if (gha) console.log(`::error title=skill-check::${where}: ${x.code} — ${x.message}`);
    }
  }
  console.log(`\n${skillDirs.length} skill(s), ${findings.length} finding(s)`);
  process.exitCode = findings.length > 0 ? 1 : 0;
}
```

Register in `main`'s switch (after `case "list"`): `case "lint": return cmdLint(args);`.

Add to the `HELP` const (after the `list` line):
```
  lint   <skill|all> --skills <root>           validate specs/fixtures (CI gate; exits non-zero on findings)
```

Add a `README.md` usage line for `lint` in the CLI reference block, mirroring the others.

- [ ] **Step 4: Run tests + build + full suite + commit**

Run: `npx vitest run packages/cli/test/lint-cmd.test.ts` → PASS (4).
Run: `npm run build && npx vitest run` → green.

```bash
git add packages/cli/src/cli.ts packages/cli/test/lint-cmd.test.ts README.md
git commit -m "feat(cli): skill-check lint — CI gate command (exit code + GitHub annotations)"
```

---

### Task 4: composite `action.yml` + consumer CI docs

**Files:**
- Create: `action.yml` (repo root)
- Modify: `README.md`

**Interfaces:**
- Consumes: the built `bin/skill-check.js lint` (Task 3).
- Produces: a composite action `mojomanyana/skill-check@<ref>` with inputs `skills-root` (default `skills`) + `skill` (default `all`).

- [ ] **Step 1: Create `action.yml`**

```yaml
name: skill-check
description: Lint agent-skill specs (free, static — no model runs, no secrets)
inputs:
  skills-root:
    description: Path (relative to the consumer repo) to the skills root — a directory of skill subdirs each with tests/specification.yaml
    default: skills
    required: false
  skill:
    description: Skill name to lint, or "all"
    default: all
    required: false
runs:
  using: composite
  steps:
    - uses: actions/setup-node@v4
      with:
        node-version: "20"
    - name: Build skill-check
      shell: bash
      run: npm ci && npm run build
      working-directory: ${{ github.action_path }}
    - name: Lint skills
      shell: bash
      run: node "${{ github.action_path }}/bin/skill-check.js" lint "${{ inputs.skill }}" --skills "${{ github.workspace }}/${{ inputs.skills-root }}"
```

- [ ] **Step 2: Add the consumer CI docs to `README.md`**

Add a `## CI` section documenting the one workflow file a consumer adds:

````markdown
## CI

Add one workflow file to your skills repo to lint your specs on every PR (free — static checks only, no model runs, no secrets):

```yaml
# .github/workflows/skill-check.yml
name: skill-check
on: pull_request
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: mojomanyana/skill-check@v1
        with:
          skills-root: ./skills   # dir of skill subdirs, each with tests/specification.yaml
```

`lint` validates spec schema, ship_bar sanity, critical-id existence, seeded-fixture paths, and results-consistency (for any committed `results.yaml`). Failures fail the check and annotate the PR inline. Your `tests/` folders are unchanged.
````

- [ ] **Step 3: Validate the action YAML + full suite + commit**

Validate `action.yml` parses (it's static YAML; the self-CI in Task 5 exercises it end-to-end). Confirm no code changed so the suite is unaffected.

Run: `npx vitest run` → green (unchanged).

```bash
git add action.yml README.md
git commit -m "feat(action): composite GitHub Action + consumer CI docs (one workflow file → free lint)"
```

---

### Task 5: dogfooding self-CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: root `scripts` (`build`, `test`, `typecheck`), the local `action.yml` (Task 4), the golden fixture `packages/core/test/fixtures/golden-skill`.

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:
jobs:
  build-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: npx vitest run
      - run: npm run typecheck
  dogfood-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Lint the golden fixture via the composite action
        uses: ./
        with:
          skills-root: packages/core/test/fixtures
          skill: all
```

(`uses: ./` runs the repo's own `action.yml` against its checkout; `packages/core/test/fixtures` contains `golden-skill/` — a valid spec — so lint exits 0, proving the action + lint end-to-end. `discover` finds `golden-skill` because it has a `SKILL.md`.)

- [ ] **Step 2: Verify YAML + confirm the golden fixture lints clean locally**

Locally prove the dogfood target passes before relying on CI:
Run: `npm run build && node bin/skill-check.js lint all --skills packages/core/test/fixtures`
Expected: `✓ …/golden-skill`, `1 skill(s), 0 finding(s)`, exit 0 (`echo $?` → 0).

Run: `npx vitest run` → green (no code change).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: self-CI (build/test/typecheck) + dogfood the lint action on the golden fixture"
```

---

## Self-review (done at plan time)

- **Spec coverage:** `lintSkill` static checks (spec/ship_bar/critical/fixture) ✓ (Task 1); conditional results-consistency ✓ (Task 2); `cmdLint` exit-code + GitHub annotations + dispatch ✓ (Task 3); consumer docs "one workflow file" ✓ (Task 4); composite `action.yml` (builds in-action, no publish/pi/secrets) ✓ (Task 4); self-CI dogfood ✓ (Task 5). Non-goals (7b metered tier, publish, `run --fail-on-not-ship`) untouched.
- **Type consistency:** `LintFinding {skill, scenario?, code, message}` and `lintSkill(skillDir): LintFinding[]` identical across Tasks 1–3; `cmdLint(args: Args): Promise<void>` sets `process.exitCode`; `finalizeResults(draft, ctx)`/`ScoreContext {shipBar, critical}`/`findTranscriptFiles(runDir,id,mode)`/`readResults` match results.ts; `discover(root).filter(hasSpec).map(s=>s.dir)` + `resolveSkill(root,name).dir` match discover.ts's `DiscoveredSkill`.
- **Placeholder scan:** none — every step has real code/commands. The README `lint` usage line (Task 3 Step 3) is prose-directed but bounded ("mirroring the others"); the exact line is given in the HELP block.
- **Adversarial pre-execution review (opus) folded in:** no Blockers; the load-bearing fixture-base risk CONFIRMED-OK (lint's `dirname(specPath)` = `<skillDir>/tests` matches run.ts's `createWorkspace({specDir: dirname(ctx.specPath)})`). Two Important fixes applied: (1) the fixture check now iterates the EFFECTIVE `scenario.workspace.fixture` (what the runtime copies), not the raw `scenario.fixture` — closes a false-negative for `env.workspace: fixture:PATH` scenarios; (2) results-consistency now skips non-schema-2 committed results (raw `yaml.load(...).schema !== 2` → continue) — `migrateResults` carries a schema-1 grade verbatim, so recomputing it would false-flag. Minors: `let spec: Spec` typed; cmdLint uses dir-based labels consistently for `✓`/`✗`.
- **Intended behavior (not bugs):** results-consistency recomputes with the CURRENT spec, so editing `ship_bar`/`critical` after a `results.yaml` was committed flags it as stale-vs-spec — that is the intended semantic (re-run/re-grade to refresh).
