import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { QUALIFIED_PI_VERSIONS, mergeTraces, parseTrace, piQualification, piQualificationFailure, traceSha256 } from "../src/execution-trace.js";
import { readResults, writeResults, type ResultsDraft } from "../src/results.js";
import { rescoreRun } from "../src/rescore.js";
import { runSummaryLines } from "../src/run-summary.js";
import { formatScorecard } from "../src/run.js";
import { parseSpec } from "../src/spec.js";

// Owner decision: a later patch of a qualified minor passes, flagged; a new minor
// still needs an explicit entry. Cases are written against this list.
const REFUSAL = "is unqualified; execution requires qualified Pi 1.0.4 or 1.1.0 or 1.4.0 or 1.5.0 or 1.5.2 or 1.6.0, or a later patch of the newest listed release in its minor";
const PATCH = { status: "patch" as const, qualified_version: "1.5.2" };
const NOTE = "Pi 1.5.3: patch of qualified 1.5.x (qualified: 1.5.2)";

describe("Pi qualification rule", () => {
  it("is pinned to the list these cases were written for", () => {
    expect([...QUALIFIED_PI_VERSIONS]).toEqual(["1.0.4", "1.1.0", "1.4.0", "1.5.0", "1.5.2", "1.6.0"]);
  });

  it.each(["1.0.4", "1.1.0", "1.4.0", "1.5.0", "1.5.2", "1.6.0"])("exactly listed %s is qualified", (version) => {
    expect(piQualification(version)).toEqual({ status: "exact" });
    expect(piQualificationFailure(version)).toBeNull();
  });

  it.each([
    ["1.5.3", "1.5.2"], // rides on the highest listed patch of 1.5, not 1.5.0
    ["1.5.10", "1.5.2"], // numeric, not text order
    ["1.6.1", "1.6.0"],
    ["1.7.0", "1.6.0"], // forward-compatible newer 1.x minor
    ["1.0.5", "1.0.4"],
    ["1.1.1", "1.1.0"],
    ["1.4.1", "1.4.0"],
  ])("higher patch/minor %s passes, flagged as riding on %s", (version, qualified) => {
    expect(piQualification(version)).toEqual({ status: "patch", qualified_version: qualified });
    expect(piQualificationFailure(version)).toBeNull();
  });

  it.each([
    ["lower unlisted patch", "1.5.1"],
    ["lower patch than the only listed one", "1.0.3"],
    ["unlisted minor between listed ones", "1.3.9"],
    ["new major", "2.0.0"],
    ["new major with a listed minor", "2.5.3"],
    ["prerelease", "1.5.3-beta.1"],
    ["prerelease of a listed version", "1.5.2-rc.1"],
    ["build metadata", "1.5.3+x"],
    ["prerelease and build metadata", "1.5.3-beta.1+x"],
    ["two components", "1.5"],
    ["four components", "1.5.3.1"],
    ["prefix", "v1.5.3"],
    ["leading zero", "1.5.03"],
    ["whitespace", " 1.5.3"],
    ["trailing newline", "1.5.3\n"],
    ["beyond exact integers", "1.5.9007199254740993"],
    ["empty", ""],
    ["words", "unknown"],
  ])("%s %j is unqualified", (_name, version) => {
    expect(piQualification(version)).toEqual({ status: "unqualified", reason: `Pi ${version} ${REFUSAL}` });
    expect(piQualificationFailure(version)).toBe(`Pi ${version} ${REFUSAL}`);
  });

  it("a missing version is unqualified", () => {
    expect(piQualificationFailure(null)).toBe(`Pi (version unavailable) ${REFUSAL}`);
  });
});

describe("the flag on a trace", () => {
  const meta = { subject: { provider: "fixture", model: "scripted" }, scenarioId: "S1", mode: "force" as const, rep: 0, turn: 0 };
  const answer = JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "answer" }], stopReason: "stop" } });
  const settled = JSON.stringify({ type: "agent_settled" });

  it("records a settled patch run as complete and flagged, inside the digest", () => {
    const { trace, isComplete } = parseTrace([answer, settled], { ...meta, piVersion: "1.5.3" });
    expect(isComplete).toBe(true);
    expect(trace).toMatchObject({ pi_version: "1.5.3", pi_qualification: PATCH, final_status: "complete" });
    expect(trace.capture_errors).toBeUndefined();
    const { pi_qualification: _flag, ...unflagged } = trace;
    expect(traceSha256(unflagged)).not.toBe(trace.trace_sha256);
    const second = parseTrace([answer, settled], { ...meta, piVersion: "1.5.3", turn: 1 }).trace;
    expect(mergeTraces([trace, second])?.pi_qualification).toEqual(PATCH);
  });

  it("holds a patch run to the same settlement contract", () => {
    const { trace, isComplete } = parseTrace([answer], { ...meta, piVersion: "1.5.3" });
    expect(isComplete).toBe(false);
    expect(trace.final_status).toBe("incomplete");
  });

  it.each(["1.5.2", "1.5.1", "1.6.0", "1.5.3+x", null, "0.83.0"])("writes no flag for Pi %s", (piVersion) => {
    const { trace } = parseTrace([answer, settled], { ...meta, piVersion });
    expect(trace).not.toHaveProperty("pi_qualification");
  });
});

