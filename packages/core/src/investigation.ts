import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { appendScenario, renderScenarioBlock, specSha256 } from "./spec-write.js";
import { parseSpec } from "./spec.js";
const SHA = /^[a-f0-9]{64}$/;
const keys = (x: object, expected: string[]) => Object.keys(x).sort().join() === [...expected].sort().join();
const text = (x: unknown, max = 4000) => typeof x === "string" && x.length > 0 && x.length <= max;
function json<T>(input: T): T {
  let nodes = 0;
  const visit = (x: unknown, depth: number): unknown => {
    if (++nodes > 4096 || depth > 16) throw new Error("investigation JSON exceeds bounds");
    if (x === null || typeof x === "boolean" || typeof x === "string" || (typeof x === "number" && Number.isFinite(x))) return x;
    if (!x || typeof x !== "object" || (!Array.isArray(x) && ![Object.prototype, null].includes(Object.getPrototypeOf(x)))) throw new Error("plain investigation JSON required");
    const descriptors = Object.getOwnPropertyDescriptors(x);
    if (Array.isArray(x)) {
      if (Object.getPrototypeOf(x) !== Array.prototype || x.length > 256 || Reflect.ownKeys(x).length !== x.length + 1) throw new Error("bounded dense JSON array required");
      return Array.from({ length: x.length }, (_, i) => { const d = descriptors[String(i)]; if (!d || !('value' in d)) throw new Error("plain JSON array required"); return visit(d.value, depth + 1); });
    }
    const out: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(descriptors).sort((a, b) => String(a) < String(b) ? -1 : 1)) {
      const d = descriptors[key as string]; if (typeof key !== "string" || !d.enumerable || !('value' in d)) throw new Error("plain JSON properties required");
      Object.defineProperty(out, key, { value: visit(d.value, depth + 1), enumerable: true });
    }
    return out;
  };
  const result = visit(input, 0); if (Buffer.byteLength(JSON.stringify(result)) > 65536) throw new Error("investigation JSON exceeds byte bound");
  return result as T;
}
const digest = (x: unknown) => createHash("sha256").update(JSON.stringify(json(x))).digest("hex");
function freeze<T>(value: T): T { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
export interface HypothesisProposal {
  archiveSnapshot: string; caseIds: string[]; population: string; intervention: string; alternatives: string[];
  prediction: string; downside: string; disproof: string; rollback: string;
  limits: { subjectCalls: number; judgeCalls: number; wallMs: number }; effectProfile: string | null;
}
export interface Hypothesis { version: "factory-hypothesis-v1"; id: string; proposal: HypothesisProposal; status: "proposed" }
export function buildHypothesis(input: HypothesisProposal): Hypothesis {
  const p = json(input);
  if (!keys(p, ["archiveSnapshot", "caseIds", "population", "intervention", "alternatives", "prediction", "downside", "disproof", "rollback", "limits", "effectProfile"])
    || !SHA.test(p.archiveSnapshot) || !Array.isArray(p.caseIds) || !p.caseIds.length || p.caseIds.some(id => typeof id !== "string" || !SHA.test(id))
    || ![p.population, p.intervention, p.prediction, p.downside, p.disproof, p.rollback].every(s => text(s))
    || !Array.isArray(p.alternatives) || !p.alternatives.length || p.alternatives.some(a => !text(a))
    || !p.limits || !keys(p.limits, ["subjectCalls", "judgeCalls", "wallMs"])
    || !Object.values(p.limits).every(n => Number.isSafeInteger(n) && n >= 0 && n <= 1000000000)
    || !(p.effectProfile === null || text(p.effectProfile, 512))) throw new Error("invalid bounded hypothesis");
  return freeze({ version: "factory-hypothesis-v1", id: digest({ version: "factory-hypothesis-v1", proposal: p }), proposal: p, status: "proposed" });
}
export interface InvestigationAuthority { id: string; investigations: readonly string[]; promotions: readonly string[] }
function authorize(h: Hypothesis, authority: InvestigationAuthority | null) {
  const value = json(h);
  if (!keys(value, ["version", "id", "proposal", "status"]) || value.version !== "factory-hypothesis-v1" || value.status !== "proposed" || buildHypothesis(value.proposal).id !== value.id) throw new Error("hypothesis identity changed");
  if (!authority || !text(authority.id, 512) || !Array.isArray(authority.investigations) || !Array.isArray(authority.promotions)
    || authority.investigations.length > 256 || authority.promotions.length > 256
    || [...authority.investigations, ...authority.promotions].some(id => typeof id !== "string" || !SHA.test(id))
    || !authority.investigations.includes(value.id)) throw new Error("independent investigation authority required");
  return authority;
}
/** Independent host declarations, not approval fields on a proposal and never adoption/activation authority. */
export function authorizeInvestigation(h: Hypothesis, authority: InvestigationAuthority | null) {
  const selected = authorize(h, authority);
  return freeze({ version: "investigation-approval-v1", hypothesisId: h.id, authorityId: selected.id, scope: "investigation-only" as const });
}
export interface InvestigationScenarioPreview {
  version: "investigation-scenario-preview-v1"; hypothesisId: string; specPath: string; baseSha256: string;
  afterSha256: string; scenario: Record<string, unknown>; block: string; digest: string;
}
export function previewInvestigationScenario(h: Hypothesis, specPath: string, scenario: Record<string, unknown>): InvestigationScenarioPreview {
  if (buildHypothesis(h.proposal).id !== h.id) throw new Error("hypothesis identity changed");
  const path = realpathSync(specPath), current = readFileSync(path, "utf8"), safe = json(scenario), block = renderScenarioBlock(safe);
  parseSpec(current + block, path);
  const value = { version: "investigation-scenario-preview-v1" as const, hypothesisId: h.id, specPath: path, baseSha256: specSha256(current), afterSha256: specSha256(current + block), scenario: safe, block };
  return freeze({ ...value, digest: digest(value) });
}
/** Exact preview consent includes destination, existing spec and complete scenario bytes. No automatic sanitization claim. */
export function applyInvestigationScenario(h: Hypothesis, preview: InvestigationScenarioPreview, authority: InvestigationAuthority | null) {
  const selected = authorize(h, authority), copy = json(preview), { digest: claimed, ...body } = copy;
  if (!keys(copy, ["version", "hypothesisId", "specPath", "baseSha256", "afterSha256", "scenario", "block", "digest"])
    || body.version !== "investigation-scenario-preview-v1" || body.hypothesisId !== h.id || digest(body) !== claimed
    || renderScenarioBlock(body.scenario) !== body.block || !selected.promotions.includes(claimed)) throw new Error("exact privacy/promotion preview authority required");
  if (realpathSync(body.specPath) !== body.specPath) throw new Error("promotion destination changed");
  const current = readFileSync(body.specPath, "utf8");
  if (specSha256(current) === body.afterSha256) return { scenarioId: String(body.scenario.id), replayed: true, sha256: body.afterSha256, scope: "scenario-only" as const };
  const result = appendScenario({ specPath: body.specPath, scenario: body.scenario, baseSha256: body.baseSha256 });
  return { scenarioId: result.id, replayed: false, sha256: result.sha256, scope: "scenario-only" as const };
}
export interface FrozenInvestigationInputs { specSha256: string; rubricSha256: string; judgePolicySha256: string; heldoutSha256: string; configurationSha256: string }
function frozenInputs(input: FrozenInvestigationInputs) {
  const value = json(input);
  if (!keys(value, ["specSha256", "rubricSha256", "judgePolicySha256", "heldoutSha256", "configurationSha256"]) || Object.values(value).some(v => typeof v !== "string" || !SHA.test(v))) throw new Error("invalid frozen evaluation inputs");
  return value;
}
export function freezeInvestigation(h: Hypothesis, inputs: FrozenInvestigationInputs, authority: InvestigationAuthority | null) {
  const approved = authorizeInvestigation(h, authority), value = { version: "frozen-investigation-v1", hypothesisId: h.id, authorityId: approved.authorityId, inputs: frozenInputs(inputs), executionReady: false as const };
  return freeze({ ...value, digest: digest(value) });
}
export function assertFrozenInvestigation(frozen: ReturnType<typeof freezeInvestigation>, current: FrozenInvestigationInputs): void {
  const { digest: recorded, ...value } = json(frozen);
  if (!keys(value, ["version", "hypothesisId", "authorityId", "inputs", "executionReady"]) || !SHA.test(value.hypothesisId) || !text(value.authorityId, 512)
    || value.version !== "frozen-investigation-v1" || value.executionReady !== false || digest(value) !== recorded || digest(value.inputs) !== digest(frozenInputs(current))) throw new Error("frozen investigation changed or invalid");
}

export interface WeeklyInvestigationInput { week: string; population: string; policyDigest: string; archiveSnapshot: string; eligibleCaseIds: string[]; maxCases: number }
export interface WeeklyInvestigationSelection {
  version: "weekly-investigation-selection-v1"; id: string; key: string; inputDigest: string;
  week: string; population: string; policyDigest: string; archiveSnapshot: string; selectedCaseIds: string[]; sampling: "exploratory-sha256-order-v1";
}
/** The host persists these immutable selections; this function neither schedules a process nor spends tokens. */
export function selectWeeklyInvestigation(history: readonly WeeklyInvestigationSelection[], input: WeeklyInvestigationInput): WeeklyInvestigationSelection {
  const value = json(input);
  if (!keys(value, ["week", "population", "policyDigest", "archiveSnapshot", "eligibleCaseIds", "maxCases"])
    || !/^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/.test(value.week) || !text(value.population, 512)
    || !SHA.test(value.policyDigest) || !SHA.test(value.archiveSnapshot) || !Array.isArray(value.eligibleCaseIds)
    || !value.eligibleCaseIds.length || value.eligibleCaseIds.some(id => typeof id !== "string" || !SHA.test(id))
    || !Number.isSafeInteger(value.maxCases) || value.maxCases < 1 || value.maxCases > 32 || history.length > 4096) throw new Error("invalid weekly investigation selection");
  const eligible = [...new Set(value.eligibleCaseIds)].sort();
  const key = digest({ week: value.week, population: value.population, policyDigest: value.policyDigest });
  const inputDigest = digest({ ...value, eligibleCaseIds: eligible });
  const selectedCaseIds = eligible.sort((a, b) => { const ka = digest([key, value.archiveSnapshot, a]), kb = digest([key, value.archiveSnapshot, b]); return ka < kb ? -1 : ka > kb ? 1 : 0; }).slice(0, value.maxCases);
  const body = { version: "weekly-investigation-selection-v1" as const, key, inputDigest, week: value.week, population: value.population,
    policyDigest: value.policyDigest, archiveSnapshot: value.archiveSnapshot, selectedCaseIds, sampling: "exploratory-sha256-order-v1" as const };
  const result = freeze({ ...body, id: digest(body) });
  const previous = history.filter(record => record.key === key);
  for (const record of previous) {
    const { id, ...old } = json(record);
    if (digest(old) !== id || id !== result.id) throw new Error("weekly investigation already frozen or history invalid");
  }
  return previous.length ? freeze(json(previous[0])) : result;
}
