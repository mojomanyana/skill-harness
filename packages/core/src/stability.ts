import { join } from "node:path";
import { loadSpec, type Scenario, type Spec } from "./spec.js";
import { effectiveVerdicts, type ResultsFile, type ScenarioResult } from "./results.js";
import { collectScoredRuns, type ScoredRunGroup } from "./trends.js";
import { describeSourceKey, scenarioSourceKeys, PERSONA_KEY, SKILL_KEY } from "./sources.js";
import type { Verdict } from "./score.js";

/**
 * Run-over-run verdict stability, per scenario, derived on read from committed
 * history. No new measurement, nothing persisted.
 *
 * ## Why this exists
 *
 * Measured in the reference corpus (`plan`, deepseek, two consecutive full force runs,
 * 2026-08-05 → 2026-08-06): **A5 went 3/3 PASS to 0/3 FAIL and D1 went 1/3 to 3/3, each
 * run internally `flakiness 0.00`.** Two unanimous runs, opposite verdicts.
 *
 * `flakiness` is a within-run number: it measures how much the reps of ONE run
 * disagreed. A scenario sitting on a behavioural boundary can be unanimous inside every
 * run and still land on a different side each time — and then `flakiness 0.00` reads as
 * confidence when it is the opposite. Nothing in a single `results.yaml` can see this,
 * because the evidence is spread across files.
 *
 * ## What makes a flip a *stability* signal
 *
 * A verdict that changes because the scenario changed is not instability, it is an
 * edit — and reporting edits as instability would make this feature noise. So a pair of
 * adjacent runs is only compared when all of the following hold, and each rejection is
 * reported with its reason rather than silently dropped:
 *
 * | gate | rejected as | why |
 * |---|---|---|
 * | both verdicts conclusive | `inconclusive` | an ERROR or unresolved misfire says nothing about behaviour |
 * | same reps + pass threshold | `aggregation` | 1 draw vs a majority of 3 is not the same measurement (as in lift.ts) |
 * | the scenario's own recorded sources identical | `sources` | different question, or different rubric |
 * | those sources comparable at all | `unverified` | one run predates `source_hashes`, or the two use different key generations |
 *
 * **`SKILL.md` is deliberately NOT one of those gates.** In the measured case the skill
 * text HAD changed — an edit aimed at a different scenario — while A5's own stimulus and
 * rubric were byte-identical. Excluding that pair would have hidden the exact finding
 * this feature was asked to surface. Such a flip is reported with `skillChanged`, and
 * the note says what it means: either a side effect of that edit or a boundary cell.
 * Which of the two it is cannot be told from the record, and pretending otherwise would
 * be a guess dressed as a fact.
 *
 * Modes are never mixed (`collectScoredRuns` groups per mode), because placement moves
 * verdicts on identical text — a green run and a force run are two deployments.
 */

/** One run's contribution to a scenario's history. */
export interface StabilityPoint {
  timestamp: string;
  label: string | null;
  /** Override-aware, matching what the scorecard claims (an override IS the author's verdict). */
  verdict: Verdict;
  overridden: boolean;
  /** True for an `--only` run: real evidence about this scenario, but not a full run. */
  partial: boolean;
  reps: number;
  /**
   * Every rep in this run agreed AND there was more than one rep. A single rep is not
   * unanimous, it is one draw — the distinction the headline finding turns on.
   */
  unanimous: boolean;
}

/** Why a pair of adjacent runs could, or could not, be compared. */
export type PairStatus = "compared" | "inconclusive" | "aggregation" | "sources" | "unverified";

export interface StabilityPair {
  from: StabilityPoint;
  to: StabilityPoint;
  status: PairStatus;
  /** The verdict changed. Only meaningful when `status === "compared"`. */
  flipped: boolean;
  /** The skill text differed between these two runs (not a rejection — see the module doc). */
  skillChanged: boolean;
  /** Human labels of the scenario's own sources that differed (`status === "sources"`). */
  changedSources: string[];
  /** A flip where BOTH runs were internally unanimous — invisible to within-run flakiness. */
  unanimousFlip: boolean;
}