describe("the flag on results.yaml and the run summary", () => {
  const dirs: string[] = [];
  afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
  const tmp = () => { const dir = mkdtempSync(join(tmpdir(), "sh-pi-patch-")); dirs.push(dir); return dir; };
  const ctx = { shipBar: { total: 1, min_pass: 1 }, critical: [] };
  const draft = (over: Partial<ResultsDraft> = {}): ResultsDraft => ({
    skill: "demo", harness: "pi", harness_cli_version: "1.5.3", harness_cli_qualification: PATCH,
    model: "fixture:subject", judge: { provider: "local", model: "judge" },
    timestamp: "2026-11-14T00:00:00Z", label: null, mode: "force",
    scenarios: [{ id: "A1", judge_verdict: "PASS", judge_reason: "greets", suspect: false, override: null, note: "" }],
    ...over,
  });
  /** What skill-harness 0.35.6 wrote for a run, before the flag existed. */
  const recordedBefore = (version: string) => `schema: 2
harness_version: 0.35.6
harness_cli_version: ${version}
skill: demo
harness: pi
model: fixture:subject
judge:
  provider: local
  model: judge
timestamp: '2026-11-14T00:00:00Z'
label: null
mode: force
effective_grade:
  passed: 1
  total: 1
  pct: 100
  letter: A
  ship: true
  note: ''
scenarios:
  - id: A1
    judge_verdict: PASS
    judge_reason: greets
    suspect: false
    override: null
    note: ''
`;
  /** runSummaryLines output of 0.35.6 for that record. */
  const SUMMARY_BEFORE = [
    "Subject requested: fixture:subject [thinking unspecified]; observed: unknown; effective thinking: unknown",
    "Judge requested: local:judge [thinking unspecified]; observed: unknown; effective thinking: unknown",
    "Effective outcomes: 1 PASS, 0 FAIL, 0 ERROR, 0 UNGRADED, 0 NOT-MEASURED, 0 JUDGE-AMBIGUOUS. Additional flags: 0 suspect, 0 overrides; 0 recorded execution/evidence errors.",
    "Token coverage: 0 retained subject invocation records (total unknown); 0/unknown retained judge-attempt records. Counter subtotals/coverage: diagnose --format json. Costs remain separate.",
    "Evidence/reuse: diagnose before rerunning; retained evidence is not a fresh trial; actual provider request totals remain unknown.",
  ];

  it("writes the flag beside the version, reads it back and shows it first in the summary and scorecard", () => {
    const dir = tmp();
    writeResults(dir, draft(), ctx);
    expect(readFileSync(join(dir, "results.yaml"), "utf8"))
      .toContain("harness_cli_version: 1.5.3\nharness_cli_qualification:\n  status: patch\n  qualified_version: 1.5.2\nskill: demo\n");
    const read = readResults(dir);
    expect(read.harness_cli_qualification).toEqual(PATCH);
    expect(runSummaryLines(read)).toEqual([NOTE, ...SUMMARY_BEFORE]);
    expect(formatScorecard({ results: read, runDir: dir }).split("\n").slice(0, 3))
      .toEqual(["── demo · pi · fixture:subject ──", NOTE, SUMMARY_BEFORE[0]]);
  });

  it.each(["1.5.2", "1.5.3", "0.83.0"])("reads a pre-flag record of Pi %s exactly as before, and a rewrite adds no flag", (version) => {
    const dir = tmp();
    writeFileSync(join(dir, "results.yaml"), recordedBefore(version), "utf8");
    const read = readResults(dir);
    expect(read).not.toHaveProperty("harness_cli_qualification");
    expect(runSummaryLines(read)).toEqual(SUMMARY_BEFORE);
    rescoreRun({ runDir: dir, spec: parseSpec("skill: demo\njudge_persona: j\nship_bar: { total: 1, min_pass: 1 }\nscenarios:\n  - id: A1\n    title: t\n    turns: ['hi']\n    checklist: ['says hello']\n", join(dir, "specification.yaml")) });
    expect(readFileSync(join(dir, "results.yaml"), "utf8")).not.toContain("harness_cli_qualification");
  });

  it.each([
    ["an exact status", { status: "exact", qualified_version: "1.5.2" }, "1.5.3"],
    ["no release to ride on", { status: "patch" }, "1.5.3"],
    ["an extra key", { ...PATCH, exact: true }, "1.5.3"],
    ["null", null, "1.5.3"],
    ["the same release", PATCH, "1.5.2"],
    ["a lower patch", PATCH, "1.5.1"],
    ["another minor", PATCH, "1.6.3"],
    ["a prerelease beside it", PATCH, "1.5.3-beta.1"],
    ["no recorded version", PATCH, undefined],
  ])("refuses a flag with %s on write and on read", (_name, flag, version) => {
    const message = "invalid harness_cli_qualification: expected status patch and a qualified_version below harness_cli_version in the same minor";
    expect(() => writeResults(tmp(), draft({ harness_cli_version: version, harness_cli_qualification: flag as never }), ctx)).toThrow(message);
    const dir = tmp();
    const stored = recordedBefore(version ?? "x").replace(version === undefined ? "harness_cli_version: x\n" : "", "")
      .replace("skill: demo\n", `harness_cli_qualification: ${JSON.stringify(flag)}\nskill: demo\n`);
    writeFileSync(join(dir, "results.yaml"), stored, "utf8");
    expect(() => readResults(dir)).toThrow(message);
  });
});
