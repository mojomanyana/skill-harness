import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { HarnessAdapter, ModelRef } from "./adapters/types.js";
import { loadSpec, type Spec } from "./spec.js";
import { prepareJudgePrompt, judgeInWorkspace, parseStructuredJudgeReply, type GradeResult } from "./grade.js";
import { loadExecutionFacts, transcriptResponses, unavailableExecution, type TraceIdentity } from "./judge-evidence.js";
import { assertJudgeAllowed } from "./judge-policy.js";
import { rubricDigest } from "./sources.js";
import { resolveJudgeReferences } from "./judge-references.js";
import { withResourceMonitoring } from "./resource-monitor.js";
import { isProcessControlError, throwIfProcessAborted } from "./util/process.js";

export interface CalibrationControl {
  id: string;
  scenarioId: string;
  expected: "PASS" | "FAIL";
  kind: "authored" | "saved" | "equivalent";
  /** Complete production-shaped transcript, including any seeded trailers. Never just its extracted answer. */
  transcript: string;
  rationale: string;
  equivalentTo?: string;
  review: { status: "proposed" | "accepted"; by?: string };
  /** Where the example/expectation came from; a generated expectation remains a proposal until reviewed. */
  provenance?: string;
  /** Required for saved controls: selected original transcript below the spec directory. Preparation hashes it. */
  sourceTranscript?: string;
  trace?: { path: string; sha256: string; fileSha256: string; identity: Omit<TraceIdentity, "scenarioId" | "turns" | "responses"> };
}

interface BoundControl extends CalibrationControl { transcriptSha256: string; rubricSha256: string; sourceTranscriptSha256?: string }
interface CalibrationManifest {
  schema: 1;
  purpose: "judge-calibration";
  specFile: string;
  specSha256: string;
  controls: BoundControl[];
}
export interface LoadedCalibration {
  manifestPath: string;
  manifestSha256: string;
  specDir: string;
  spec: Spec;
  controls: Array<BoundControl & { prompt: string; executionEvidence: "verified" | "unknown" }>;
  /** Calibration judges supplied answers; even a verified trace is not a gate evaluation. */
  calibrationScope: "answer-judge";
  executionGates: "not-evaluated";
  ready: boolean;
  issues: string[];
}
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z][A-Za-z0-9_-]{0,79}$/;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/** Selected artifacts stay beneath the manifest directory, including after symlink resolution. */
function selectedFile(root: string, path: string, limit = 2_097_152): string {
  if (!path || /[\\:\x00-\x1f]/.test(path) || path.startsWith("/") || path.split("/").some(part => !part || part === "." || part === "..")) throw new Error(`Unsafe calibration path: ${path}`);
  const abs = realpathSync(resolve(root, path));
  const rel = relative(realpathSync(root), abs);
  if (isAbsolute(rel) || rel === ".." || rel.startsWith("../") || rel.startsWith("..\\")) throw new Error(`Calibration path escapes its directory: ${path}`);
  const info = statSync(abs);
  if (!info.isFile() || info.size > limit) throw new Error(`Calibration artifact is not a bounded regular file: ${path}`);
  return abs;
}

