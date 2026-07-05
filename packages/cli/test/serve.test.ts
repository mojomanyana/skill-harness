import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeResults, readResults, readJournal, type HarnessAdapter } from "@skill-harness/core";
import { serveReview } from "../src/serve.js";

// packages/cli/test -> packages/cli -> packages -> repo root
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const SPEC = `
skill: golden
judge_persona: a friendly greeter judge.
ship_bar: { total: 1, min_pass: 1 }
critical: [A1]
scenarios:
  - id: A1
    title: says hello
    turns: ["Say hello."]
    checklist: ["greets the user"]
`;

let skillDir: string;
let runDir: string;
let base: string;
let close: () => void;

beforeAll(async () => {
  skillDir = mkdtempSync(join(tmpdir(), "sc-serve-"));
  mkdirSync(join(skillDir, "tests"), { recursive: true });
  writeFileSync(join(skillDir, "tests", "specification.yaml"), SPEC, "utf8");
  runDir = join(skillDir, "tests", "results", "pi-fake", "2026-07-03T00-00-00Z");
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, "A1.green.txt"), "USER: Say hello.\nASSISTANT: (silence)", "utf8");
  writeResults(runDir, {
    skill: "golden", harness: "pi", model: "fireworks:fake",
    judge: { provider: "claude-code", model: "opus" },
    timestamp: "2026-07-03T00:00:00Z", label: null, mode: "green",
    scenarios: [{ id: "A1", judge_verdict: "FAIL", judge_reason: "no greeting", suspect: false, override: null, note: "" }],
  }, { shipBar: { total: 1, min_pass: 1, no_critical_fail: true }, critical: ["A1"] });

  process.env.SKILL_CHECK_NO_OPEN = "1";
  const s = await serveReview({ skillDir, skillName: "golden", port: 0, open: false });
  base = `http://127.0.0.1:${s.port}`;
  close = s.close;
});

afterAll(() => {
  close?.();
  rmSync(skillDir, { recursive: true, force: true });
});

