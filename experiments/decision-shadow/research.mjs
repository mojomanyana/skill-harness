import { createHash, randomUUID } from "node:crypto";
import { open, readFile } from "node:fs/promises";
import { DECISION_SYSTEM_PROMPT } from "@skill-harness/adapters";
import { scorePredictions } from "./dataset.mjs";
import { parseExperiment, learningDigest } from "./learning-data.mjs";

export const PROMPT_REVISION = "decision-input-question-v1";
export const decisionPrompt = (c) =>
  JSON.stringify({ input: c.input, question: c.question });
export const fullCaseSetHash = (cases) =>
  learningDigest(cases.map((c) => ({ id: c.id, hash: c.hash })));
const hash = (s) => createHash("sha256").update(s).digest("hex");
function check(ok, message) {
  if (!ok) throw TypeError(message);
}
function keys(value, names, name) {
  check(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).sort().join("|") === [...names].sort().join("|"),
    name + " has unsupported/missing fields",
  );
}
function sha(value) {
  check(
    typeof value === "string" && /^[0-9a-f]{64}$/.test(value),
    "invalid digest",
  );
}
function selected(cases, manifest, split) {
  check(
    ["train", "validation", "test", "all"].includes(split),
    "explicit train/validation/test/all split required",
  );
  return cases.filter(
    (c, i) => split === "all" || manifest.entries[i].split === split,
  );
}
export function previewPi(cases, manifest, { model, thinking, split }) {
  manifest = parseExperiment(cases, manifest);
  check(
    /^openai-codex:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(model),
    "explicit subscription model required",
  );
  check(
    ["off", "minimal", "low", "medium", "high", "xhigh"].includes(thinking),
    "explicit thinking level required",
  );
  const subset = selected(cases, manifest, split);
  check(subset.length > 0, "selected split is empty");
  return {
    schema: 1,
    kind: "decision-pi-preview",
    model,
    thinking,
    split,
    experimentHash: learningDigest(manifest),
    caseSetHash: fullCaseSetHash(cases),
    promptRevision: PROMPT_REVISION,
    trainingEligible: false,
    requests: subset.map((c) => ({
      caseId: c.id,
      caseHash: c.hash,
      prompt: decisionPrompt(c),
      promptSha256: hash(decisionPrompt(c)),
    })),
  };
}
export async function runPiBaseline({
  cases,
  manifest,
  model,
  thinking,
  split,
  piPackage,
  nodeExecutable,
  authPath,
  out,
  timeoutMs,
  runner,
  emit = () => {},
}) {
  const preview = previewPi(cases, manifest, { model, thinking, split });
  const adapter = await import("@skill-harness/adapters");
  const call = runner ?? adapter.runPiDecision;
  const header = {
    schema: 2,
    kind: "decision-pi-run",
    runId: randomUUID(),
    createdAt: new Date().toISOString(),
    caseSetHash: preview.caseSetHash,
    experimentHash: preview.experimentHash,
    requestedModel: model,
    thinking,
    split,
    selected: preview.requests.map((r) => ({
      caseId: r.caseId,
      caseHash: r.caseHash,
    })),
    promptRevision: PROMPT_REVISION,
    systemPromptSha256: hash(adapter.DECISION_SYSTEM_PROMPT),
    trainingEligible: false,
  };
  const file = await open(out, "wx", 0o600);
  const append = async (row) => {
    await file.writeFile(JSON.stringify(row) + "\n");
    await file.sync();
  };
  let failed = false;
  try {
    await append(header);
    for (const request of preview.requests) {
      let result;
      try {
        result = await call({
          piPackage,
          model,
          thinking,
          nodeExecutable,
          authPath,
          prompt: request.prompt,
          caseId: request.caseId,
          timeoutMs,
        });
      } catch {
        result = {
          status: "error",
          probability: null,
          error: "Pi decision failed; no retry or fallback.",
        };
        failed = true;
      }
      await append({
        kind: "prediction",
        caseId: request.caseId,
        caseHash: request.caseHash,
        promptSha256: request.promptSha256,
        ...result,
        trainingEligible: false,
      });
      emit({ caseId: request.caseId, status: result.status });
      if (failed) break;
    }
  } finally {
    await file.close();
  }
  if (failed)
    throw Error(
      "Pi comparison stopped after an error; partial run retained without retry.",
    );
  return header;
}
export function parsePiRun(text, cases, manifest) {
  manifest = parseExperiment(cases, manifest);
  let rows;
  try {
    rows = text
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
  } catch {
    throw Error("Invalid Pi run JSONL");
  }
  const [header, ...records] = rows;
  keys(
    header,
    [
      "schema",
      "kind",
      "runId",
      "createdAt",
      "caseSetHash",
      "experimentHash",
      "requestedModel",
      "thinking",
      "split",
      "selected",
      "promptRevision",
      "systemPromptSha256",
      "trainingEligible",
    ],
    "Pi run header",
  );
  check(
    header.schema === 2 &&
      header.kind === "decision-pi-run" &&
      header.trainingEligible === false,
    "unsupported Pi run",
  );
  check(
    /^[0-9a-f-]{36}$/.test(header.runId) &&
      new Date(header.createdAt).toISOString() === header.createdAt,
    "invalid run identity/time",
  );
  const preview = previewPi(cases, manifest, {
    model: header.requestedModel,
    thinking: header.thinking,
    split: header.split,
  });
  check(
    header.caseSetHash === preview.caseSetHash &&
      header.experimentHash === preview.experimentHash &&
      header.promptRevision === PROMPT_REVISION &&
      learningDigest(header.selected) ===
        learningDigest(
          preview.requests.map((r) => ({
            caseId: r.caseId,
            caseHash: r.caseHash,
          })),
        ),
    "Pi run belongs to a different experiment/selection",
  );
  check(
    header.systemPromptSha256 === hash(DECISION_SYSTEM_PROMPT),
    "Pi system prompt revision mismatch",
  );
  check(records.length <= preview.requests.length, "too many Pi predictions");
  let worker = null;
  const sessions = new Set();
  for (const [i, r] of records.entries()) {
    const expected = preview.requests[i];
    check(
      r.caseId === expected.caseId &&
        r.caseHash === expected.caseHash &&
        r.promptSha256 === expected.promptSha256 &&
        r.kind === "prediction" &&
        r.trainingEligible === false,
      "Pi prediction identity/order mismatch",
    );
    if (r.status === "error") {
      keys(
        r,
        [
          "kind",
          "caseId",
          "caseHash",
          "promptSha256",
          "status",
          "probability",
          "error",
          "trainingEligible",
        ],
        "Pi error",
      );
      check(
        r.probability === null &&
          r.error === "Pi decision failed; no retry or fallback." &&
          i === records.length - 1,
        "invalid Pi error prefix",
      );
      continue;
    }
    keys(
      r,
      [
        "kind",
        "caseId",
        "caseHash",
        "promptSha256",
        "status",
        "probability",
        "resolvedModel",
        "piVersion",
        "nativeFinal",
        "usage",
        "route",
        "trainingEligible",
        "latencyMs",
        "workerSha256",
        "systemPromptSha256",
      ],
      "Pi prediction",
    );
    check(
      ["answered", "abstained"].includes(r.status) &&
        r.resolvedModel === header.requestedModel &&
        r.piVersion === "1.0.4" &&
        r.systemPromptSha256 === header.systemPromptSha256,
      "Pi result route/version mismatch",
    );
    check(
      r.status === "abstained"
        ? r.probability === null
        : typeof r.probability === "number" &&
            Number.isFinite(r.probability) &&
            r.probability >= 0 &&
            r.probability <= 1,
      "invalid Pi probability",
    );
    keys(r.nativeFinal, ["sessionId", "messageId", "sha256"], "native final");
    for (const k of ["sessionId", "messageId"])
      check(
        typeof r.nativeFinal[k] === "string" &&
          r.nativeFinal[k].length > 0 &&
          r.nativeFinal[k].length <= 256,
        "invalid native identity",
      );
    sha(r.nativeFinal.sha256);
    check(
      !sessions.has(r.nativeFinal.sessionId),
      "Pi cases must have independent fresh sessions",
    );
    sessions.add(r.nativeFinal.sessionId);
    keys(r.route, ["oauth", "subscription"], "route");
    check(
      r.route.oauth === true && r.route.subscription === true,
      "non-subscription Pi result",
    );
    keys(r.usage, ["inputTokens", "outputTokens", "costUsd"], "usage");
    check(r.usage.costUsd === null, "subscription cost must not be estimated");
    for (const k of ["inputTokens", "outputTokens"])
      check(
        r.usage[k] === null ||
          (Number.isSafeInteger(r.usage[k]) && r.usage[k] >= 0),
        "invalid Pi usage",
      );
    check(Number.isFinite(r.latencyMs) && r.latencyMs >= 0, "invalid latency");
    sha(r.workerSha256);
    if (worker !== null)
      check(worker === r.workerSha256, "mixed worker revisions");
    worker = r.workerSha256;
  }
  return {
    header,
    records,
    runSha256: hash(text),
    cases: preview.requests.map((r) => cases.find((c) => c.id === r.caseId)),
    experimentBound: true,
  };
}
function metrics(cases, labels, records) {
  const normalized = records.map((r) => ({
    caseId: r.caseId,
    caseHash: r.caseHash,
    status: r.status === "abstained" ? "refused" : r.status,
    probability: r.probability,
  }));
  const score = scorePredictions(cases, labels, normalized);
  const bins = Array.from({ length: 5 }, (_, i) => ({
    lower: i / 5,
    upper: (i + 1) / 5,
    count: 0,
    meanProbability: null,
    observedPositiveFraction: null,
  }));
  for (const r of records) {
    const label = labels.find((l) => l.caseId === r.caseId);
    if (r.status !== "answered" || !label) continue;
    const bin = bins[Math.min(4, Math.floor(r.probability * 5))];
    bin.count++;
    bin.meanProbability =
      (bin.meanProbability ?? 0) +
      (r.probability - (bin.meanProbability ?? 0)) / bin.count;
    bin.observedPositiveFraction =
      (bin.observedPositiveFraction ?? 0) +
      (Number(label.value) - (bin.observedPositiveFraction ?? 0)) / bin.count;
  }
  const latency = records.filter((r) => Number.isFinite(r.latencyMs));
  let mean = null;
  latency.forEach((r, i) => {
    mean = (mean ?? 0) + (r.latencyMs - (mean ?? 0)) / (i + 1);
  });
  return {
    ...score,
    abstained: records.filter((r) => r.status === "abstained").length,
    calibration: bins,
    latencyMs: { reported: latency.length, attempted: records.length, mean },
    errorCases: records
      .filter((r) => r.status === "error")
      .map((r) => r.caseId),
    falsePositiveCases: records
      .filter(
        (r) =>
          r.status === "answered" &&
          r.probability >= 0.5 &&
          labels.some((l) => l.caseId === r.caseId && !l.value),
      )
      .map((r) => r.caseId),
    falseNegativeCases: records
      .filter(
        (r) =>
          r.status === "answered" &&
          r.probability < 0.5 &&
          labels.some((l) => l.caseId === r.caseId && l.value),
      )
      .map((r) => r.caseId),
  };
}
export function compareRuns(cases, labels, manifest, runs) {
  manifest = parseExperiment(cases, manifest);
  check(
    Array.isArray(runs) && runs.length >= 1 && runs.length <= 8,
    "compare 1..8 explicit runs",
  );
  check(
    new Set(runs.map((r) => r.runSha256)).size === runs.length,
    "duplicate run files",
  );
  const answered = runs.map(
    (run) =>
      new Set(
        run.records.filter((r) => r.status === "answered").map((r) => r.caseId),
      ),
  );
  const common = cases.filter(
    (c) =>
      labels.some((l) => l.caseId === c.id) &&
      answered.every((set) => set.has(c.id)),
  );
  const arms = runs.map((run) => {
    const observedModels = [
      ...new Set(
        run.records
          .filter((r) => r.status === "answered" || r.status === "abstained")
          .map((r) => r.resolvedModel),
      ),
    ];
    check(
      observedModels.length <= 1,
      "mixed resolved models in one comparison arm",
    );
    const selectedCases = run.cases ?? cases;
    const selectedIds = new Set(selectedCases.map((c) => c.id));
    const armLabels = labels.filter((l) => selectedIds.has(l.caseId));
    return {
      runSha256: run.runSha256,
      runId: run.header.runId ?? null,
      model: run.header.requestedModel,
      observedModels,
      createdAt: run.header.createdAt,
      thinking: run.header.thinking ?? null,
      split: run.header.split ?? null,
      promptRevision: run.header.promptRevision ?? null,
      systemPromptSha256: run.header.systemPromptSha256 ?? null,
      workerSha256:
        run.records.find((r) => r.workerSha256)?.workerSha256 ?? null,
      experimentBound: run.experimentBound === true,
      selection: metrics(selectedCases, armLabels, run.records),
      common: metrics(
        common,
        labels.filter((l) => common.some((c) => c.id === l.caseId)),
        run.records.filter((r) => common.some((c) => c.id === r.caseId)),
      ),
    };
  });
  return {
    schema: 1,
    kind: "decision-comparison",
    caseSetHash: fullCaseSetHash(cases),
    experimentHash: learningDigest(manifest),
    labelSetHash: learningDigest(labels),
    threshold: 0.5,
    thresholdSelection: "fixed-before-run",
    commonLabeledAnswered: common.length,
    commonCaseIds: common.map((c) => c.id),
    arms,
    polarity:
      "false positive means the recorded question was answered true for a false independent label; it means false-ready only for a question whose true polarity is readiness",
    population: {
      cases: cases.length,
      groups: new Set(manifest.entries.map((e) => e.taskGroup)).size,
      synthetic: cases.filter((c) => c.provenance === "synthetic").length,
      observed: cases.filter((c) => c.provenance === "observed").length,
    },
    qualification:
      "descriptive comparison only; no runtime qualification or speed improvement claim",
    trainingReady: false,
  };
}
