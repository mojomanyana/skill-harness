import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { readAuthoring } from "./authoring.js";
import { loadCalibration, prepareCalibration, type LoadedCalibration } from "./calibration.js";
import { resolveJudgeReferences } from "./judge-references.js";
import { parseSpec } from "./spec.js";
import { fixtureInventory, hashFixtureFile } from "./util/fixture-inventory.js";

export interface AuthoringTaskContractSelection {
  root: string; name: string; specPath: string;
  /** Explicitly selected method text; selection alone does not make it compulsory. */
  methodFiles?: string[];
  /** Explicit source data, never task authority by itself. No directory discovery. */
  sourceFiles?: string[];
}
export interface AuthoringContractSource {
  id: string; kind: "brief" | "task" | "method" | "source"; text: string; scenarioId?: string;
}
export interface AuthoringContractObligation {
  id: string; scenarioId: string; kind: "task" | "explicit-method" | "derived";
  anchors: { sourceId: string; quote: string }[];
  /** The author's explanation, not a code-verified entailment claim. */
  rationale: string;
}
export interface AuthoringCriterionJustification {
  scenarioId: string; criterionIndex: number; obligationIds: string[];
  materiality: string; status: "justified" | "unresolved";
}
export interface AuthoringMinimalAlternative {
  controlId: string;
  criteria: { scenarioId: string; criterionIndex: number }[];
  /** May state none found, with a concrete explanation in rationale. */
  omittedOptional: string; rationale: string;
}
export interface AuthoringTaskContract {
  schema: 1; purpose: "authoring-task-contract";
  selection: AuthoringTaskContractSelection; inputSha256: string;
  sources: AuthoringContractSource[]; scenarioIds: string[];
  bindings: { path: string; sha256: string }[];
}
export interface AuthoringTaskContractRecord extends AuthoringTaskContract {
  obligations: AuthoringContractObligation[];
}
export interface AuthoringContractReviewRecord {
  schema: 1; purpose: "authoring-contract-review"; root: string; name: string;
  taskPath: string; taskSha256: string; manifestPath: string; manifestSha256: string;
  criteria: AuthoringCriterionJustification[]; alternatives: AuthoringMinimalAlternative[];
  summary: string;
}
export interface AuthoringContractReviewSelection {
  root: string; name: string; manifestPath: string; reviewPath: string;
}
interface Acceptance { manifestPath: string; manifestSha256: string }
export interface AuthoringContractReviewInspection {
  status: "current" | "stale" | "missing" | "invalid"; issues: string[];
  record?: AuthoringContractReviewRecord; task?: AuthoringTaskContractRecord;
  reviewSha256?: string; acceptance?: Acceptance;
  mechanicalChecksOnly: true;
}
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const encode = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const LIMIT = 2_097_152;
const ID = /^[A-Za-z][A-Za-z0-9_-]{0,79}$/;

function assertAcceptedProposal(original: LoadedCalibration, accepted: LoadedCalibration, by: string): void {
  const proposal = (controls: LoadedCalibration["controls"]) => controls.map(({ review: _review, ...control }) => control);
  if (accepted.specDir !== original.specDir || encode(accepted.spec) !== encode(original.spec)
    || encode(proposal(accepted.controls)) !== encode(proposal(original.controls))
    || accepted.controls.some(c => c.review.status !== "accepted" || c.review.by !== by)) {
    throw new Error("Accepted calibration evidence does not match the reviewed proposal and operator attribution");
  }
}