export type StabilityState = "stable" | "boundary" | "unmeasured";

export interface ScenarioStability {
  id: string;
  title: string;
  critical: boolean;
  tag: string;
  mode: string;
  model: string;
  /** The window, chronologically ascending (oldest first). */
  points: StabilityPoint[];
  /** Adjacent pairs within the window, oldest first. */
  pairs: StabilityPair[];
  compared: number;
  flips: number;
  /** Of `flips`, how many happened across a SKILL.md edit. */
  flipsAcrossSkillEdit: number;
  /** Of `flips`, how many were between two internally-unanimous runs. */
  unanimousFlips: number;
  /**
   * `flips / compared`, or null when nothing was comparable. 0 = never flipped in the
   * window; 1 = flipped at every opportunity.
   *
   * Same polarity as `flakiness` (0 is the quiet end) on purpose, and named for the
   * thing being counted rather than for its absence: `stability: 0.0` would have to
   * mean "perfectly stable", which reads exactly backwards next to `flaky 0.00`.
   */
  volatility: number | null;
  state: StabilityState;
}

export interface StabilityOptions {
  /** How many of the most recent scored runs to look at. Default 5. */
  window?: number;
}

const DEFAULT_WINDOW = 5;

/** A verdict that carries evidence about the task rather than about the harness or judge. */
function conclusive(v: { verdict: Verdict; suspect?: boolean }): boolean {
  // Same rule lift.ts applies, for the same reason: ERROR is a harness failure and an
  // unresolved misfire is a judge failure. Counting either as a side of a flip would
  // report infrastructure noise as behavioural instability.
  return !v.suspect && v.verdict !== "ERROR" && v.verdict !== "JUDGE-AMBIGUOUS";
}

function pointFor(r: ResultsFile, s: ScenarioResult, verdict: Verdict): StabilityPoint {
  const reps = s.reps ?? 1;
  return {
    timestamp: r.timestamp,
    label: r.label,
    verdict,
    overridden: s.override != null,
    partial: Boolean(r.partial),
    reps,
    unanimous: reps > 1 && s.flakiness === 0,
  };
}

/** reps + threshold, normalised the way lift.ts normalises it (a lone rep has no threshold). */
function shapeOf(s: ScenarioResult): string {
  const reps = s.reps ?? 1;
  return JSON.stringify([reps, reps > 1 ? s.pass_threshold ?? null : null]);
}

/**
 * Compare the recorded hashes of one scenario's own sources across two runs.
 *
 * Only keys BOTH runs recorded are compared: a key one side never hashed cannot be
 * shown to be unchanged. `shared === 0` means unverifiable (a pre-`source_hashes` run,
 * or a split-key run against a legacy combined-key one), which is reported as
 * `unverified` rather than assumed identical — the whole value of this feature is that
 * it does not claim more than the record supports.
 */
function compareSources(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
  keys: string[],
): { shared: number; changed: string[] } {
  if (!a || !b) return { shared: 0, changed: [] };
  let shared = 0;
  const changed: string[] = [];
  for (const key of keys) {
    const va = a[key];
    const vb = b[key];
    if (va === undefined || vb === undefined) continue;
    shared++;
    if (va !== vb) changed.push(describeSourceKey(key));
  }
  return { shared, changed };
}

