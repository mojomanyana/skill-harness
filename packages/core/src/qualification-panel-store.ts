import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { collapseQualificationJudgePanel, aggregateQualificationCell, type QualificationCellResult, type QualificationJudgePanelResult } from "./qualification-panels.js";
import { readQualificationJudgePanelMember } from "./qualification-runner.js";
import { atomicWriteCanonical, qualificationSpoolPaths, readCanonicalJson, readQualificationInvocation, readQualificationSpoolConfig, type QualificationInvocationV1 } from "./qualification-store.js";
import { qualificationCanonicalJson, type QualificationBoardV1 } from "./qualification-config.js";

export function recordQualificationJudgePanel(options: {
  spool_dir: string;
  panel_id: string;
  member_invocation_ids: string[];
}): QualificationJudgePanelResult {
  qualificationDerivedId(options.panel_id, "panel_id");
  const config = readQualificationSpoolConfig(options.spool_dir);
  if (!config.judge_panel || !config.board) throw new Error("qualification spool does not select judge panels");
  const declaredCell = config.board.cells.find((cell) => cell.panels.some((panel) => panel.id === options.panel_id));
  if (!declaredCell) throw new Error(`qualification panel ${options.panel_id} is not declared by the approved board`);
  const invocations = options.member_invocation_ids.map((id) => readQualificationInvocation(options.spool_dir, id));
  if (invocations.length < 2 || invocations.length > 3) throw new Error("qualification panel requires two or three member invocation ids");
  const first = invocations[0];
  if (!first.panel || first.panel.id !== options.panel_id) throw new Error("qualification panel id does not match its first member");
  for (const invocation of invocations) assertInvocationMatchesDeclaredCell(invocation, declaredCell);
  for (const [index, invocation] of invocations.entries()) {
    if (!invocation.panel || invocation.panel.id !== options.panel_id || invocation.panel.member_ordinal !== index + 1 ||
        invocation.panel.subject_invocation_id !== first.panel.subject_invocation_id ||
        invocation.panel.subject_artifact_sha256 !== first.panel.subject_artifact_sha256 ||
        invocation.measurement_identity_sha256 !== first.measurement_identity_sha256 ||
        invocation.scenario.id !== first.scenario.id || invocation.scenario.version !== first.scenario.version ||
        invocation.scenario.stimulus_sha256 !== first.scenario.stimulus_sha256 || invocation.scenario.rubric_sha256 !== first.scenario.rubric_sha256 ||
        invocation.repetition !== first.repetition || invocation.arms.subject !== first.arms.subject || invocation.arms.judge !== first.arms.judge) {
      throw new Error(`qualification panel member ${invocation.invocation_id} binding mismatch`);
    }
  }
  const members = options.member_invocation_ids.map((id) => readQualificationJudgePanelMember(options.spool_dir, id));
  const result = collapseQualificationJudgePanel({
    panel_id: options.panel_id,
    scenario_id: declaredCell.scenario_id,
    subject_arm: declaredCell.subject_arm,
    repetition: declaredCell.panels.find((panel) => panel.id === options.panel_id)!.repetition,
    critical: declaredCell.critical,
    members,
  });
  if (result.state === "unresolved" && result.disagreement.initial_split) throw new Error(`qualification panel ${options.panel_id} requires its authorized tie-break before a final result can be recorded`);
  const path = join(qualificationSpoolPaths(options.spool_dir).root, "panels", `${options.panel_id}.json`);
  atomicWriteCanonical(path, result, true);
  return result;
}

