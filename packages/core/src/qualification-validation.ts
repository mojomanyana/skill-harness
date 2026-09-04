import { validateQualificationPanelOutputs } from "./qualification-panel-store.js";
import { validateQualificationBaseSpool } from "./qualification-runner.js";

/** Canonical final validator: invocation evidence plus panel-board completeness. */
export function validateQualificationRunnerSpool(spoolDir: string) {
  const base = validateQualificationBaseSpool(spoolDir);
  return { ...base, derived: validateQualificationPanelOutputs(spoolDir) };
}