function validateManifest(manifest: CalibrationManifest, manifestPath: string, manifestSha256: string): LoadedCalibration {
  if (!object(manifest) || manifest.schema !== 1 || manifest.purpose !== "judge-calibration" ||
      typeof manifest.specFile !== "string" || !HASH.test(manifest.specSha256) || !Array.isArray(manifest.controls) ||
      manifest.controls.length < 1 || manifest.controls.length > 100) throw new Error("Invalid judge calibration manifest");
  const specDir = dirname(resolve(manifestPath));
  const specPath = selectedFile(specDir, manifest.specFile);
  if (hash(readFileSync(specPath)) !== manifest.specSha256) throw new Error("Calibration specification changed; prepare and review controls against the new specification");
  const spec = loadSpec(specPath);
  const ids = new Set<string>();
  const issues: string[] = [];
  const controls = manifest.controls.map(control => {
    if (!object(control) || typeof control.id !== "string" || !ID.test(control.id) || ids.has(control.id) ||
        !["PASS", "FAIL"].includes(control.expected) || !["authored", "saved", "equivalent"].includes(control.kind) ||
        typeof control.transcript !== "string" || !control.transcript.trim() || Buffer.byteLength(control.transcript) > 262_144 ||
        typeof control.rationale !== "string" || !control.rationale.trim() || !object(control.review) ||
        !["proposed", "accepted"].includes(control.review.status) ||
        !HASH.test(control.transcriptSha256) || hash(control.transcript) !== control.transcriptSha256 || !HASH.test(control.rubricSha256)) {
      throw new Error(`Invalid calibration control: ${String(control?.id)}`);
    }
    ids.add(control.id);
    const scenario = spec.scenarios.find(s => s.id === control.scenarioId);
    if (!scenario) throw new Error(`Unknown calibration scenario: ${control.scenarioId}`);
    const references = resolveJudgeReferences(scenario, specDir);
    if (rubricDigest(scenario, specDir, references) !== control.rubricSha256) throw new Error(`Calibration reference/rubric changed: ${control.id}`);
    if (control.review.status !== "accepted" || typeof control.review.by !== "string" || !control.review.by.trim()) issues.push(`${control.id}: expected label needs author review`);
    if (control.kind === "saved" && (typeof control.provenance !== "string" || !control.provenance.trim())) throw new Error(`${control.id}: saved evidence needs provenance`);
    if (control.kind === "saved" || control.sourceTranscript !== undefined) {
      if (typeof control.sourceTranscript !== "string" || !control.sourceTranscript || !HASH.test(control.sourceTranscriptSha256 ?? "")) throw new Error(`${control.id}: saved controls need a bound original transcript; use authored for constructed answers`);
      const original = readFileSync(selectedFile(specDir, control.sourceTranscript));
      if (hash(original) !== control.sourceTranscriptSha256 || !original.equals(Buffer.from(control.transcript))) throw new Error(`${control.id}: original saved transcript changed or does not match the control`);
    }
    if (control.kind === "equivalent" && (typeof control.equivalentTo !== "string" || !ID.test(control.equivalentTo))) throw new Error(`${control.id}: equivalent control needs equivalentTo`);
    const responses = transcriptResponses(control.transcript, scenario);
    if (responses === null || responses.length !== scenario.turns.length) throw new Error(`${control.id}: retain the complete production-shaped transcript, not an answer-only reconstruction`);
    const requests = control.transcript.split(/^>>> USER(?: \(turn \d+\/\d+\))?:[ \t]*$/m).slice(1)
      .map(section => section.split(/^<<< ASSISTANT:[ \t]*$/m)[0].trim());
    if (requests.length !== scenario.turns.length || requests.some((request, index) => request !== scenario.turns[index].trim())) throw new Error(`${control.id}: transcript user turns do not match the scenario`);
    if (scenario.mode === "seeded" && (!control.transcript.includes("=== SEEDED GATES ===") || !control.transcript.includes("=== STAGED DIFF ==="))) {
      throw new Error(`${control.id}: seeded calibration must retain gates and staged-diff framing`);
    }
    let execution = unavailableExecution("This control has no bound execution trace; evaluate its supplied response/reference only.");
    if (control.trace !== undefined) {
      const trace = control.trace;
      if (!object(trace) || typeof trace.path !== "string" || !HASH.test(trace.fileSha256) || !HASH.test(trace.sha256) || !object(trace.identity) ||
          !["red", "green", "force"].includes(trace.identity.mode) || !Number.isSafeInteger(trace.identity.repetition) || trace.identity.repetition < 0) throw new Error(`${control.id}: invalid trace binding`);
      const path = selectedFile(specDir, trace.path);
      if (hash(readFileSync(path)) !== trace.fileSha256) throw new Error(`${control.id}: trace bytes changed`);
      execution = loadExecutionFacts(path, { ...trace.identity, scenarioId: scenario.id, turns: scenario.turns.length, responses }, trace.sha256);
      if (execution.status !== "verified" || execution.coverage !== "complete") throw new Error(`${control.id}: execution evidence ERROR: ${execution.reason}`);
    }
    const scope = control.kind === "saved"
      ? "This is a selected saved answer. Only the separately verified execution facts establish observed execution."
      : "This is an authored answer control. Any supplied code, staged diff, test output or gate trailer is synthetic control material, not evidence that the subject executed it.";
    const prompt = prepareJudgePrompt({ skill: spec.skill, persona: spec.judge_persona, scenario, transcript: control.transcript, execution, references }, specDir) +
      `\nCALIBRATION SCOPE (trusted harness metadata):\n${scope} Assess the supplied response/code against the semantic checklist and references. Tool use, execution and unchanged-file claims remain unverified unless supported by the separate execution facts. This run does not evaluate objective execution gates, even when a trace is verified. Keep the required JSON response format.\n`;
    return { ...control, prompt, executionEvidence: execution.status === "verified" ? "verified" as const : "unknown" as const };
  });
  for (const control of controls.filter(c => c.kind === "equivalent")) {
    const original = controls.find(c => c.id === control.equivalentTo);
    if (!original || original.id === control.id || original.scenarioId !== control.scenarioId || original.expected !== control.expected || original.transcript === control.transcript) throw new Error(`${control.id}: equivalent contrast must target a distinct same-scenario, same-label control`);
  }
  if (!controls.some(c => c.expected === "PASS")) issues.push("Add a supported positive control");
  if (!controls.some(c => c.expected === "FAIL")) issues.push("Add a deliberately incorrect negative control");
  if (!controls.some(c => c.expected === "PASS" && c.kind === "equivalent")) issues.push("Add an equivalent correct answer to detect wording overfit");
  return { manifestPath: resolve(manifestPath), manifestSha256, specDir, spec, controls,
    calibrationScope: "answer-judge", executionGates: "not-evaluated", ready: !issues.length, issues };
}