/** Derive one scenario's stability within one tag × mode group. */
function stabilityForScenario(group: ScoredRunGroup, scenario: Scenario, window: number): ScenarioStability {
  // The window is over runs that HOLD this scenario: an `--only` run elsewhere in the
  // history must not consume a slot and shrink the comparison to nothing.
  const relevant = group.runs.filter((r) => r.scenarios.some((s) => s.id === scenario.id));
  const kept = relevant.slice(-window);
  // Skill-wide rubric: the persona moves every verdict in the skill, so it belongs with
  // the scenario's own sources rather than with the SKILL.md caveat.
  const keys = [...scenarioSourceKeys(scenario), PERSONA_KEY];

  const points: StabilityPoint[] = [];
  const raw: Array<{ r: ResultsFile; s: ScenarioResult; ok: boolean }> = [];
  for (const r of kept) {
    const i = r.scenarios.findIndex((s) => s.id === scenario.id);
    const s = r.scenarios[i];
    const eff = effectiveVerdicts(r.scenarios)[i];
    points.push(pointFor(r, s, eff.verdict));
    raw.push({ r, s, ok: conclusive(eff) });
  }

  const pairs: StabilityPair[] = [];
  for (let i = 1; i < raw.length; i++) {
    const prev = raw[i - 1];
    const cur = raw[i];
    const from = points[i - 1];
    const to = points[i];
    const skillChanged =
      prev.r.source_hashes?.[SKILL_KEY] !== undefined &&
      cur.r.source_hashes?.[SKILL_KEY] !== undefined &&
      prev.r.source_hashes[SKILL_KEY] !== cur.r.source_hashes[SKILL_KEY];
    const base = { from, to, flipped: false, skillChanged, changedSources: [] as string[], unanimousFlip: false };

    if (!prev.ok || !cur.ok) {
      pairs.push({ ...base, status: "inconclusive" });
      continue;
    }
    if (shapeOf(prev.s) !== shapeOf(cur.s)) {
      pairs.push({ ...base, status: "aggregation" });
      continue;
    }
    const src = compareSources(prev.r.source_hashes, cur.r.source_hashes, keys);
    if (src.shared === 0) {
      pairs.push({ ...base, status: "unverified" });
      continue;
    }
    if (src.changed.length > 0) {
      pairs.push({ ...base, status: "sources", changedSources: src.changed });
      continue;
    }
    const flipped = from.verdict !== to.verdict;
    pairs.push({
      ...base,
      status: "compared",
      flipped,
      unanimousFlip: flipped && from.unanimous && to.unanimous,
    });
  }

  const compared = pairs.filter((p) => p.status === "compared").length;
  const flipped = pairs.filter((p) => p.status === "compared" && p.flipped);
  return {
    id: scenario.id,
    title: scenario.title,
    critical: scenario.critical,
    tag: group.tag,
    mode: group.mode,
    model: group.model,
    points,
    pairs,
    compared,
    flips: flipped.length,
    flipsAcrossSkillEdit: flipped.filter((p) => p.skillChanged).length,
    unanimousFlips: flipped.filter((p) => p.unanimousFlip).length,
    volatility: compared === 0 ? null : flipped.length / compared,
    // "unmeasured" is a third state on purpose: a scenario with one run, or with no
    // comparable pair, has NOT been shown to be stable. Collapsing it into "stable"
    // would turn absence of evidence into evidence — the same conflation lift.ts
    // refuses when it reports "no red baseline" instead of a zero.
    state: compared === 0 ? "unmeasured" : flipped.length > 0 ? "boundary" : "stable",
  };
}

/** Derive stability for every scenario × tag × mode from an already-read history. */
export function stabilityFrom(groups: ScoredRunGroup[], spec: Spec, opts: StabilityOptions = {}): ScenarioStability[] {
  const window = Math.max(2, opts.window ?? DEFAULT_WINDOW); // a window of 1 has no pair to compare
  const out: ScenarioStability[] = [];
  for (const group of groups) {
    for (const scenario of spec.scenarios) {
      out.push(stabilityForScenario(group, scenario, window));
    }
  }
  return out;
}

/**
 * Read `<skillDir>/tests/results/` and derive run-over-run stability per scenario ×
 * model tag × delivery mode. Free and offline: it reads committed results.yaml files
 * and computes; it never runs a model, a judge, or a harness.
 *
 * Deliberately derived on read rather than stored in results.yaml, for the reason lift
 * is: stability is a fact about a SET of runs, so a copy inside one run's file would be
 * wrong the moment the next run lands — the stale-scorecard failure `source_hashes`
 * exists to prevent. It also means this works retroactively on history recorded by
 * every earlier version.
 */
export function collectStability(skillDir: string, opts: StabilityOptions = {}): ScenarioStability[] {
  const spec = loadSpec(join(skillDir, "tests", "specification.yaml"));
  return stabilityFrom(collectScoredRuns(skillDir), spec, opts);
}

