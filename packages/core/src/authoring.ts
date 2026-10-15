import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import yaml from "js-yaml";
import { parseSpec } from "./spec.js";
import { fixtureInventory, inspectEvalAuthoring } from "./authoring-preflight.js";

export interface AuthoringAnswers {
  purpose: string;
  outcomes: string;
  boundaries: string;
  tools: string[];
  placement: "same-repo" | "separate-repo";
  delivery: "skill" | "skill-and-agent";
  evalRoot?: string;
  /** Additional operator-agreed context/delegation capabilities for the optional wrapper. */
  agentCapabilities?: string[];
}
export interface AuthoringQuestion { key: keyof AuthoringAnswers; prompt: string; options?: string[] }
export interface AuthoringFile { area: "skill" | "evals" | "agent"; path: string; content: string }
export interface AuthoringDraft {
  files: AuthoringFile[];
  requirements: { id: string; description: string; scenarios: string[] }[];
  /** An author's assertion about proposed control labels, never calibration or ship approval. */
  labelStatus: "proposed" | "reviewed";
}
export interface AuthoringChange {
  area: AuthoringFile["area"];
  path: string;
  destination: string;
  beforeSha256: string | null;
  afterSha256: string;
  kind: "create" | "update" | "unchanged";
  before: string | null;
  after: string;
}
export interface AuthoringState {
  schema: 1;
  name: string;
  idea: string;
  root: string;
  skillDir: string;
  skillsRoot: string;
  agentRoot: string;
  answers: Partial<AuthoringAnswers>;
  imported: { path: string; sha256: string } | null;
  revision: number;
  draft?: { data: AuthoringDraft; digest: string; changes: AuthoringChange[] };
  appliedDigest?: string;
}
export interface AuthoringPreview {
  state: AuthoringState;
  nextQuestion: AuthoringQuestion | null;
  draftDigest?: string;
  changes: AuthoringChange[];
  issues: string[];
  warnings: string[];
  readyToApply: boolean;
}

const QUESTIONS: AuthoringQuestion[] = [
  { key: "purpose", prompt: "Who will use this skill, and what job should it help them do?" },
  { key: "outcomes", prompt: "What should a successful result contain, and what would make it unacceptable?" },
  { key: "boundaries", prompt: "Which external actions may it take, which require your approval, and what must it never do?" },
  { key: "tools", prompt: "Which tools or integrations may it rely on in Pi? Use an empty list for a text-only skill." },
  { key: "delivery", prompt: "Create a portable Pi skill only, or also a separate pi-daddy subagent definition?", options: ["skill", "skill-and-agent"] },
  { key: "placement", prompt: "Keep evaluations with the skill, or in a separate evaluation repository?", options: ["same-repo", "separate-repo"] },
];
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

