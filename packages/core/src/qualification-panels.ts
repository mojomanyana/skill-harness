import { collapseVotePanel, type PanelVote } from "./vote-panel.js";

export const QUALIFICATION_JUDGE_PANEL_POLICY_VERSION = "qualification-judge-panel-policy-v1" as const;
export const QUALIFICATION_JUDGE_PANEL_RESULT_VERSION = "qualification-judge-panel-result-v1" as const;
export const QUALIFICATION_CELL_RESULT_VERSION = "qualification-cell-result-v1" as const;

/** Closed policy persisted in qualification configuration. */
export const QUALIFICATION_JUDGE_PANEL_POLICY = {
  schema_version: QUALIFICATION_JUDGE_PANEL_POLICY_VERSION,
  initial_judge_calls: 2,
  agreement: "two-matching-clean-votes",
  split: "one-conditional-tie-break",
  max_judge_calls: 3,
  error: "record-as-non-vote",
  unresolved: "inconclusive-blocks-acceptance",
  behavioral_failure: "record-and-continue-read-only-board",
  integrity_failure: "halt",
  wave_a_call_budget: { artifacts: 54, minimum: 108, maximum: 162 },
  complete_program_call_budget: { artifacts: 642, minimum: 1284, maximum: 1926 },
} as const;

export interface QualificationJudgePanelMember extends PanelVote {
  invocation_id: string;
  judge: { provider: string; model: string };
  reason: string;
  artifact: { sha256: string; bytes: number } | null;
  terminal_receipt_sha256: string;
}

export interface QualificationJudgePanelResult {
  schema_version: typeof QUALIFICATION_JUDGE_PANEL_RESULT_VERSION;
  panel_id: string;
  scenario_id: string;
  subject_arm: string;
  repetition: number;
  critical: boolean;
  state: "confirmed" | "tie_broken" | "unresolved";
  verdict?: "PASS" | "FAIL";
  members: QualificationJudgePanelMember[];
  judge_calls: number;
  clean_votes: number;
  disagreement: { initial_split: boolean; minority_rate: number };
  acceptance: "pass" | "fail" | "inconclusive";
  collection: "continue" | "halt";
}

/**
 * Collapse members that have already passed the qualification invocation,
 * OAuth, accounting, receipt, and artifact boundary.
 */
export function collapseQualificationJudgePanel(options: {
  panel_id: string;
  scenario_id: string;
  subject_arm: string;
  repetition: number;
  critical: boolean;
  members: QualificationJudgePanelMember[];
}): QualificationJudgePanelResult {
  const collapse = collapseVotePanel(options.members);
  if (options.members.length < 2 || options.members.length > 3) throw new Error("qualification judge panel must contain two or three members");
  if (options.members.some((member, index) => member.ordinal !== index + 1)) throw new Error("qualification judge panel member ordinals must be contiguous from one");
  if (options.members.length === 3 && !collapse.split) throw new Error("qualification judge panel third member is permitted only after a clean initial split");
  const acceptance = collapse.state === "unresolved" ? "inconclusive" : collapse.verdict === "PASS" ? "pass" : "fail";
  return {
    schema_version: QUALIFICATION_JUDGE_PANEL_RESULT_VERSION,
    panel_id: options.panel_id,
    scenario_id: options.scenario_id,
    subject_arm: options.subject_arm,
    repetition: options.repetition,
    critical: options.critical,
    state: collapse.state,
    ...(collapse.verdict ? { verdict: collapse.verdict } : {}),
    members: options.members,
    judge_calls: options.members.length,
    clean_votes: collapse.clean_votes,
    disagreement: { initial_split: collapse.split, minority_rate: collapse.minority_rate },
    acceptance,
    collection: "continue",
  };
}

export interface QualificationCellResult {
  schema_version: typeof QUALIFICATION_CELL_RESULT_VERSION;
  cell_id: string;
  scenario_id: string;
  subject_arm: string;
  critical: boolean;
  pass_threshold: number;
  panels: QualificationJudgePanelResult[];
  verdict?: "PASS" | "FAIL";
  critical_failure: boolean;
  acceptance: "pass" | "fail" | "inconclusive";
  collection: "continue" | "halt";
  disagreement: {
    judge_calls: number;
    clean_votes: number;
    split_artifacts: number;
    artifacts_with_two_clean_initial_votes: number;
    unresolved_artifacts: number;
    judge_split_rate: number;
  };
}

export function aggregateQualificationCell(options: {
  cell_id: string;
  scenario_id: string;
  subject_arm: string;
  critical: boolean;
  pass_threshold: number;
  panels: QualificationJudgePanelResult[];
}): QualificationCellResult {
  if (!Number.isSafeInteger(options.pass_threshold) || options.pass_threshold < 1) throw new Error("qualification cell pass_threshold must be a positive integer");
  if (options.panels.length === 0) throw new Error("qualification cell requires at least one panel");
  if (new Set(options.panels.map((panel) => panel.panel_id)).size !== options.panels.length || new Set(options.panels.map((panel) => panel.repetition)).size !== options.panels.length) throw new Error("qualification cell contains duplicate panels or repetitions");
  for (const panel of options.panels) {
    if (panel.scenario_id !== options.scenario_id || panel.subject_arm !== options.subject_arm || panel.critical !== options.critical) throw new Error("qualification cell panel identity or criticality mismatch");
  }
  const unresolved = options.panels.filter((panel) => panel.state === "unresolved").length;
  const passes = options.panels.filter((panel) => panel.verdict === "PASS").length;
  // Same safety rule as ordinary skill-harness repetitions: a declared threshold
  // cannot weaken Critical semantics; every clean Critical repetition must pass.
  const effectiveThreshold = options.critical ? options.panels.length : options.pass_threshold;
  const verdict: "PASS" | "FAIL" | undefined = unresolved > 0 ? undefined : passes >= effectiveThreshold ? "PASS" : "FAIL";
  const denominator = options.panels.filter((panel) => panel.members.filter((member) => member.ordinal <= 2 && !member.suspect && (member.verdict === "PASS" || member.verdict === "FAIL")).length === 2).length;
  const splitArtifacts = options.panels.filter((panel) => panel.disagreement.initial_split).length;
  const acceptance = verdict === undefined ? "inconclusive" : verdict === "PASS" ? "pass" : "fail";
  return {
    schema_version: QUALIFICATION_CELL_RESULT_VERSION,
    cell_id: options.cell_id,
    scenario_id: options.scenario_id,
    subject_arm: options.subject_arm,
    critical: options.critical,
    pass_threshold: effectiveThreshold,
    panels: options.panels,
    ...(verdict ? { verdict } : {}),
    critical_failure: options.critical && verdict === "FAIL",
    acceptance,
    collection: "continue",
    disagreement: {
      judge_calls: options.panels.reduce((sum, panel) => sum + panel.judge_calls, 0),
      clean_votes: options.panels.reduce((sum, panel) => sum + panel.clean_votes, 0),
      split_artifacts: splitArtifacts,
      artifacts_with_two_clean_initial_votes: denominator,
      unresolved_artifacts: unresolved,
      judge_split_rate: denominator === 0 ? 0 : splitArtifacts / denominator,
    },
  };
}