async function save(body: object) {
  return fetch(`${base}/save`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("review server /save override rules", () => {
  test("rejects an override without a note (400, error surfaced)", async () => {
    const r = await save({ col: 0, scenarioId: "A1", override: "PASS", note: "" });
    expect(r.status).toBe(400);
    const j = await r.json();
    expect(j.ok).toBe(false);
    expect(j.error).toMatch(/requires a note/);
    expect(readResults(runDir).scenarios[0].override).toBeNull(); // nothing persisted
  });

  test("accepts an override with a note; grade recomputed; transcript preserved", async () => {
    const r = await save({ col: 0, scenarioId: "A1", override: "PASS", note: "judge missed the greeting" });
    expect(r.status).toBe(200);
    const results = readResults(runDir);
    expect(results.scenarios[0].override).toBe("PASS");
    expect(results.effective_grade.ship).toBe(true); // recomputed override-aware
    const gi = readFileSync(join(skillDir, "tests", "results", ".gitignore"), "utf8");
    expect(gi).toContain("!pi-fake/2026-07-03T00-00-00Z/A1.green.txt");
    const overrides = readJournal(runDir).filter((e) => e.event === "override");
    expect(overrides).toHaveLength(1);
    expect(overrides[0]).toMatchObject({ id: "A1", override: "PASS", note: "judge missed the greeting" });
  });

  test("note-only save (no override) still upgrades a stale legacy .gitignore", async () => {
    const giPath = join(skillDir, "tests", "results", ".gitignore");
    writeFileSync(giPath, "old body\n", "utf8");
    const r = await save({ col: 0, scenarioId: "A1", override: null, note: "x" });
    expect(r.status).toBe(200);
    const gi = readFileSync(giPath, "utf8");
    expect(gi).toMatch(/^# skill-harness:/);
    expect(gi).toContain("*.jsonl");
  });

  test("unknown scenario id → 400, error mentions the id, results.yaml unchanged", async () => {
    const before = readFileSync(join(runDir, "results.yaml"), "utf8");
    const r = await save({ col: 0, scenarioId: "ZZ", override: "PASS", note: "why" });
    expect(r.status).toBe(400);
    const j = await r.json();
    expect(j.ok).toBe(false);
    expect(j.error).toMatch(/ZZ/);
    expect(readFileSync(join(runDir, "results.yaml"), "utf8")).toBe(before);
  });

  test("GET /trends returns the run history JSON with no absolute paths", async () => {
    const r = await fetch(`${base}/trends`);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(Array.isArray(body.models)).toBe(true);
    expect(body.models.length).toBeGreaterThanOrEqual(1);
    expect(body.models[0].runs.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(body)).not.toMatch(/\/tmp\//); // no absolute paths leaked
  });
});

describe("review server /judge + /rejudge", () => {
  test("GET /judge returns the raw judge output for a scenario", async () => {
    // the fixture run dir written in beforeAll also gets a judge-raw artifact:
    writeFileSync(join(runDir, "A1.green.judge.txt"), "1. PASS\nVERDICT: PASS\nREASON: ok", "utf8");
    const r = await fetch(`${base}/judge?col=0&id=A1`);
    expect(r.status).toBe(200);
    expect(await r.text()).toMatch(/VERDICT: PASS/);
  });

  test("GET /judge 404s when no judge-raw artifact exists", async () => {
    const r = await fetch(`${base}/judge?col=0&id=ZZ`);
    expect(r.status).toBe(404);
  });

  test("POST /rejudge 404s for an unknown column", async () => {
    const r = await fetch(`${base}/rejudge`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ col: 99, scenarioId: "A1" }),
    });
    expect(r.status).toBe(404);
  });
});

// A SECOND server instance, with an injected fake adapter, hermetically exercises
// /rejudge's flagship behavior (re-judge resolves a suspect, preserves override,
// recomputes the grade) plus the non-green 400 guard — neither test ever reaches
// getAdapter() or shells out to a live `pi`/`claude` judge process.
describe("review server /rejudge (hermetic, fake adapter)", () => {
  let skillDir2: string;
  let greenRunDir: string;
  let redRunDir: string;
  let base2: string;
  let close2: () => void;
  let judgeCalls = 0;

  const fakeAdapter: HarnessAdapter = {
    name: "pi",
    available: async () => true,
    run: async () => "",
    judge: async () => {
      judgeCalls++;
      return "1. PASS — ok\nVERDICT: PASS\nREASON: fine";
    },
  };

  beforeAll(async () => {
    skillDir2 = mkdtempSync(join(tmpdir(), "sc-serve-rejudge-"));
    mkdirSync(join(skillDir2, "tests"), { recursive: true });
    writeFileSync(join(skillDir2, "tests", "specification.yaml"), SPEC, "utf8");

    // Column 0 (sorts first: "pi-fake" < "pi-fake-red"): a GREEN run with A1
    // flagged suspect by a prior judge pass, plus its green transcript on disk.
    greenRunDir = join(skillDir2, "tests", "results", "pi-fake", "2026-07-03T00-00-00Z");
    mkdirSync(greenRunDir, { recursive: true });
    writeFileSync(join(greenRunDir, "A1.green.txt"), "USER: Say hello.\nASSISTANT: Hi there!", "utf8");
    writeResults(greenRunDir, {
      skill: "golden", harness: "pi", model: "fireworks:fake",
      judge: { provider: "claude-code", model: "opus" },
      timestamp: "2026-07-03T00:00:00Z", label: null, mode: "green",
      scenarios: [{ id: "A1", judge_verdict: "FAIL", judge_reason: "disagreement", suspect: true, override: null, note: "" }],
    }, { shipBar: { total: 1, min_pass: 1, no_critical_fail: true }, critical: ["A1"] });

    // Column 1: a RED-mode run — /rejudge must 400 at the mode guard, before
    // ever looking at the scenario or the adapter.
    redRunDir = join(skillDir2, "tests", "results", "pi-fake-red", "2026-07-03T00-00-00Z");
    mkdirSync(redRunDir, { recursive: true });
    writeResults(redRunDir, {
      skill: "golden", harness: "pi", model: "fireworks:fake",
      judge: { provider: "claude-code", model: "opus" },
      timestamp: "2026-07-03T00:00:00Z", label: null, mode: "red",
      scenarios: [{ id: "A1", judge_verdict: "PASS", judge_reason: "n/a", suspect: false, override: null, note: "" }],
    }, null);

    const s = await serveReview({ skillDir: skillDir2, skillName: "golden", port: 0, open: false, adapter: fakeAdapter });
    base2 = `http://127.0.0.1:${s.port}`;
    close2 = s.close;
  });

  afterAll(() => {
    close2?.();
    rmSync(skillDir2, { recursive: true, force: true });
  });

  test("happy path: re-judge resolves a suspect, preserves override, recomputes the grade", async () => {
    expect(readResults(greenRunDir).effective_grade.ship).toBe(false); // blocked by the unresolved suspect going in

    const before = judgeCalls;
    const r = await fetch(`${base2}/rejudge`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ col: 0, scenarioId: "A1" }),
    });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.ok).toBe(true);
    expect(body.grade.ship).toBe(true);
    expect(judgeCalls).toBe(before + 1); // the fake adapter (not a live process) was actually invoked

    const after = readResults(greenRunDir);
    const a1 = after.scenarios.find((s) => s.id === "A1")!;
    expect(a1.suspect).toBe(false); // suspect cleared by the re-judge
    expect(a1.judge_verdict).toBe("PASS");
    expect(a1.override).toBeNull(); // no override going in — still null coming out
    expect(after.effective_grade.ship).toBe(true); // no longer blocked by the suspect
  });

  test("non-green 400: a red-mode run rejects /rejudge before touching the adapter", async () => {
    const before = judgeCalls;
    const r = await fetch(`${base2}/rejudge`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ col: 1, scenarioId: "A1" }),
    });
    expect(r.status).toBe(400);
    const body = await r.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/only green runs/);
    expect(judgeCalls).toBe(before); // mode guard short-circuits before the adapter is ever used
    expect(readFileSync(join(redRunDir, "results.yaml"), "utf8")).toBeTruthy(); // unchanged run left intact
  });
});