function safeName(name: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 80 || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(name)) {
    throw new Error("Skill name must be a portable lowercase name with optional hyphens (at most 80 characters)");
  }
  return name;
}
function safeRelative(path: string): string {
  if (!text(path) || isAbsolute(path) || /[\\:\0<>"|?*]/.test(path) || path.split("/").some(p => !p || p === "." || p === ".." || /[. ]$/.test(p) || /^(\.git|\.skill-harness|con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p))) {
    throw new Error(`Unsafe authored path: ${JSON.stringify(path)}`);
  }
  return path;
}
/** Reject symlinks in both existing leaves and parent paths; outputs never follow a redirected root. */
function noLinks(path: string): void {
  for (let cursor = resolve(path); ; cursor = dirname(cursor)) {
    try { if (lstatSync(cursor).isSymbolicLink()) throw new Error(`Symlink is not an authoring destination: ${cursor}`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (dirname(cursor) === cursor) break;
  }
}
function readOptional(path: string): string | null {
  noLinks(path);
  if (!existsSync(path)) return null;
  if (!lstatSync(path).isFile()) throw new Error(`Expected an ordinary file: ${path}`);
  const bytes = readFileSync(path);
  const content = bytes.toString("utf8");
  if (!Buffer.from(content).equals(bytes) || content.includes("\0")) throw new Error(`Expected UTF-8 text: ${path}`);
  return content;
}
function stateDir(root: string, name: string): string {
  return join(resolve(root), ".skill-harness", "authoring", safeName(name));
}
function writeAtomic(path: string, content: string): void {
  noLinks(path);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = join(dirname(path), `.authoring-${randomUUID()}.tmp`);
  try {
    const mode = existsSync(path) ? lstatSync(path).mode & 0o777 : 0o600;
    writeFileSync(temporary, content, { flag: "wx", mode });
    noLinks(path);
    renameSync(temporary, path);
  } finally { if (existsSync(temporary)) rmSync(temporary); }
}
function save(state: AuthoringState): void {
  writeAtomic(join(stateDir(state.root, state.name), "state.json"), JSON.stringify(state, null, 2) + "\n");
}
function protectLocalRecords(root: string): void {
  const ignore = join(resolve(root), ".skill-harness", "authoring", ".gitignore");
  noLinks(ignore);
  mkdirSync(dirname(ignore), { recursive: true, mode: 0o700 });
  if (!existsSync(ignore)) writeFileSync(ignore, "*\n", { flag: "wx", mode: 0o600 });
}
function validateAnswers(answers: Partial<AuthoringAnswers>): Partial<AuthoringAnswers> {
  const keys = new Set([...QUESTIONS.map(q => q.key), "evalRoot", "agentCapabilities"]);
  for (const [key, value] of Object.entries(answers)) {
    if (!keys.has(key)) throw new Error(`Unknown authoring answer: ${key}`);
    if (key === "tools" || key === "agentCapabilities") {
      if (!Array.isArray(value) || value.some(v => !text(v))) throw new Error("tools must be a list of nonempty tool names (possibly empty)");
      if (key === "agentCapabilities") for (const capability of value) {
        if (!/^(?:context|agent|skill|workspace|ext):[A-Za-z0-9][A-Za-z0-9_./:-]*$/.test(capability)) throw new Error("Additional agent capabilities must be explicit context:, agent:, skill:, workspace: or ext: IDs without patterns");
      }
    } else if (!text(value)) throw new Error(`${key} must be nonempty`);
    if (key === "placement" && value !== "same-repo" && value !== "separate-repo") throw new Error("Unknown evaluation placement");
    if (key === "delivery" && value !== "skill" && value !== "skill-and-agent") throw new Error("Unknown skill delivery");
  }
  return structuredClone(answers);
}
function nextQuestion(state: AuthoringState): AuthoringQuestion | null {
  const next = QUESTIONS.find(q => state.answers[q.key] === undefined);
  if (next) return next;
  if (state.answers.placement === "separate-repo" && !state.answers.evalRoot) {
    return { key: "evalRoot", prompt: "What directory should hold the separate evaluation repository?" };
  }
  return null;
}
function locations(state: AuthoringState) {
  const evalRoot = state.answers.placement === "separate-repo"
    ? resolve(state.root, state.answers.evalRoot!) : state.skillsRoot;
  return { skill: state.skillDir, evals: join(evalRoot, state.name, "tests"), agent: state.agentRoot, evalRoot };
}
function destination(state: AuthoringState, file: AuthoringFile): string {
  if (!["skill", "evals", "agent"].includes(file.area)) throw new Error("Unknown draft file area");
  safeRelative(file.path);
  if ((file.area === "skill" && file.path.split("/")[0] === "tests") || (file.area === "evals" && /^results(?:\/|$)/.test(file.path))) {
    throw new Error(`Reserved authored path: ${file.area}/${file.path}`);
  }
  if (file.area === "agent" && state.answers.delivery !== "skill-and-agent") throw new Error("A subagent definition was not selected");
  const path = resolve(locations(state)[file.area], file.path);
  noLinks(path);
  return path;
}

/** Create a local brief, without running a model, scanning examples or editing a skill. */
export function startAuthoring(options: {
  root: string; name: string; idea: string; answers?: Partial<AuthoringAnswers>;
  skillRoot?: string; evalRoot?: string; agentRoot?: string; skillDir?: string;
}): AuthoringState {
  const root = resolve(options.root);
  noLinks(root);
  if (!existsSync(root) || !lstatSync(root).isDirectory()) throw new Error("Authoring root must be an existing directory");
  const name = safeName(options.name);
  if (!text(options.idea)) throw new Error("An initial skill idea is required");
  const dir = stateDir(root, name);
  if (existsSync(join(dir, "state.json"))) {
    const existing = readAuthoring(root, name);
    if (existing.idea !== options.idea) throw new Error("This name already has a different authoring brief; resume it or choose another name");
    return existing;
  }
  const skillDir = options.skillDir ? resolve(root, options.skillDir) : resolve(root, options.skillRoot ?? "skills", name);
  if (basename(skillDir) !== name) throw new Error("Selected skill directory must match the skill name so Pi and eval discovery agree");
  const existingSkill = readOptional(join(skillDir, "SKILL.md"));
  if (options.skillDir && existingSkill === null) throw new Error("Imported skillDir must contain SKILL.md");
  const state: AuthoringState = {
    schema: 1, root, name, idea: options.idea, skillDir, skillsRoot: dirname(skillDir),
    agentRoot: resolve(root, options.agentRoot ?? "agents"),
    answers: validateAnswers({ ...options.answers, ...(options.evalRoot ? { evalRoot: options.evalRoot } : {}) }),
    imported: existingSkill === null ? null : { path: join(skillDir, "SKILL.md"), sha256: hash(existingSkill) }, revision: 1,
  };
  noLinks(state.agentRoot);
  protectLocalRecords(root);
  save(state);
  return state;
}

export function readAuthoring(root: string, name: string): AuthoringState {
  const raw = readOptional(join(stateDir(root, name), "state.json"));
  if (raw === null) throw new Error(`No authoring brief for ${name}`);
  const state = JSON.parse(raw) as AuthoringState;
  if (state.schema !== 1 || state.name !== name || state.root !== resolve(root) || !text(state.idea)
    || state.skillsRoot !== dirname(state.skillDir) || basename(state.skillDir) !== name) throw new Error("Invalid authoring state identity");
  validateAnswers(state.answers);
  noLinks(state.skillDir); noLinks(state.agentRoot);
  return state;
}

/** Known answers can be supplied together; the UI asks only the next unresolved question. */
export function answerAuthoring(root: string, name: string, answers: Partial<AuthoringAnswers>): AuthoringState {
  const state = readAuthoring(root, name);
  state.answers = validateAnswers({ ...state.answers, ...answers });
  state.revision++;
  delete state.draft; delete state.appliedDigest;
  save(state);
  return state;
}

function frontmatter(content: string, filename: string): Record<string, unknown> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  if (!match) throw new Error(`${filename} needs YAML frontmatter`);
  const parsed = yaml.load(match[1]);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`Invalid ${filename} frontmatter`);
  const obj = parsed as Record<string, unknown>;
  if (!text(obj.name) || !text(obj.description)) throw new Error(`${filename} needs a name and description`);
  return obj;
}

/** pi-daddy 0.49.3 keys selected Markdown resources by path, with a plain declared ceiling. */
function checkAgent(state: AuthoringState, file: AuthoringFile): void {
  if (!file.path.endsWith(".md")) throw new Error("Agent definitions must be Markdown files");
  const identity = basename(file.path, ".md");
  safeName(identity);
  if (identity === state.name) throw new Error("Agent wrapper name must differ from the portable skill name; use <skill>-agent.md to avoid Pi resource collisions");
  const fm = frontmatter(file.content, file.path);
  if (fm.name !== identity) throw new Error("Agent frontmatter name must match its Markdown filename so Pi and pi-daddy select the same identity");
  const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(file.content)![1];
  const declared = /^allowed-tools:[ \t]*(.*)$/m.exec(header)?.[1].trim();
  if (declared === undefined) throw new Error("Agent wrapper requires explicit allowed-tools; an absent ceiling is not spawnable in pi-daddy");
  // Daddy's small parser does not unquote scalars; YAML quotes/folding would name the wrong tools.
  if (declared && (typeof fm["allowed-tools"] !== "string" || fm["allowed-tools"] !== declared)) throw new Error("Agent allowed-tools must be a plain single-line comma-separated declaration, without YAML quotes or folding");
  const normalize = (value: string) => /^(?:tool|ext|skill|agent|workspace|context):/.test(value) ? value : `tool:${value.toLowerCase()}`;
  const agreed = new Set([...(state.answers.tools ?? []).map(normalize), ...(state.answers.agentCapabilities ?? [])]);
  const capabilities = declared.split(/[\s,]+/).filter(Boolean);
  for (const capability of capabilities) {
    if (!/^(?:(?:tool|ext|skill|agent|workspace|context):)?[A-Za-z0-9][A-Za-z0-9_./:-]*$/.test(capability)) throw new Error("Agent allowed-tools needs explicit capability IDs without quotes, patterns or wildcards");
    if (!agreed.has(normalize(capability))) throw new Error(`Agent capability ${capability} is outside the agreed brief; ask before adding context or delegation authority`);
  }
  if (fm.tools !== undefined) {
    if (typeof fm.tools !== "string") throw new Error("Agent tools must use Pi's comma-separated frontmatter form");
    const ceiling = new Set(capabilities.map(normalize));
    for (const tool of fm.tools.split(/[\s,]+/).filter(Boolean)) if (!ceiling.has(normalize(tool))) throw new Error(`Agent tools entry ${tool} is absent from allowed-tools`);
  }
}
function draftIssues(state: AuthoringState, draft: AuthoringDraft): { issues: string[]; warnings: string[] } {
  const issues: string[] = [];
  const warnings: string[] = [];
  const lookup = (area: AuthoringFile["area"], path: string) => draft.files.find(f => f.area === area && f.path === path)?.content
    ?? readOptional(resolve(locations(state)[area], safeRelative(path)));
  try {
    const skill = lookup("skill", "SKILL.md");
    if (!skill) throw new Error("Draft or imported skill must include SKILL.md");
    if (frontmatter(skill, "SKILL.md").name !== state.name) throw new Error("SKILL.md name must match the authoring brief");
    const specification = lookup("evals", "specification.yaml");
    if (!specification) throw new Error("Draft needs an evaluation specification.yaml");
    const spec = parseSpec(specification, "specification.yaml");
    if (spec.skill !== state.name) issues.push("Evaluation skill name must match the authoring brief");
    const ids = new Set(spec.scenarios.map(s => s.id));
    if (spec.ship_bar.total !== ids.size) issues.push(`Ship bar total must equal the ${ids.size} authored scenarios`);
    if (!Number.isSafeInteger(spec.ship_bar.min_pass) || spec.ship_bar.min_pass < 1 || spec.ship_bar.min_pass > ids.size) issues.push("Ship bar min_pass must be an integer between 1 and the scenario count");
    for (const id of spec.critical) if (!ids.has(id)) issues.push(`Unknown critical scenario ${id}`);
    const covered = new Set<string>();
    const requirements = new Set<string>();
    if (!Array.isArray(draft.requirements) || !draft.requirements.length) throw new Error("Draft needs authored requirements mapped to scenarios");
    for (const req of draft.requirements) {
      if (!text(req.id) || !text(req.description) || requirements.has(req.id)) throw new Error("Requirement IDs and descriptions must be nonempty and IDs unique");
      requirements.add(req.id);
      if (!Array.isArray(req.scenarios) || !req.scenarios.length) issues.push(`Requirement ${req.id} has no scenario`);
      for (const id of req.scenarios ?? []) {
        if (!ids.has(id)) issues.push(`Requirement ${req.id} names unknown scenario ${id}`);
        covered.add(id);
      }
    }
    for (const id of ids) if (!covered.has(id)) issues.push(`Scenario ${id} has no requirement`);
    for (const scenario of spec.scenarios) {
      if (scenario.tools === undefined) issues.push(`${scenario.id} needs explicit env.tools; use the agreed tool profile or a narrower subset (an empty list disables tools)`);
      else for (const tool of scenario.tools) if (!state.answers.tools!.includes(tool)) issues.push(`${scenario.id} tool ${tool} is outside the agreed tool profile; update the brief only with user authorization`);
      const fixture = typeof scenario.workspace === "object" ? scenario.workspace.fixture : scenario.fixture;
      if (fixture) {
        safeRelative(fixture);
        const staged = draft.files.some(f => f.area === "evals" && f.path.startsWith(fixture.replace(/\/$/, "") + "/"));
        const actual = resolve(locations(state).evals, fixture);
        noLinks(actual);
        if (!staged && (!existsSync(actual) || !lstatSync(actual).isDirectory())) issues.push(`${scenario.id} fixture is missing: ${fixture}`);
      }
      for (const path of [scenario.systemPromptFile, ...(scenario.extensions ?? []), ...(scenario.judgeReferences ?? []), scenario.assert?.post_test].filter((v): v is string => !!v)) {
        if (lookup("evals", path) === null) issues.push(`${scenario.id} support file is missing: ${path}`);
      }
    }
    for (const finding of inspectEvalAuthoring(spec, { fixtureFiles: scenario => {
      const fixture = typeof scenario.workspace === "object" ? scenario.workspace.fixture : scenario.fixture;
      if (!fixture) return [];
      safeRelative(fixture);
      const prefix = fixture.replace(/\/$/, "") + "/";
      const staged = draft.files.filter(f => f.area === "evals" && f.path.startsWith(prefix)).map(f => f.path.slice(prefix.length));
      const actual = resolve(locations(state).evals, fixture);
      noLinks(actual);
      return [...new Set([...staged, ...(existsSync(actual) && lstatSync(actual).isDirectory() ? fixtureInventory(actual) : [])])];
    } })) {
      (finding.severity === "error" ? issues : warnings).push(`${finding.scenario}: ${finding.message}`);
    }
    if (state.answers.placement === "separate-repo" && existsSync(join(state.skillDir, "tests", "specification.yaml"))) {
      issues.push("The imported skill already has an in-repo specification; explicitly relocate it before selecting separate evals (specifications are not merged)");
    }
    if (state.answers.delivery === "skill-and-agent") {
      const agents = draft.files.filter(f => f.area === "agent");
      if (!agents.length) issues.push("Selected skill-and-agent delivery needs a separate agent definition");
      const agentNames = new Set<string>();
      for (const file of agents) {
        const identity = basename(file.path, ".md");
        if (agentNames.has(identity)) throw new Error(`Duplicate Pi agent resource name: ${identity}`);
        agentNames.add(identity);
        checkAgent(state, file);
      }
    }
  } catch (error) { issues.push((error as Error).message); }
  return { issues, warnings };
}

/** Stage model-authored content and capture exact existing bytes. This does not apply or certify it. */
export function stageAuthoringDraft(root: string, name: string, draft: AuthoringDraft): AuthoringPreview {
  const state = readAuthoring(root, name);
  if (nextQuestion(state)) throw new Error("Complete the authoring brief before staging a draft");
  if (!Array.isArray(draft.files) || !draft.files.length || draft.files.length > 200) throw new Error("Draft needs between 1 and 200 selected files");
  if (draft.labelStatus !== "proposed" && draft.labelStatus !== "reviewed") throw new Error("Expected-label status must be proposed or author reviewed");
  if (draft.files.some(f => f.area === "evals" && f.path === "authoring.json")) throw new Error("authoring.json is generated from the reviewed brief");
  const files = structuredClone(draft.files);
  // An imported skill is part of the reviewed candidate even when only its evals change.
  const skill = files.find(f => f.area === "skill" && f.path === "SKILL.md")?.content ?? readOptional(join(state.skillDir, "SKILL.md"));
  if (skill !== null && !files.some(f => f.area === "skill" && f.path === "SKILL.md")) files.push({ area: "skill", path: "SKILL.md", content: skill });
  const loc = locations(state);
  files.push({ area: "evals", path: "authoring.json", content: JSON.stringify({
    schema: 1, skill: state.name,
    skillsRoot: relative(loc.evalRoot, state.skillsRoot).split(sep).join("/") || ".",
    skillSha256: skill === null ? null : hash(skill),
    requirements: draft.requirements, labelStatus: draft.labelStatus,
    modelQualityEvaluated: false, calibrated: false,
    agent: state.answers.delivery === "skill-and-agent" ? { installed: false, grantsChanged: false } : null,
  }, null, 2) + "\n" });
  const seen = new Set<string>();
  const changes = files.map(file => {
    if (typeof file.content !== "string" || file.content.includes("\0") || Buffer.byteLength(file.content) > 1024 * 1024) throw new Error("Each authored file must be UTF-8 text of at most 1 MiB");
    const path = destination(state, file);
    const key = path.toLowerCase();
    if (seen.has(key)) throw new Error(`Duplicate output destination: ${path}`);
    seen.add(key);
    const before = readOptional(path);
    return { area: file.area, path: file.path, destination: path, before, after: file.content,
      beforeSha256: before === null ? null : hash(before), afterSha256: hash(file.content),
      kind: before === null ? "create" : before === file.content ? "unchanged" : "update" } as AuthoringChange;
  });
  const data = structuredClone(draft);
  const digest = hash(JSON.stringify({ revision: state.revision, answers: state.answers, data, changes }));
  state.draft = { data, digest, changes };
  delete state.appliedDigest;
  save(state);
  return inspectAuthoring(root, name);
}

export function inspectAuthoring(root: string, name: string): AuthoringPreview {
  const state = readAuthoring(root, name);
  const next = nextQuestion(state);
  const { issues, warnings } = state.draft && !next ? draftIssues(state, state.draft.data) : { issues: [], warnings: [] };
  const changes = state.draft?.changes ?? [];
  if (state.draft) {
    if (state.draft.digest !== hash(JSON.stringify({ revision: state.revision, answers: state.answers, data: state.draft.data, changes }))) issues.push("Draft digest does not match retained preview");
    for (const change of changes) {
      const target = destination(state, { area: change.area, path: change.path, content: change.after });
      if (target !== change.destination || hash(change.after) !== change.afterSha256) issues.push(`Invalid draft identity: ${change.path}`);
      const current = readOptional(target);
      const digest = current === null ? null : hash(current);
      if (digest !== change.beforeSha256 && digest !== change.afterSha256) issues.push(`Destination changed since preview: ${target}`);
    }
  }
  return { state, nextQuestion: next, draftDigest: state.draft?.digest, changes, issues, warnings, readyToApply: !next && !!state.draft && issues.length === 0 };
}

/** Explicit, digest-bound apply. No grants, installation, provider calls, labels or training authorization are inferred. */
export function applyAuthoring(root: string, name: string, options: { digest: string }): { state: AuthoringState; files: string[]; status: "applied" | "already-applied" } {
  const dir = stateDir(root, name);
  noLinks(dir);
  const lock = join(dir, "apply.lock");
  writeFileSync(lock, String(process.pid), { flag: "wx", mode: 0o600 });
  try {
    const preview = inspectAuthoring(root, name);
    if (!preview.readyToApply || options.digest !== preview.draftDigest) throw new Error(`Draft cannot be applied: ${preview.issues.join("; ") || "missing or changed preview digest"}`);
    const state = preview.state;
    const files = preview.changes.map(c => c.destination);
    if (state.appliedDigest === options.digest) {
      if (preview.changes.some(c => readOptional(c.destination) !== c.after)) throw new Error("An applied file has changed; stage a new reviewed draft");
      return { state, files, status: "already-applied" };
    }
    // Validate the whole set before writing any product file. Backups remain local even after success.
    for (const [index, change] of preview.changes.entries()) {
      if (change.before !== null) writeAtomic(join(dir, "backups", options.digest, `${index}.txt`), change.before);
    }
    for (const change of preview.changes) {
      const current = readOptional(change.destination);
      if (current === change.after) continue;
      if ((current === null ? null : hash(current)) !== change.beforeSha256) throw new Error(`Destination changed during apply: ${change.destination}; earlier written files and backups are preserved`);
      writeAtomic(change.destination, change.after);
    }
    state.appliedDigest = options.digest;
    save(state);
    return { state, files, status: "applied" };
  } finally { rmSync(lock); }
}
