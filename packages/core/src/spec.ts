import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import type { WorkspaceKind } from "./workspace.js";

export type ScenarioMode = "inline" | "seeded";

export interface SeededAssert {
  vitest?: boolean;
  diff_contains?: string[];
}

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
  remote: boolean; // env.remote: wire a local bare `origin` so the fixture has a real upstream
  systemPromptFile?: string; // system_prompt_file: run this md file AS the system prompt (agents/<name>.md)
  reps?: number; // run this scenario N times (overrides --reps); positive integer
  passThreshold?: number; // pass if pass-rate >= this (overrides --pass-threshold); 0..1
}

export interface ShipBar {
  total: number;
  min_pass: number;
  no_critical_fail: boolean;
}

export interface Spec {
  skill: string;
  judge_persona: string;
  ship_bar: ShipBar;
  critical: string[];
  scenarios: Scenario[];
}

/** Thrown on any validation failure. Message always carries the spec file path. */
export class SpecError extends Error {
  constructor(message: string, file: string) {
    super(`${file}: ${message}`);
    this.name = "SpecError";
  }
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/**
 * Require a non-empty list of strings, with a targeted error. A common authoring
 * trap: an unquoted "key: value" list item parses as a YAML mapping, not a string
 * — call that out explicitly so the fix (quote the item) is obvious.
 */
function assertStringList(v: unknown, id: string, field: string, file: string): asserts v is string[] {
  if (!Array.isArray(v) || v.length === 0) {
    throw new SpecError(`scenario \`${id}\` needs at least one \`${field}\` entry`, file);
  }
  const i = v.findIndex((x) => typeof x !== "string");
  if (i >= 0) {
    const bad = v[i];
    const hint =
      bad !== null && typeof bad === "object"
        ? ` — item #${i + 1} parsed as a YAML mapping; an unquoted ": " does that, so quote the item`
        : ` — item #${i + 1} is not a string`;
    throw new SpecError(`scenario \`${id}\` \`${field}\` items must all be strings${hint}`, file);
  }
}

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
  if (raw === "none") {
    if (mode === "seeded") {
      throw new SpecError(
        `seeded scenario \`${id}\` cannot use env.workspace: none — seeded gates need a git repo ` +
          `(omit env to use its fixture, or use empty-git/fixture:<path>)`,
        file
      );
    }
    return raw;
  }
  if (raw === "empty-git") return raw;
  if (typeof raw === "string" && raw.startsWith("fixture:")) {
    const p = raw.slice("fixture:".length).trim();
    if (!p) throw new SpecError(`scenario \`${id}\` env.workspace fixture path is empty`, file);
    return { fixture: p };
  }
  throw new SpecError(`scenario \`${id}\` env.workspace must be none | empty-git | fixture:<path>`, file);
}

/**
 * Resolve `env.remote`. A remote needs a repo to attach to, so it is only meaningful
 * with empty-git or a fixture — asking for one on a bare cwd is an authoring mistake,
 * not something to silently ignore.
 */
function resolveRemote(env: unknown, workspace: WorkspaceKind, id: string, file: string): boolean {
  const raw = env && typeof env === "object" ? (env as Record<string, unknown>).remote : undefined;
  if (raw === undefined) return false;
  if (typeof raw !== "boolean") {
    throw new SpecError(`scenario \`${id}\` env.remote must be true or false`, file);
  }
  if (raw && workspace === "none") {
    throw new SpecError(
      `scenario \`${id}\` sets env.remote but has no repo to attach it to — ` +
        `use env.workspace: empty-git or fixture:<path>`,
      file
    );
  }
  return raw;
}