/** Scenarios that flipped at least once — the cells a single run reads as too certain. */
export function boundaryCells(all: ScenarioStability[]): ScenarioStability[] {
  return all.filter((s) => s.state === "boundary");
}

/**
 * The window as one readable string: `PASS!→FAIL!` or `FAIL⋯PASS→PASS!`.
 *
 * `→` is a step this comparison counted; `⋯` is a step it rejected (an edit, a
 * different aggregation, unverifiable hashes); `!` marks a run whose reps were
 * internally unanimous. The two arrows have to differ, or a path reading `FAIL→PASS`
 * would sit next to "held its verdict" and look like a contradiction — the window shows
 * every run, but only some of the steps between them are evidence.
 */
export const PATH_LEGEND = "→ comparable step · ⋯ step not comparable · ! that run's reps were unanimous";

export function verdictPath(s: ScenarioStability): string {
  const label = (p: StabilityPoint) => `${p.verdict}${p.unanimous ? "!" : ""}${p.overridden ? "(override)" : ""}`;
  let out = s.points.length > 0 ? label(s.points[0]) : "";
  s.pairs.forEach((pair, i) => {
    out += `${pair.status === "compared" ? "→" : "⋯"}${label(s.points[i + 1])}`;
  });
  return out;
}

/**
 * The one-line human statement. This string is the feature: a number nobody can read
 * ("volatility 1.00") would leave the reader exactly where a single run left them.
 *
 * Every branch says what the record supports and no more — which of "the edit did it"
 * and "the cell is bimodal" is true cannot be told from committed results, so the
 * across-an-edit wording names both.
 */
export function stabilityNote(s: ScenarioStability): string {
  if (s.state === "boundary") {
    const parts = [
      `${s.id} flipped its verdict in ${s.flips} of ${s.compared} comparable run-to-run step(s) (${verdictPath(s)})`,
    ];
    if (s.unanimousFlips > 0) {
      parts.push(
        `${s.unanimousFlips === s.flips ? "each flip was" : `${s.unanimousFlips} flip(s) were`} between runs that were` +
          ` INTERNALLY UNANIMOUS (flakiness 0.00) — within-run reps cannot see this`,
      );
    }
    if (s.flipsAcrossSkillEdit === s.flips && s.flips > 0) {
      parts.push(
        `SKILL.md changed across ${s.flips === 1 ? "that step" : "those steps"}, while this scenario's own stimulus` +
          ` and rubric did not — so it is either a side effect of that edit or a boundary cell, and the record cannot say which`,
      );
    } else if (s.flipsAcrossSkillEdit > 0) {
      parts.push(`${s.flipsAcrossSkillEdit} of them across a SKILL.md edit`);
    } else {
      parts.push(`on unchanged skill text — treat a single run of this cell as one draw, not a measurement`);
    }
    return parts.join("; ");
  }
  if (s.state === "stable") {
    // "across N comparable step(s)", not "across N runs": the window can hold runs whose
    // steps were rejected, and claiming those as agreement would overstate the evidence.
    return `${s.id} held its verdict across ${s.compared} comparable run-to-run step(s) (${verdictPath(s)})`;
  }
  const why = new Map<PairStatus, number>();
  for (const p of s.pairs) if (p.status !== "compared") why.set(p.status, (why.get(p.status) ?? 0) + 1);
  const reasons = [...why.entries()].map(([status, n]) => `${n} ${REJECTION[status]}`);
  const changed = [...new Set(s.pairs.flatMap((p) => p.changedSources))];
  const detail = changed.length > 0 ? ` (${changed.join(", ")} changed — an edit, not a flip)` : "";
  return s.points.length < 2
    ? `${s.id} has ${s.points.length} run in this mode — no run-over-run comparison exists yet`
    : `${s.id} has no comparable run-to-run step: ${reasons.join(", ")}${detail}`;
}

const REJECTION: Record<PairStatus, string> = {
  compared: "compared",
  inconclusive: "step(s) with an ERROR or unresolved misfire",
  aggregation: "step(s) aggregated differently (reps or pass threshold)",
  sources: "step(s) where the scenario's own sources changed",
  unverified: "step(s) whose recorded hashes cannot be compared",
};