export function recordQualificationCell(options: {
  spool_dir: string;
  cell_id: string;
}): QualificationCellResult {
  qualificationDerivedId(options.cell_id, "cell_id");
  const config = readQualificationSpoolConfig(options.spool_dir);
  const declared = config.board?.cells.find((cell) => cell.id === options.cell_id);
  if (!config.judge_panel || !declared) throw new Error(`qualification cell ${options.cell_id} is not declared by the approved panel board`);
  const panelIds = declared.panels.map((panel) => panel.id);
  const panels = panelIds.map((id) => readAndValidatePanel(options.spool_dir, id));
  if (new Set(panels.map((panel) => panel.repetition)).size !== panels.length) throw new Error("qualification cell contains duplicate repetitions");
  if (panels.some((panel) => panel.critical !== declared.critical)) throw new Error("qualification cell criticality does not match its approved board declaration");
  const result = aggregateQualificationCell({
    cell_id: options.cell_id,
    scenario_id: declared.scenario_id,
    subject_arm: declared.subject_arm,
    critical: declared.critical,
    pass_threshold: declared.pass_threshold,
    panels,
  });
  atomicWriteCanonical(join(qualificationSpoolPaths(options.spool_dir).root, "cells", `${options.cell_id}.json`), result, true);
  return result;
}