// The spec may define a scenario that this particular run never exercised
// (e.g. added after the run, or scoped out). /rejudge must 404 rather than
// silently no-op after spending a real judge call.
describe("review server assetsDir option", () => {
  test("serveReview honors an explicit assetsDir (real repo assets)", async () => {
    const assetsDir = join(REPO_ROOT, "assets");
    const h = await serveReview({ skillDir, skillName: "golden", port: 0, open: false, assetsDir });
    const r = await fetch(`http://127.0.0.1:${h.port}/`);
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('id="trends-section"');
    h.close();
  });

  // The check above alone isn't discriminating: the default (built-in) template
  // *also* contains id="trends-section", so it would pass even if assetsDir were
  // silently ignored. Prove the option is actually threaded through by pointing
  // at a fixture assetsDir whose template has a marker the built-in one lacks.
  test("serveReview renders from a custom assetsDir, not the built-in default", async () => {
    const customAssetsDir = mkdtempSync(join(tmpdir(), "sc-serve-assets-"));
    const realTemplate = readFileSync(join(REPO_ROOT, "assets", "report.template.html"), "utf8");
    const marker = "<!-- CUSTOM-ASSETS-DIR-MARKER -->";
    writeFileSync(join(customAssetsDir, "report.template.html"), realTemplate + marker, "utf8");
    writeFileSync(
      join(customAssetsDir, "report.grade.js"),
      readFileSync(join(REPO_ROOT, "assets", "report.grade.js"), "utf8"),
      "utf8"
    );

    const h = await serveReview({ skillDir, skillName: "golden", port: 0, open: false, assetsDir: customAssetsDir });
    const r = await fetch(`http://127.0.0.1:${h.port}/`);
    expect(r.status).toBe(200);
    expect(await r.text()).toContain(marker);
    h.close();
    rmSync(customAssetsDir, { recursive: true, force: true });
  });
});

describe("review server /rejudge 404s a scenario not in this run's results", () => {
  const SPEC_WITH_B1 = `
skill: golden
judge_persona: a friendly greeter judge.
ship_bar: { total: 1, min_pass: 1 }
critical: [A1]
scenarios:
  - id: A1
    title: says hello
    turns: ["Say hello."]
    checklist: ["greets the user"]
  - id: B1
    title: says goodbye
    turns: ["Say goodbye."]
    checklist: ["says goodbye"]
`;

  let skillDir3: string;
  let greenRunDir3: string;
  let base3: string;
  let close3: () => void;
  let judgeCalls3 = 0;

  const fakeAdapter3: HarnessAdapter = {
    name: "pi",
    available: async () => true,
    run: async () => "",
    judge: async () => {
      judgeCalls3++;
      return "1. PASS — ok\nVERDICT: PASS\nREASON: fine";
    },
  };

  beforeAll(async () => {
    skillDir3 = mkdtempSync(join(tmpdir(), "sc-serve-rejudge-missing-"));
    mkdirSync(join(skillDir3, "tests"), { recursive: true });
    writeFileSync(join(skillDir3, "tests", "specification.yaml"), SPEC_WITH_B1, "utf8");

    // results.yaml only has A1 — B1 is in the spec but was never run.
    greenRunDir3 = join(skillDir3, "tests", "results", "pi-fake", "2026-07-03T00-00-00Z");
    mkdirSync(greenRunDir3, { recursive: true });
    writeFileSync(join(greenRunDir3, "A1.green.txt"), "USER: Say hello.\nASSISTANT: Hi there!", "utf8");
    writeResults(greenRunDir3, {
      skill: "golden", harness: "pi", model: "fireworks:fake",
      judge: { provider: "claude-code", model: "opus" },
      timestamp: "2026-07-03T00:00:00Z", label: null, mode: "green",
      scenarios: [{ id: "A1", judge_verdict: "PASS", judge_reason: "ok", suspect: false, override: null, note: "" }],
    }, { shipBar: { total: 1, min_pass: 1, no_critical_fail: true }, critical: ["A1"] });

    const s = await serveReview({ skillDir: skillDir3, skillName: "golden", port: 0, open: false, adapter: fakeAdapter3 });
    base3 = `http://127.0.0.1:${s.port}`;
    close3 = s.close;
  });

  afterAll(() => {
    close3?.();
    rmSync(skillDir3, { recursive: true, force: true });
  });

  test("POST /rejudge 404s scenarioId not in this run's results, without calling the judge", async () => {
    const before = judgeCalls3;
    const r = await fetch(`${base3}/rejudge`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ col: 0, scenarioId: "B1" }),
    });
    expect(r.status).toBe(404);
    expect(judgeCalls3).toBe(before); // no judge call spent on a scenario not in this run
  });
});
