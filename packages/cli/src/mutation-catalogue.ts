import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseSpec, planAdjudication, runSkillModel, screenResults, validateResults,
  type HarnessAdapter, type ResultsFile,
} from "@skill-harness/core";
import {
  authenticatePromptObservation, bindPromptObservation, normalizePromptPayload, observeProviderPayload, promptCaptureIsTrusted,
} from "@skill-harness/adapters";

export interface PermanentMutationCase { id: string; detected: boolean; status: "FAIL" | "ERROR"; detail: string }

const h = "a".repeat(64);
const deliveryAssertion = (status: "PASS" | "NOT-MEASURED" | "ERROR" = "PASS") => ({ kind: "skill_delivered", status, detail: status });

function validV3(): ResultsFile {
  return {
    schema: 3, skill: "mutation", harness: "pi", model: "fake:m", judge: { provider: "fake", model: "j" },
    timestamp: "t", label: null, mode: "force", effective_grade: { passed: 1, total: 1, pct: 100, letter: "A", ship: true, note: "" },
    subject_invocations: [{ scenario_id: "A1", repetition: 0, prompt: { capture_version: "prompt-provenance-v1", request_index: 0, raw_sha256: h, normalized_sha256: h, normalization_rule: "cwd-line-v1", bytes: 1, contract_sha256: h, contract_bytes: 1, contract_occurrences: 1, mechanism: "append-system-prompt", status: "PASS" } }],
    scenarios: [{ id: "A1", criterion_count: 1, judge_verdict: "PASS", judge_reason: "ok", suspect: false, override: null, note: "", objective: { status: "PASS", assertions: [deliveryAssertion()] }, rep_judgments: [{ repetition: 0, recorded_verdict: "PASS", objective: { status: "PASS", assertions: [deliveryAssertion()] }, judgments: [{ ordinal: 1, judge: { provider: "fake", model: "j" }, verdict: "PASS", reason: "ok", suspect: false, criteria: [{ index: 1, verdict: "PASS", reason: "ok" }] }] }] }],
  };
}

function catches(id: string, mutate: (result: ResultsFile) => void, detail: string): PermanentMutationCase {
  const result = structuredClone(validV3()); mutate(result);
  let detected = false;
  try { validateResults(result); } catch { detected = true; }
  return { id, detected, status: detected ? "FAIL" : "ERROR", detail };
}

function screenFile(id: string, verdicts: Array<"PASS" | "FAIL">): ResultsFile {
  const result = validV3();
  result.scenarios[0].id = id; result.scenarios[0].reps = verdicts.length;
  result.subject_invocations = verdicts.map((_, repetition) => ({ ...structuredClone(result.subject_invocations![0]), scenario_id: id, repetition }));
  result.scenarios[0].rep_judgments = verdicts.map((verdict, repetition) => ({ repetition, recorded_verdict: verdict, objective: { status: "PASS", assertions: [deliveryAssertion()] }, judgments: [{ ordinal: 1, judge: { provider: "fake", model: "j" }, verdict, reason: verdict, suspect: false, criteria: [{ index: 1, verdict, reason: verdict }] }] }));
  return result;
}