function noLinks(path: string): void {
  for (let p = resolve(path); ; p = dirname(p)) {
    try { if (lstatSync(p).isSymbolicLink()) throw new Error(`Contract review does not follow symlinks: ${p}`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (dirname(p) === p) break;
  }
}
function selectedText(path: string): string {
  noLinks(path);
  const info = lstatSync(path);
  if (!info.isFile() || info.size > LIMIT) throw new Error(`Contract input must be a bounded regular file: ${path}`);
  const bytes = readFileSync(path);
  if (bytes.length > LIMIT) throw new Error("Contract input grew beyond its size limit");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (text.includes("\0")) throw new Error(`Contract input is not text: ${path}`);
  return text;
}
function recordDir(root: string, name: string): string {
  // Authoring validates the project identity and all destination ancestry.
  const state = readAuthoring(root, name);
  return join(state.root, ".skill-harness", "authoring", state.name, "contract-review");
}
function saveRecord(root: string, name: string, prefix: string, record: unknown): string {
  const text = encode(record);
  if (Buffer.byteLength(text) > 4 * LIMIT) throw new Error("Contract review record exceeds 8 MiB");
  const dir = recordDir(root, name), path = join(dir, `${prefix}-${hash(text)}.json`);
  noLinks(path);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { writeFileSync(path, text, { flag: "wx", mode: 0o600 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST" || readRecordText(path) !== text) throw error;
  }
  return path;
}
function readRecordText(path: string): string {
  noLinks(path);
  const info = lstatSync(path);
  if (!info.isFile() || info.size > 4 * LIMIT) throw new Error("Invalid contract review record size");
  const bytes = readFileSync(path);
  if (bytes.length > 4 * LIMIT) throw new Error("Contract record grew beyond its size limit");
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
function readRecord<T>(root: string, name: string, path: string, prefix: string): { record: T; sha256: string } {
  const absolute = resolve(root, path);
  if (dirname(absolute) !== recordDir(root, name)) throw new Error("Select this project's retained contract record");
  const text = readRecordText(absolute), sha256 = hash(text);
  if (basename(absolute) !== `${prefix}-${sha256}.json`) throw new Error("Contract review record identity changed");
  return { record: JSON.parse(text) as T, sha256 };
}

/** Inspect only selected task inputs, never return the checklist, preferred answers or labels. */
export function inspectAuthoringTaskContract(options: AuthoringTaskContractSelection): AuthoringTaskContract {
  const state = readAuthoring(options.root, options.name);
  const paths = (items: string[] = []) => {
    if (!Array.isArray(items) || items.length > 16 || items.some(p => !nonempty(p))) throw new Error("Select at most 16 explicit contract files per kind");
    const selected = items.map(p => resolve(state.root, p));
    if (new Set(selected).size !== selected.length) throw new Error("Duplicate contract file selection");
    return selected;
  };
  const selection = { root: state.root, name: state.name, specPath: resolve(state.root, options.specPath),
    methodFiles: paths(options.methodFiles), sourceFiles: paths(options.sourceFiles) };
  const bindings: AuthoringTaskContract["bindings"] = [];
  let total = 0;
  const bind = (path: string) => {
    const text = selectedText(path); total += Buffer.byteLength(text);
    if (total > 4 * LIMIT) throw new Error("Selected contract inputs exceed 8 MiB");
    if (!bindings.some(b => b.path === path)) bindings.push({ path, sha256: hash(text) });
    return text;
  };
  const spec = parseSpec(bind(selection.specPath), selection.specPath);
  if (spec.skill !== state.name) throw new Error("Specification does not belong to this authoring project");
  const sources: AuthoringContractSource[] = [{ id: "brief", kind: "brief", text: encode({ idea: state.idea, answers: state.answers }) }];
  for (const scenario of spec.scenarios) {
    scenario.turns.forEach((text, index) => sources.push({ id: `task:${scenario.id}:${index}`, kind: "task", scenarioId: scenario.id, text }));
    // Judge references affect freshness, but are intentionally absent from the task-first view.
    for (const reference of resolveJudgeReferences(scenario, dirname(selection.specPath))) bind(resolve(dirname(selection.specPath), reference.file));
    if (scenario.systemPromptFile) bind(resolve(dirname(selection.specPath), scenario.systemPromptFile));
    const fixture = typeof scenario.workspace === "object" ? scenario.workspace.fixture : scenario.fixture;
    if (fixture) {
      const path = resolve(dirname(selection.specPath), fixture);
      if (!bindings.some(b => b.path === path)) {
        noLinks(path);
        const digest = createHash("sha256");
        for (const file of fixtureInventory(path)) {
          noLinks(file.path);
          total += file.size;
          if (total > 4 * LIMIT) throw new Error("Selected contract inputs exceed 8 MiB");
          digest.update(file.relative).update("\0"); hashFixtureFile(digest, file); digest.update("\0");
        }
        bindings.push({ path, sha256: digest.digest("hex") });
      }
    }
  }
  const skill = join(state.skillDir, "SKILL.md");
  if (existsSync(skill)) bind(skill);
  for (const [kind, files] of [["method", selection.methodFiles], ["source", selection.sourceFiles]] as const) {
    for (const path of files) sources.push({ id: `${kind}:${path}`, kind, text: bind(path) });
  }
  const projection = { selection, sources, bindings, scenarioIds: spec.scenarios.map(s => s.id) };
  return { schema: 1, purpose: "authoring-task-contract", ...projection, inputSha256: hash(encode(projection)) };
}

function validateObligations(task: AuthoringTaskContract, obligations: AuthoringContractObligation[]): void {
  if (!Array.isArray(obligations) || !obligations.length || obligations.length > 1000) throw new Error("Record bounded task obligations before reviewing controls");
  const ids = new Set<string>();
  for (const obligation of obligations) {
    if (!obligation || !ID.test(obligation.id) || ids.has(obligation.id) || !task.scenarioIds.includes(obligation.scenarioId)
      || !["task", "explicit-method", "derived"].includes(obligation.kind) || !nonempty(obligation.rationale)
      || !Array.isArray(obligation.anchors) || !obligation.anchors.length || obligation.anchors.length > 32) throw new Error("Invalid or duplicate task obligation");
    ids.add(obligation.id);
    const anchors = obligation.anchors.map(anchor => {
      const source = task.sources.find(s => s.id === anchor.sourceId);
      if (!source || !nonempty(anchor.quote) || !source.text.includes(anchor.quote)
        || (source.scenarioId && source.scenarioId !== obligation.scenarioId)) throw new Error(`${obligation.id}: quote or scenario does not match selected source`);
      return source;
    });
    if (!anchors.some(s => s.kind === "brief" || s.kind === "task")) throw new Error(`${obligation.id}: source or method text alone cannot authorize a task obligation`);
    if (obligation.kind === "explicit-method" && !anchors.some(s => s.kind === "method")) throw new Error(`${obligation.id}: explicitly required method needs its selected text and task/brief selection anchor`);
  }
}

function taskIsCurrent(task: AuthoringTaskContractRecord): boolean {
  const { obligations: _obligations, ...projection } = task;
  return encode(inspectAuthoringTaskContract(task.selection)) === encode(projection);
}

/** Retain the task-first reasoning before preparing or inspecting preferred controls. No semantic proof is inferred. */
export function prepareAuthoringTaskContract(options: AuthoringTaskContractSelection & {
  expectedInputSha256: string; obligations: AuthoringContractObligation[];
}): { taskPath: string; task: AuthoringTaskContractRecord; providerCalls: 0 } {
  const current = inspectAuthoringTaskContract(options);
  if (current.inputSha256 !== options.expectedInputSha256) throw new Error("Task inputs changed; inspect them again before retaining obligations");
  validateObligations(current, options.obligations);
  const task = { ...current, obligations: structuredClone(options.obligations) };
  return { taskPath: saveRecord(current.selection.root, current.selection.name, "task", task), task, providerCalls: 0 };
}

function validateReview(record: AuthoringContractReviewRecord, task: AuthoringTaskContractRecord): string[] {
  const loaded = loadCalibration(record.manifestPath);
  if (loaded.manifestSha256 !== record.manifestSha256 || join(loaded.specDir, JSON.parse(readRecordText(record.manifestPath)).specFile) !== task.selection.specPath) throw new Error("Controls or specification changed after contract review");
  if (!Array.isArray(record.criteria) || !Array.isArray(record.alternatives) || !record.alternatives.length || !nonempty(record.summary)) throw new Error("Contract review requires criterion mappings, a minimal valid alternative and a summary");
  const scenarios = loaded.spec.scenarios.filter(s => loaded.controls.some(c => c.scenarioId === s.id));
  const expected = new Set(scenarios.flatMap(s => s.checklist.map((_, index) => `${s.id}:${index}`)));
  const seen = new Set<string>(), issues: string[] = [];
  for (const criterion of record.criteria) {
    const key = `${criterion.scenarioId}:${criterion.criterionIndex}`;
    if (!Number.isInteger(criterion.criterionIndex) || !expected.has(key) || seen.has(key) || !nonempty(criterion.materiality)
      || !["justified", "unresolved"].includes(criterion.status) || !Array.isArray(criterion.obligationIds)
      || !criterion.obligationIds.length || new Set(criterion.obligationIds).size !== criterion.obligationIds.length) throw new Error("Invalid or duplicate criterion mapping");
    seen.add(key);
    for (const id of criterion.obligationIds) if (!task.obligations.some(o => o.id === id && o.scenarioId === criterion.scenarioId)) throw new Error(`${key}: obligation is absent or belongs to another scenario`);
    if (criterion.status === "unresolved") issues.push(`${key}: resolve the author-declared requirement/materiality question before label acceptance`);
  }
  for (const key of expected) if (!seen.has(key)) throw new Error(`Missing blocking criterion mapping: ${key}`);
  for (const alternative of record.alternatives) {
    const control = loaded.controls.find(c => c.id === alternative.controlId);
    if (!control || control.expected !== "PASS" || (control.expectedCriteria && control.expectedCriteria.some(v => v !== "PASS"))
      || !nonempty(alternative.omittedOptional) || !nonempty(alternative.rationale)
      || !Array.isArray(alternative.criteria) || !alternative.criteria.length) throw new Error("Minimal alternative must reference an existing valid PASS control and explain omitted optional steps (or why none apply)");
    for (const item of alternative.criteria) if (!Number.isInteger(item.criterionIndex) || control.scenarioId !== item.scenarioId || !expected.has(`${item.scenarioId}:${item.criterionIndex}`)) throw new Error("Minimal alternative does not match its control's scenario/criterion");
  }
  return issues;
}

export function completeAuthoringContractReview(options: Omit<AuthoringContractReviewSelection & {
  taskPath: string; criteria: AuthoringCriterionJustification[]; alternatives: AuthoringMinimalAlternative[]; summary: string;
}, "reviewPath">): { reviewPath: string; review: AuthoringContractReviewInspection; providerCalls: 0 } {
  const root = resolve(options.root), taskPath = resolve(root, options.taskPath);
  const { record: task, sha256: taskSha256 } = readRecord<AuthoringTaskContractRecord>(root, options.name, taskPath, "task");
  if (task.schema !== 1 || task.purpose !== "authoring-task-contract" || task.selection.root !== root || task.selection.name !== options.name) throw new Error("Task snapshot belongs to another authoring project");
  if (!taskIsCurrent(task)) throw new Error("Task snapshot is stale or altered; repeat the task-first review with current inputs");
  validateObligations(task, task.obligations);
  const manifestPath = resolve(root, options.manifestPath), loaded = loadCalibration(manifestPath);
  const record: AuthoringContractReviewRecord = { schema: 1, purpose: "authoring-contract-review", root, name: options.name,
    taskPath, taskSha256, manifestPath, manifestSha256: loaded.manifestSha256,
    criteria: structuredClone(options.criteria), alternatives: structuredClone(options.alternatives), summary: options.summary };
  validateReview(record, task);
  const reviewPath = saveRecord(root, options.name, "review", record);
  return { reviewPath, review: inspectAuthoringContractReview({ root, name: options.name, manifestPath, reviewPath }), providerCalls: 0 };
}

/** Freshness and coverage only; the author/reviewer still owns authority, entailment and materiality judgments. */
export function inspectAuthoringContractReview(options: AuthoringContractReviewSelection): AuthoringContractReviewInspection {
  const result: AuthoringContractReviewInspection = { status: "missing", issues: [], mechanicalChecksOnly: true };
  try {
    if (!nonempty(options.reviewPath) || !existsSync(resolve(options.root, options.reviewPath))) return { ...result, issues: ["Prepare the task-first contract review before requesting label acceptance"] };
    const { record, sha256 } = readRecord<AuthoringContractReviewRecord>(options.root, options.name, options.reviewPath, "review");
    if (record.schema !== 1 || record.purpose !== "authoring-contract-review" || record.root !== resolve(options.root)
      || record.name !== options.name || record.manifestPath !== resolve(options.root, options.manifestPath)) throw new Error("Contract review belongs to another project or manifest");
    const retained = readRecord<AuthoringTaskContractRecord>(options.root, options.name, record.taskPath, "task");
    if (retained.record.schema !== 1 || retained.record.purpose !== "authoring-task-contract" || retained.record.selection.root !== record.root || retained.record.selection.name !== options.name) throw new Error("Task snapshot belongs to another authoring project");
    result.record = record; result.task = retained.record; result.reviewSha256 = sha256;
    if (retained.sha256 !== record.taskSha256) throw new Error("Task snapshot identity changed");
    result.status = "stale";
    if (!taskIsCurrent(retained.record)) return { ...result, issues: ["Task snapshot or current brief, specification or selected source inputs changed"] };
    if (loadCalibration(record.manifestPath).manifestSha256 !== record.manifestSha256) return { ...result, issues: ["Calibration controls changed"] };
    validateObligations(retained.record, retained.record.obligations);
    result.issues = validateReview(record, retained.record);
    result.status = "current";
    const receipt = join(recordDir(options.root, options.name), `accepted-${sha256}.json`);
    if (existsSync(receipt)) {
      const accepted = JSON.parse(readRecordText(receipt));
      if (accepted.reviewSha256 !== sha256 || accepted.originalManifestSha256 !== record.manifestSha256 || !nonempty(accepted.by)) throw new Error("Invalid contract acceptance receipt");
      const manifest = loadCalibration(accepted.manifestPath);
      const original = loadCalibration(record.manifestPath);
      if (manifest.manifestSha256 !== accepted.manifestSha256) throw new Error("Accepted calibration evidence changed");
      assertAcceptedProposal(original, manifest, accepted.by);
      result.acceptance = { manifestPath: accepted.manifestPath, manifestSha256: accepted.manifestSha256 };
    }
    return result;
  } catch (error) { return { ...result, status: result.status === "stale" ? "stale" : "invalid", issues: [(error as Error).message] }; }
}

/** Existing label acceptance, bound to the review. No new model calls, global run gate or automatic approval. */
export function acceptAuthoringContractReview(options: AuthoringContractReviewSelection & {
  acceptedBy: string; reviewedManifest?: string; expectedReviewSha256?: string;
}): { accepted: true; reused: boolean; manifestPath: string; ready: boolean; issues: string[]; providerCalls: 0 } {
  if (!nonempty(options.acceptedBy)) throw new Error("Record the operator accepting these proposed labels");
  const inspected = inspectAuthoringContractReview(options);
  if (options.expectedReviewSha256 !== undefined && inspected.reviewSha256 !== options.expectedReviewSha256) throw new Error("Contract review changed during operator review");
  if (inspected.status !== "current" || inspected.issues.length) throw new Error(`Contract review is not ready for acceptance: ${inspected.issues.join("; ")}`);
  if (inspected.acceptance) {
    const accepted = loadCalibration(inspected.acceptance.manifestPath);
    return { accepted: true, reused: true, manifestPath: accepted.manifestPath, ready: accepted.ready, issues: accepted.issues, providerCalls: 0 };
  }
  const record = inspected.record!, loaded = loadCalibration(record.manifestPath);
  if (loaded.manifestSha256 !== record.manifestSha256) throw new Error("Controls changed during operator review");
  const manifestPath = options.reviewedManifest ? resolve(options.root, options.reviewedManifest)
    : join(loaded.specDir, `calibration-reviewed-${inspected.reviewSha256}.json`);
  noLinks(manifestPath);
  // A prior explicit acceptance may have persisted its manifest before a failed receipt write.
  // Recover only that exact proposal and attribution; preserve any conflicting file untouched.
  const reused = existsSync(manifestPath);
  const accepted = reused ? loadCalibration(manifestPath) : prepareCalibration({ specPath: inspected.task!.selection.specPath, manifestPath,
    controls: loaded.controls.map(c => ({ ...c, review: { status: "accepted", by: options.acceptedBy } })) });
  assertAcceptedProposal(loaded, accepted, options.acceptedBy);
  const receipt = { schema: 1, reviewSha256: inspected.reviewSha256, originalManifestSha256: record.manifestSha256,
    manifestPath: accepted.manifestPath, manifestSha256: accepted.manifestSha256, by: options.acceptedBy };
  const receiptPath = join(recordDir(options.root, options.name), `accepted-${inspected.reviewSha256}.json`);
  noLinks(receiptPath);
  writeFileSync(receiptPath, encode(receipt), { flag: "wx", mode: 0o600 });
  return { accepted: true, reused, manifestPath: accepted.manifestPath, ready: accepted.ready, issues: accepted.issues, providerCalls: 0 };
}