export function validateQualificationPanelOutputs(spoolDir: string): { panels: number; cells: number } {
  const root = qualificationSpoolPaths(spoolDir).root;
  const config = readQualificationSpoolConfig(spoolDir);
  const invocationIds = readdirSync(qualificationSpoolPaths(spoolDir).invocations, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  const invocations = invocationIds.map((id) => readQualificationInvocation(spoolDir, id));
  const panelIds = jsonRecordIds(join(root, "panels"));
  if (config.judge_panel) {
    if (!config.board) throw new Error("qualification panel configuration lacks its approved board");
    const expectedPanels = config.board.cells.flatMap((cell) => cell.panels.map((panel) => panel.id)).sort();
    if (qualificationCanonicalJson(panelIds) !== qualificationCanonicalJson(expectedPanels)) throw new Error("qualification panel outputs are incomplete or contain undeclared panels");
    const expectedSubjectSlots = config.board.cells.flatMap((cell) => cell.panels.map((panel) => ({ cell, repetition: panel.repetition })));
    const subjectInvocations = invocations.filter((invocation) => invocation.role === "subject");
    if (subjectInvocations.length !== expectedSubjectSlots.length) throw new Error("qualification approved board subject invocations are incomplete or contain extras");
    for (const slot of expectedSubjectSlots) {
      const matching = subjectInvocations.filter((invocation) => invocation.repetition === slot.repetition && invocation.scenario.id === slot.cell.scenario_id && invocation.arms.selected === slot.cell.subject_arm);
      if (matching.length !== 1) throw new Error("qualification approved board must have exactly one subject invocation per scenario/arm/repetition");
      assertInvocationMatchesDeclaredCell(matching[0], slot.cell);
    }
  } else if (panelIds.length > 0) throw new Error("historical qualification spool contains undeclared panel outputs");
  for (const id of panelIds) readAndValidatePanel(spoolDir, id);
  const cellIds = jsonRecordIds(join(root, "cells"));
  if (config.judge_panel) {
    const expectedCells = config.board!.cells.map((cell) => cell.id).sort();
    if (qualificationCanonicalJson(cellIds) !== qualificationCanonicalJson(expectedCells)) throw new Error("qualification cell outputs are incomplete or contain undeclared cells");
  } else if (cellIds.length > 0) throw new Error("historical qualification spool contains undeclared cell outputs");
  for (const id of cellIds) {
    const path = join(root, "cells", `${id}.json`);
    const recorded = readCanonicalJson(path, `qualification cell ${id}`) as QualificationCellResult;
    const declared = config.board?.cells.find((cell) => cell.id === id);
    if (!declared) throw new Error(`qualification cell ${id} is not declared by the approved board`);
    const panels = declared.panels.map((panel) => readAndValidatePanel(spoolDir, panel.id));
    const rebuilt = aggregateQualificationCell({
      cell_id: declared.id,
      scenario_id: declared.scenario_id,
      subject_arm: declared.subject_arm,
      critical: declared.critical,
      pass_threshold: declared.pass_threshold,
      panels,
    });
    if (qualificationCanonicalJson(recorded) !== qualificationCanonicalJson(rebuilt)) throw new Error(`qualification cell ${id} does not match validated panel evidence`);
  }
  return { panels: panelIds.length, cells: cellIds.length };
}

function readAndValidatePanel(spoolDir: string, id: string): QualificationJudgePanelResult {
  const path = join(qualificationSpoolPaths(spoolDir).root, "panels", `${id}.json`);
  const recorded = readCanonicalJson(path, `qualification judge panel ${id}`) as QualificationJudgePanelResult;
  const config = readQualificationSpoolConfig(spoolDir);
  const declared = config.board?.cells.find((cell) => cell.panels.some((panel) => panel.id === id));
  if (!declared) throw new Error(`qualification judge panel ${id} is not declared by the approved board`);
  const invocations = recorded.members.map((member) => readQualificationInvocation(spoolDir, member.invocation_id));
  const first = invocations[0];
  if (!first?.panel || first.panel.id !== id) throw new Error(`qualification judge panel ${id} member binding mismatch`);
  for (const [index, invocation] of invocations.entries()) {
    if (!invocation.panel || invocation.panel.id !== id || invocation.panel.member_ordinal !== index + 1 ||
        invocation.panel.subject_invocation_id !== first.panel.subject_invocation_id ||
        invocation.panel.subject_artifact_sha256 !== first.panel.subject_artifact_sha256 ||
        invocation.measurement_identity_sha256 !== first.measurement_identity_sha256 ||
        invocation.scenario.id !== first.scenario.id || invocation.scenario.version !== first.scenario.version ||
        invocation.scenario.stimulus_sha256 !== first.scenario.stimulus_sha256 || invocation.scenario.rubric_sha256 !== first.scenario.rubric_sha256 ||
        invocation.repetition !== first.repetition || invocation.arms.subject !== first.arms.subject || invocation.arms.judge !== first.arms.judge) {
      throw new Error(`qualification judge panel ${id} member binding mismatch`);
    }
  }
  for (const invocation of invocations) assertInvocationMatchesDeclaredCell(invocation, declared);
  const members = recorded.members.map((member) => readQualificationJudgePanelMember(spoolDir, member.invocation_id));
  const rebuilt = collapseQualificationJudgePanel({
    panel_id: id,
    scenario_id: declared.scenario_id,
    subject_arm: declared.subject_arm,
    repetition: declared.panels.find((panel) => panel.id === id)!.repetition,
    critical: declared.critical,
    members,
  });
  if (rebuilt.state === "unresolved" && rebuilt.disagreement.initial_split) throw new Error(`qualification judge panel ${id} is incomplete: its clean split requires an authorized tie-break`);
  if (qualificationCanonicalJson(recorded) !== qualificationCanonicalJson(rebuilt)) throw new Error(`qualification judge panel ${id} does not match validated invocation evidence`);
  return recorded;
}

function assertInvocationMatchesDeclaredCell(invocation: QualificationInvocationV1, cell: QualificationBoardV1["cells"][number]): void {
  if (invocation.measurement_identity_sha256 !== cell.measurement_identity_sha256 || invocation.scenario.id !== cell.scenario_id ||
      invocation.scenario.version !== cell.scenario_version || invocation.scenario.stimulus_sha256 !== cell.stimulus_sha256 ||
      invocation.scenario.rubric_sha256 !== cell.rubric_sha256 || invocation.arms.subject !== cell.subject_arm ||
      (invocation.role === "subject" && (invocation.scenario.input_sha256 !== cell.subject_input_sha256 || invocation.arms.selected !== cell.subject_arm)) ||
      (invocation.role === "judge" && (!invocation.panel || cell.judge_arms[invocation.panel.member_ordinal - 1] !== invocation.arms.selected))) {
    throw new Error(`qualification invocation ${invocation.invocation_id} does not match its approved board cell identity`);
  }
}

function qualificationDerivedId(value: string, label: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) throw new Error(`qualification ${label} must be a bounded ASCII identifier`);
}

function jsonRecordIds(path: string): string[] {
  if (!existsSync(path)) return [];
  const entries = readdirSync(path, { withFileTypes: true });
  const invalid = entries.find((entry) => !entry.isFile() || !entry.name.endsWith(".json"));
  if (invalid) throw new Error(`qualification derived-output directory contains undeclared entry ${invalid.name}`);
  return entries.map((entry) => entry.name.slice(0, -5)).sort();
}