async function objectiveSuppressesJudge(): Promise<PermanentMutationCase> {
  const dir = mkdtempSync(join(tmpdir(), "skill-harness-mutation-delivery-"));
  let judgeCalls = 0;
  try {
    mkdirSync(join(dir, "tests"), { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), "---\nname: mutation\ndescription: fixture\n---\n\n## Contract\nDo it.\n", "utf8");
    const specPath = join(dir, "tests/specification.yaml");
    writeFileSync(specPath, "skill: mutation\njudge_persona: strict\nship_bar: { total: 1, min_pass: 1, no_critical_fail: true }\ncritical: []\nscenarios:\n  - id: A1\n    title: delivery\n    turns: [hi]\n    checklist: [does it]\n", "utf8");
    const spec = parseSpec(readFileSync(specPath, "utf8"), specPath);
    const adapter: HarnessAdapter = {
      name: "pi", observesPrompts: true, available: async () => true,
      run: async req => { req.onPromptObservation?.({ capture_version: "prompt-provenance-v1", request_index: 0, raw_sha256: h, normalized_sha256: h, normalization_rule: "cwd-line-v1", bytes: 1, contract_sha256: h, contract_bytes: 1, contract_occurrences: 0, mechanism: "append-system-prompt", status: "NOT-MEASURED" }); return ">>> USER:\nhi\n\n<<< ASSISTANT:\nanswer\n"; },
      judge: async () => { judgeCalls++; return "VERDICT: PASS\nREASON: wrong"; },
    };
    const out = await runSkillModel({ spec, skillDir: dir, specPath, adapter, model: { provider: "fake", model: "m" }, modelToken: "fake:m", judge: { provider: "fake-judge", model: "j" }, mode: "force", timestamp: "2026-09-04T01:00:00.000Z" });
    const detected = judgeCalls === 0 && out.results.scenarios[0].judge_verdict === "NOT-MEASURED" && out.results.effective_grade.total === 0;
    return { id: "delivery-objective-suppresses-judge", detected, status: detected ? "FAIL" : "ERROR", detail: "undelivered subject must never reach the judge or efficacy denominator" };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** Permanent non-trajectory mutation cases exercised by the free mutation-test command. */
export async function runSelfScreeningMutationCases(): Promise<PermanentMutationCase[]> {
  const contract = "## Contract\nDo it\n";
  const one = observeProviderPayload({ instructions: contract }, contract, "append-system-prompt", 0);
  const forged = { ...one, contract_sha256: "f".repeat(64) };
  const ceiling = screenFile("C", ["PASS", "PASS", "PASS", "PASS", "FAIL"]);
  for (const observation of ceiling.subject_invocations!) observation.prompt = { ...observation.prompt, mechanism: "none", contract_occurrences: 0, status: "PASS" };
  const undelivered = screenFile("U", ["PASS", "PASS"]);
  undelivered.subject_invocations![1].prompt = { ...undelivered.subject_invocations![1].prompt, contract_occurrences: 0, status: "NOT-MEASURED" };
  const suspect = screenFile("S", ["PASS"]); suspect.scenarios[0].rep_judgments![0].judgments[0].suspect = true;

  const cases: PermanentMutationCase[] = [
    catches("schema-v3-missing-observation-rejected", r => { delete (r as { subject_invocations?: unknown }).subject_invocations; }, "schema v3 must reject missing delivery evidence"),
    catches("schema-v3-panel-divergence-rejected", r => { r.scenarios[0].rep_judgments![0].recorded_verdict = "FAIL"; }, "stored panel result must equal recomputed clean votes"),
    catches("schema-v3-missing-criterion-rejected", r => { r.scenarios[0].rep_judgments![0].judgments[0].criteria!.pop(); }, "criterion omissions must remain explicit"),
    catches("schema-v3-per-repetition-objective-rejected", r => { delete (r.scenarios[0].rep_judgments![0] as { objective?: unknown }).objective; }, "aggregate objective cannot hide a repetition"),
    catches("schema-v3-top-level-verdict-rejected", r => { const panel = r.scenarios[0].rep_judgments![0]; panel.judgments[0].verdict = "FAIL"; panel.judgments[0].criteria = panel.judgments[0].criteria!.map(vote => ({ ...vote, verdict: "FAIL" })); panel.recorded_verdict = "FAIL"; }, "top-level verdict must match retained repetition evidence"),
    catches("schema-v3-unsupported-pass-rejected", r => { r.scenarios[0].rep_judgments![0].judgments = []; }, "behavioral PASS requires a retained clean judgment"),
    catches("schema-v3-adjudication-state-rejected", r => { const primary = r.scenarios[0].rep_judgments![0].judgments[0]; r.scenarios[0].adjudication = { repetition: 0, trigger: "ship_deciding", state: "unresolved", judgments: [primary, { ...structuredClone(primary), ordinal: 2 }] }; }, "adjudication state and verdict must match clean votes"),
    { id: "delivery-zero-not-measured", detected: observeProviderPayload({ instructions: "none" }, contract, "append-system-prompt", 0).status === "NOT-MEASURED", status: "FAIL", detail: "zero delivery is not product failure" },
    { id: "delivery-duplicate-not-measured", detected: observeProviderPayload({ instructions: contract + contract }, contract, "append-system-prompt", 0).status === "NOT-MEASURED", status: "FAIL", detail: "duplicate delivery is not valid measurement" },
    { id: "delivery-unobservable-error", detected: observeProviderPayload({}, contract, "append-system-prompt", 0).status === "ERROR", status: "FAIL", detail: "unsupported payload is instrument error" },
    await objectiveSuppressesJudge(),
    { id: "delivery-error-suppresses-adjudication", detected: planAdjudication({ cells: [{ id: "A1", verdict: "ERROR", reason: "instrument", suspect: false, deliveryStatus: "ERROR" }], scenarios: [{ id: "A1", title: "A1", critical: false, mode: "inline", turns: ["x"], checklist: ["y"], workspace: "none", remote: false }], shipBar: { total: 1, min_pass: 1, no_critical_fail: true }, critical: [], tieBreakAvailable: true }).maxAdditionalCalls === 0, status: "FAIL", detail: "instrument delivery ERROR cannot authorize adjudication spend" },
    { id: "observer-normalization-scope", detected: JSON.stringify(normalizePromptPayload({ instructions: "Keep /a\nCurrent working directory: /a\nKeep /a" }, "cwd-line-v1")) === JSON.stringify({ instructions: "Keep /a\nCurrent working directory:<normalized>\nKeep /a" }), status: "FAIL", detail: "normalization changes only the cwd line" },
    { id: "observer-contract-binding", detected: bindPromptObservation(authenticatePromptObservation(forged, "key"), contract, "append-system-prompt", 0, "key").status === "ERROR", status: "FAIL", detail: "child contract identity cannot replace parent binding" },
    { id: "observer-mac-tamper-rejected", detected: bindPromptObservation({ ...authenticatePromptObservation(one, "key"), mac: "0".repeat(64) }, contract, "append-system-prompt", 0, "key").status === "ERROR", status: "FAIL", detail: "complete child observation requires parent authentication" },
    { id: "observer-extension-forgery-rejected", detected: !promptCaptureIsTrusted(1), status: "FAIL", detail: "same-process subject extensions cannot produce trusted provenance" },
    { id: "observer-argv-wiring", detected: promptCaptureIsTrusted(0) && !promptCaptureIsTrusted(1), status: "FAIL", detail: "observer is enabled only on the authenticated extension-free path" },
    { id: "screen-ceiling-boundary", detected: screenResults([ceiling]).scenarios[0].classification === "CEILING", status: "FAIL", detail: "four of five control passes is CEILING" },
    { id: "screen-undelivered-filter", detected: (() => { const row = screenResults([undelivered]).scenarios[0]; return row.treatment.n === 1 && row.not_measured === 1; })(), status: "FAIL", detail: "undelivered reps have a bucket outside efficacy" },
    { id: "screen-suspect-filter", detected: screenResults([suspect]).scenarios[0].control.n === 0, status: "FAIL", detail: "suspect-only panels do not enter rates" },
    { id: "screen-unsupported-pass-filter", detected: (() => { const unsupported = screenFile("P", ["PASS"]); unsupported.scenarios[0].rep_judgments![0].judgments = []; return screenResults([unsupported]).scenarios[0].control.n === 0; })(), status: "FAIL", detail: "recorded PASS without a clean vote does not enter efficacy" },
  ];
  return cases.map(test => ({ ...test, status: test.detected ? "FAIL" : "ERROR" }));
}