/** Deterministic authoring helper. Hashes are produced by code, never requested from a model. */
export function prepareCalibration(options: { specPath: string; manifestPath?: string; controls: CalibrationControl[] }): LoadedCalibration {
  const specPath = resolve(options.specPath);
  const specDir = dirname(specPath);
  const manifestPath = resolve(options.manifestPath ?? join(specDir, "calibration.json"));
  if (dirname(manifestPath) !== specDir) throw new Error("Keep calibration.json beside its specification; selected evidence stays below that directory");
  const spec = loadSpec(specPath);
  const manifest: CalibrationManifest = {
    schema: 1, purpose: "judge-calibration", specFile: basename(specPath), specSha256: hash(readFileSync(specPath)),
    controls: options.controls.map(control => {
      const scenario = spec.scenarios.find(s => s.id === control.scenarioId);
      if (!scenario) throw new Error(`Unknown calibration scenario: ${control.scenarioId}`);
      const { id, scenarioId, expected, kind, transcript, rationale, equivalentTo, review, provenance, sourceTranscript, trace } = control;
      return { id, scenarioId, expected, kind, transcript, rationale, equivalentTo, review, provenance, sourceTranscript, trace,
        ...(sourceTranscript ? { sourceTranscriptSha256: hash(readFileSync(selectedFile(specDir, sourceTranscript))) } : {}),
        transcriptSha256: hash(transcript), rubricSha256: rubricDigest(scenario, specDir) };
    }),
  };
  const bytes = JSON.stringify(manifest, null, 2) + "\n";
  if (Buffer.byteLength(bytes) > 4_194_304) throw new Error("Calibration manifest exceeds 4 MiB; select fewer controls");
  const loaded = validateManifest(manifest, manifestPath, hash(bytes));
  writeFileSync(manifestPath, bytes, { flag: "wx", mode: 0o600 });
  return loaded;
}

/** Offline validation only. No Pi, provider access, or result rewrite. */
export function loadCalibration(manifestPath: string): LoadedCalibration {
  const info = statSync(manifestPath);
  if (!info.isFile() || info.size > 4_194_304) throw new Error("Calibration manifest must be a regular file of at most 4 MiB");
  const bytes = readFileSync(manifestPath);
  if (bytes.length > 4_194_304) throw new Error("Calibration manifest exceeds 4 MiB");
  return validateManifest(JSON.parse(bytes.toString("utf8")), manifestPath, hash(bytes));
}

export interface CalibrationReuseSource {
  directory: string;
  manifestSha256: string;
  artifacts: { path: string; sha256: string }[];
}
export interface CalibrationSelection { only?: string[]; reuse?: string[] }
export interface CalibrationPlan {
  schema: 1; purpose: "judge-calibration-plan"; manifestSha256: string; judge: ModelRef;
  calibrationScope: "answer-judge"; executionGates: "not-evaluated";
  availableCases: number; cases: number; partial: boolean; ready: boolean; issues: string[]; notes: string[];
  judgeCallsPlanned: number; reused: number;
  controls: { id: string; action: "judge" | "reuse"; source?: CalibrationReuseSource }[];
}