/** Parse + validate a specification.yaml from its raw text. `file` is used in error messages. */
export function parseSpec(text: string, file: string): Spec {
  let doc: unknown;
  try {
    doc = yaml.load(text);
  } catch (e) {
    throw new SpecError(`not valid YAML — ${(e as Error).message}`, file);
  }
  if (doc === null || typeof doc !== "object") {
    throw new SpecError("spec must be a YAML mapping", file);
  }
  const o = doc as Record<string, unknown>;

  if (typeof o.skill !== "string" || o.skill.length === 0) {
    throw new SpecError("missing or invalid `skill` (string)", file);
  }
  if (typeof o.judge_persona !== "string" || o.judge_persona.length === 0) {
    throw new SpecError("missing or invalid `judge_persona` (string)", file);
  }

  const sb = o.ship_bar as Record<string, unknown> | undefined;
  if (!sb || typeof sb !== "object") {
    throw new SpecError("missing `ship_bar` mapping", file);
  }
  if (typeof sb.total !== "number" || typeof sb.min_pass !== "number") {
    throw new SpecError("`ship_bar` requires numeric `total` and `min_pass`", file);
  }
  const ship_bar: ShipBar = {
    total: sb.total,
    min_pass: sb.min_pass,
    no_critical_fail: sb.no_critical_fail !== false, // default true
  };

  const critical = o.critical === undefined ? [] : o.critical;
  if (!isStringArray(critical)) {
    throw new SpecError("`critical` must be a list of scenario ids (strings)", file);
  }

  if (!Array.isArray(o.scenarios)) {
    throw new SpecError("missing `scenarios` (list)", file);
  }

  const seen = new Set<string>();
  const scenarios: Scenario[] = o.scenarios.map((raw, i) => {
    if (raw === null || typeof raw !== "object") {
      throw new SpecError(`scenario #${i + 1} is not a mapping`, file);
    }
    const s = raw as Record<string, unknown>;
    const id = s.id;
    if (typeof id !== "string" || id.length === 0) {
      throw new SpecError(`scenario #${i + 1} missing \`id\` (string)`, file);
    }
    if (seen.has(id)) {
      throw new SpecError(`duplicate scenario id \`${id}\``, file);
    }
    seen.add(id);

    if (typeof s.title !== "string" || s.title.length === 0) {
      throw new SpecError(`scenario \`${id}\` missing \`title\``, file);
    }

    const mode: ScenarioMode = s.mode === undefined ? "inline" : (s.mode as ScenarioMode);
    if (mode !== "inline" && mode !== "seeded") {
      throw new SpecError(`scenario \`${id}\` has invalid \`mode\` (inline|seeded)`, file);
    }

    assertStringList(s.turns, id, "turns", file);
    assertStringList(s.checklist, id, "checklist", file);

    const critFlag = s.critical === true || critical.includes(id);

    const scenario: Scenario = {
      id,
      title: s.title,
      critical: critFlag,
      mode,
      turns: s.turns,
      checklist: s.checklist,
      workspace: "none",
      remote: false,
    };

    if (mode === "seeded") {
      if (typeof s.fixture !== "string" || s.fixture.length === 0) {
        throw new SpecError(`seeded scenario \`${id}\` requires a \`fixture\` path`, file);
      }
      scenario.fixture = s.fixture;
      const a = s.assert as Record<string, unknown> | undefined;
      if (a) {
        const assertObj: SeededAssert = {};
        if (a.vitest !== undefined) assertObj.vitest = a.vitest === true;
        if (a.diff_contains !== undefined) {
          if (!isStringArray(a.diff_contains)) {
            throw new SpecError(`seeded scenario \`${id}\` \`assert.diff_contains\` must be strings`, file);
          }
          assertObj.diff_contains = a.diff_contains;
        }
        scenario.assert = assertObj;
      }
    }

    scenario.workspace = resolveWorkspace(s.env, mode, scenario.fixture, id, file);
    scenario.remote = resolveRemote(s.env, scenario.workspace, id, file);
    if (s.system_prompt_file !== undefined) {
      if (typeof s.system_prompt_file !== "string" || !s.system_prompt_file.trim()) {
        throw new SpecError(`scenario \`${id}\` \`system_prompt_file\` must be a non-empty string`, file);
      }
      // A subagent has no turn two. Testing an agent file across multiple turns would
      // measure conversation armor the single-shot contract deliberately drops.
      if (scenario.turns.length !== 1) {
        throw new SpecError(
          `scenario \`${id}\` uses system_prompt_file, so it must have exactly one turn ` +
            `(got ${scenario.turns.length}) — an agent definition is single-shot by contract`,
          file
        );
      }
      scenario.systemPromptFile = s.system_prompt_file.trim();
    }

    if (s.reps !== undefined) {
      if (typeof s.reps !== "number" || !Number.isInteger(s.reps) || s.reps < 1) {
        throw new SpecError(`scenario \`${id}\` \`reps\` must be a positive integer`, file);
      }
      scenario.reps = s.reps;
    }
    if (s.pass_threshold !== undefined) {
      if (typeof s.pass_threshold !== "number" || s.pass_threshold < 0 || s.pass_threshold > 1) {
        throw new SpecError(`scenario \`${id}\` \`pass_threshold\` must be a number in [0, 1]`, file);
      }
      scenario.passThreshold = s.pass_threshold;
    }

    return scenario;
  });

  return { skill: o.skill, judge_persona: o.judge_persona, ship_bar, critical, scenarios };
}

/** Load + validate a specification.yaml from disk. */
export function loadSpec(file: string): Spec {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (e) {
    throw new SpecError(`cannot read spec file — ${(e as Error).message}`, file);
  }
  return parseSpec(text, file);
}