/** Explicitly selected prior evidence only: no directory discovery and no model calls. */
function calibrationPlan(loaded: LoadedCalibration, options: CalibrationSelection & { judge: ModelRef }) {
  const current = loadCalibration(loaded.manifestPath);
  if (current.manifestSha256 !== loaded.manifestSha256) throw new Error("Calibration changed after validation");
  if (options.only && (!options.only.length || new Set(options.only).size !== options.only.length ||
      options.only.some(id => !current.controls.some(control => control.id === id)))) throw new Error("Select distinct existing calibration control IDs");
  if ((options.reuse?.length ?? 0) > 20) throw new Error("Select at most 20 prior calibration directories");
  const selected = current.controls.filter(control => !options.only || options.only.includes(control.id));
  const plan: CalibrationPlan = {
    schema: 1, purpose: "judge-calibration-plan", manifestSha256: current.manifestSha256, judge: options.judge,
    calibrationScope: "answer-judge", executionGates: "not-evaluated", availableCases: current.controls.length,
    cases: selected.length, partial: selected.length !== current.controls.length, ready: current.ready,
    issues: [...current.issues], notes: [], judgeCallsPlanned: selected.length, reused: 0,
    controls: selected.map(control => ({ id: control.id, action: "judge" })),
  };
  const retained = new Map<string, { result: GradeResult; files: Map<string, Buffer> }>();
  // ModelRef currently has no sampling/settings fields. Unknown future settings must not silently reuse.
  const sameJudge = (value: ModelRef) => value?.provider === options.judge.provider && value?.model === options.judge.model &&
    Object.keys(value).sort().join(",") === "model,provider" && Object.keys(options.judge).sort().join(",") === "model,provider";
  for (const directory of [...new Set(options.reuse ?? [])].map(path => resolve(path))) {
    const evidence: CalibrationReuseSource["artifacts"] = [];
    const files = new Map<string, Buffer>();
    const read = (path: string, limit = 2_097_152): any => {
      const bytes = readFileSync(selectedFile(directory, path, limit));
      evidence.push({ path, sha256: hash(bytes) });
      files.set(path, bytes);
      return JSON.parse(bytes.toString("utf8"));
    };
    const inputs = read("inputs.json", 33_554_432), summary = read("summary.json");
    if (summary.schema !== 1 || summary.purpose !== "judge-calibration" || !HASH.test(summary.manifestSha256) ||
        summary.manifestSha256 !== inputs.manifestSha256 || !Array.isArray(inputs.controls) || inputs.controls.length > 100 ||
        !["matched", "mismatch", "error"].includes(summary.status) ||
        !Array.isArray(summary.errors) || !Array.isArray(summary.unrun)) throw new Error(`Invalid prior calibration evidence: ${directory}`);
    if (!sameJudge(inputs.judge) || !sameJudge(summary.judge)) {
      plan.notes.push(`${directory}: different judge; no results reused`); continue;
    }
    const common = evidence.slice();
    for (const control of selected) {
      const prior = inputs.controls.find((candidate: BoundControl) => candidate.id === control.id);
      if (!prior || summary.errors.includes(control.id) || summary.unrun.includes(control.id)) continue;
      if (prior.scenarioId !== control.scenarioId || prior.expected !== control.expected || prior.prompt !== control.prompt ||
          prior.transcript !== control.transcript || prior.transcriptSha256 !== control.transcriptSha256 ||
          prior.rubricSha256 !== control.rubricSha256 || prior.review?.status !== "accepted" || !prior.review.by?.trim()) continue;
      evidence.length = 0; evidence.push(...common);
      files.clear();
      const request = read(`${control.id}.request.json`), result = read(`${control.id}.result.json`);
      if (request.prompt !== control.prompt || request.sha256 !== hash(control.prompt) || result.expected !== control.expected ||
          result.judgeFormat !== "json" || typeof result.raw !== "string" || !Array.isArray(result.rawReplies) ||
          result.rawReplies.length < 1 || result.rawReplies.length > 2 || !Array.isArray(result.prompts) ||
          result.prompts.length !== result.rawReplies.length || result.prompts[0] !== control.prompt ||
          result.raw !== result.rawReplies.at(-1)) throw new Error(`Invalid prior control evidence: ${control.id} in ${directory}`);
      for (let index = 0; index < result.rawReplies.length; index++) {
        const sent = read(`${control.id}.attempt-${index + 1}.request.json`);
        const reply = read(`${control.id}.attempt-${index + 1}.reply.json`);
        if (typeof result.rawReplies[index] !== "string" || typeof result.prompts[index] !== "string" ||
            sent.prompt !== result.prompts[index] || sent.sha256 !== hash(sent.prompt) ||
            reply.reply !== result.rawReplies[index] || reply.sha256 !== hash(reply.reply)) throw new Error(`Prior request/reply changed: ${control.id} in ${directory}`);
      }
      const scenario = current.spec.scenarios.find(scenario => scenario.id === control.scenarioId)!;
      if (result.prompts.length === 2) {
        let validationError: string | undefined;
        try { parseStructuredJudgeReply(result.rawReplies[0], scenario.checklist.length); }
        catch (error) { validationError = (error as Error).message; }
        // Bind the validation-guided retry as well as the initial request; arbitrary follow-ups are not equivalent.
        const retry = `${control.prompt}\n\nYour reply was not valid: ${JSON.stringify(validationError)}; reply with only the JSON object.`;
        if (validationError === undefined || /^\[judge error:/i.test(result.rawReplies[0].trim()) || result.prompts[1] !== retry) {
          throw new Error(`Prior retry prompt is not equivalent: ${control.id} in ${directory}`);
        }
      }
      const parsed = parseStructuredJudgeReply(result.raw, scenario.checklist.length);
      const consistent = parsed.verdict === "PASS" ? parsed.criteria.every(vote => vote.verdict === "PASS") : parsed.criteria.some(vote => vote.verdict === "FAIL");
      if (result.suspect || !consistent || parsed.verdict !== result.verdict || parsed.reason !== result.reason ||
          JSON.stringify(parsed.criteria) !== JSON.stringify(result.criteria)) throw new Error(`Invalid prior judgment: ${control.id} in ${directory}`);
      if (retained.has(control.id) && retained.get(control.id)!.result.verdict !== result.verdict) {
        plan.issues.push(`${control.id}: prior judgments disagree; inspect them or select a fresh run explicitly`);
        continue;
      }
      if (!retained.has(control.id)) {
        // Freeze the exact selected records now; later writes cannot substitute changed source bytes.
        retained.set(control.id, { result, files: new Map(files) });
        const row = plan.controls.find(row => row.id === control.id)!;
        row.action = "reuse"; row.source = { directory, manifestSha256: summary.manifestSha256, artifacts: evidence.slice() };
      }
    }
  }
  plan.reused = retained.size;
  plan.judgeCallsPlanned -= retained.size;
  plan.ready = plan.issues.length === 0;
  return { current, selected, plan, retained };
}

/** Preview eligible historical judgments. Reuse is not a fresh stability measurement. */
export function planCalibration(loaded: LoadedCalibration, options: CalibrationSelection & { judge: ModelRef }): CalibrationPlan {
  return calibrationPlan(loaded, options).plan;
}

export interface CalibrationSummary {
  schema: 1; purpose: "judge-calibration"; modelQualityScore: false;
  manifestSha256: string; judge: ModelRef; cases: number; completed: number; matched: number; judgeCalls: number;
  status: "matched" | "mismatch" | "error";
  calibrationScope: "answer-judge"; executionGates: "not-evaluated"; availableCases: number; partial: boolean;
  disagreements: { id: string; expected: "PASS" | "FAIL"; observed: "PASS" | "FAIL" }[];
  reused: { id: string; source: CalibrationReuseSource }[];
  /** Legacy direction aliases for label disagreements, not adjudicated judge errors. */
  falsePasses: string[]; falseFailures: string[]; errors: string[]; unrun: string[]; output: string;
}

/** Explicit Pi-backed judging; semantic mismatches continue, infrastructure errors stop the remaining calls. */
export async function runCalibration(loaded: LoadedCalibration, options: {
  adapter: HarnessAdapter; judge: ModelRef; output: string; allowMeteredJudge?: boolean;
  only?: string[]; reuse?: string[];
  onProgress?: (progress: { id: string; index: number; total: number }) => void;
}): Promise<CalibrationSummary> {
  const { current, selected, plan, retained } = calibrationPlan(loaded, options);
  if (!plan.ready) throw new Error(`Calibration is not ready: ${plan.issues.join("; ")}`);
  if (options.adapter.name !== "pi") throw new Error("Calibration requires Pi; direct provider adapters are unsupported");
  assertJudgeAllowed(options.judge, { source: "calibration judge", allowMetered: options.allowMeteredJudge });
  if (plan.judgeCallsPlanned && !await options.adapter.available()) throw new Error("Pi is unavailable; no judge calls made");
  const output = resolve(options.output);
  mkdirSync(output, { mode: 0o700 }); // exclusive new directory, including when a previous run was interrupted
  return withResourceMonitoring(output, async () => {
  throwIfProcessAborted();
  const save = (name: string, value: unknown) => writeFileSync(join(output, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  save("inputs.json", { manifestSha256: current.manifestSha256, judge: options.judge, controls: selected });
  save("plan.json", plan);
  const summary: CalibrationSummary = {
    schema: 1, purpose: "judge-calibration", modelQualityScore: false, manifestSha256: current.manifestSha256,
    judge: options.judge, cases: selected.length, completed: 0, matched: 0, judgeCalls: 0,
    calibrationScope: "answer-judge", executionGates: "not-evaluated", availableCases: current.controls.length,
    partial: plan.partial, disagreements: [], reused: [],
    status: "matched", falsePasses: [], falseFailures: [], errors: [], unrun: [], output,
  };
  for (const [index, control] of selected.entries()) {
    throwIfProcessAborted();
    const scenario = current.spec.scenarios.find(s => s.id === control.scenarioId)!;
    let attempt = 0;
    const observedAdapter: HarnessAdapter = {
      name: "pi", available: () => options.adapter.available(), run: request => options.adapter.run(request),
      judge: async request => {
        throwIfProcessAborted();
        const number = ++attempt;
        save(`${control.id}.attempt-${number}.request.json`, { prompt: request.prompt, sha256: hash(request.prompt) });
        summary.judgeCalls++;
        const reply = await options.adapter.judge(request);
        save(`${control.id}.attempt-${number}.reply.json`, { reply, sha256: hash(reply) });
        throwIfProcessAborted();
        return reply;
      },
    };
    let result: GradeResult;
    try {
      const prior = retained.get(control.id);
      if (prior) {
        const source = plan.controls.find(row => row.id === control.id)!.source!;
        result = prior.result;
        // Historical records remain byte-identical and self-contained, never counted as fresh calls.
        for (const [name, bytes] of prior.files) writeFileSync(join(output, name), bytes, { flag: "wx", mode: 0o600 });
        save(`${control.id}.reuse.json`, source);
        summary.reused.push({ id: control.id, source });
      } else {
        save(`${control.id}.request.json`, { prompt: control.prompt, sha256: hash(control.prompt) });
        options.onProgress?.({ id: control.id, index, total: selected.length });
        result = await judgeInWorkspace(observedAdapter, options.judge, control.prompt, current.specDir, scenario.checklist.length);
      }
    } catch (error) {
      if (isProcessControlError(error)) throw error;
      throwIfProcessAborted();
      save(`${control.id}.error.json`, { status: "ERROR", message: String(error) });
      summary.errors.push(control.id);
      summary.unrun = selected.slice(index + 1).map(c => c.id);
      break;
    }
    if (!retained.has(control.id)) save(`${control.id}.result.json`, { expected: control.expected, ...result });
    if ((result.verdict !== "PASS" && result.verdict !== "FAIL") || result.suspect) {
      summary.errors.push(control.id);
      summary.unrun = selected.slice(index + 1).map(c => c.id);
      break;
    }
    summary.completed++;
    if (result.verdict === control.expected) summary.matched++;
    else {
      summary.disagreements.push({ id: control.id, expected: control.expected, observed: result.verdict });
      if (result.verdict === "PASS") summary.falsePasses.push(control.id);
      else summary.falseFailures.push(control.id);
    }
  }
  summary.status = summary.errors.length ? "error" : summary.matched === summary.cases ? "matched" : "mismatch";
  save("summary.json", summary);
  return summary;
  });
}
