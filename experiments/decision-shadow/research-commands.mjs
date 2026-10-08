import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  parseExperiment,
  createStorageConsent,
  prepareExport,
  writePreparedExport,
  importSelectedCase,
  reviewLabelEvidence,
} from "./learning-data.mjs";
import { createLearningFixtures } from "./learning-fixtures.mjs";
import {
  previewPi,
  runPiBaseline,
  parsePiRun,
  compareRuns,
} from "./research.mjs";
import { parseLabels } from "./dataset.mjs";
export const RESEARCH_OPTIONS = {
  "validate-experiment": ["cases", "experiment"],
  "preview-pi": ["cases", "experiment", "model", "thinking", "split"],
  "run-pi": [
    "cases",
    "experiment",
    "model",
    "thinking",
    "split",
    "pi-package",
    "out",
    "allow-subscription",
  ],
  compare: ["cases", "experiment", "labels", "label-evidence", "run", "out"],
  "export-learning": [
    "cases",
    "experiment",
    "labels",
    "label-evidence",
    "consents",
    "mode",
    "out",
  ],
  "import-session": ["cases", "selection", "consent", "entry", "out"],
  fixtures: ["out"],
};
export const RESEARCH_OPTIONAL = {
  "run-pi": ["pi-node", "auth-path", "timeout-ms"],
};
export async function researchCommand(command, flags, helpers, options) {
  const { cases, jsonFile, textFile, writeNew, readLegacyRun } = helpers;
  const { emit = console.log, piRunner } = options;
  if (command === "fixtures") {
    const f = createLearningFixtures({});
    const dir = resolve(flags.out);
    await mkdir(dir, { mode: 0o700 });
    const refs = [];
    for (const r of f.labelReceipts) {
      const path = join(dir, r.filename);
      await writeFile(path, r.bytes, { flag: "wx", mode: 0o600 });
      refs.push({ caseId: r.caseId, path, sha256: r.sha256 });
    }
    for (const [name, value] of Object.entries({
      "cases.json": f.caseDocument,
      "labels.json": f.labelDocument,
      "experiment.json": f.manifest,
      "label-evidence.json": refs,
      "consents.json": [],
    }))
      await writeNew(join(dir, name), value);
    emit(
      JSON.stringify({
        saved: dir,
        cases: f.caseDocument.cases.length,
        fixtureOnly: true,
        trainingEligible: false,
      }),
    );
    return;
  }
  if (command === "import-session") {
    const result = await importSelectedCase({
      caseDocument: await jsonFile(flags.cases),
      selection: await jsonFile(flags.selection),
      sessionConsent: await jsonFile(flags.consent),
      experimentEntry: await jsonFile(flags.entry),
    });
    await writeNew(flags.out, result);
    emit(JSON.stringify({ saved: resolve(flags.out), trainingReady: false }));
    return;
  }
  const manifest = parseExperiment(cases, await jsonFile(flags.experiment));
  if (command === "validate-experiment") {
    emit(
      JSON.stringify({
        valid: true,
        cases: cases.length,
        groups: new Set(manifest.entries.map((e) => e.taskGroup)).size,
        trainingReady: false,
      }),
    );
    return;
  }
  if (command === "preview-pi") {
    emit(
      JSON.stringify(
        previewPi(cases, manifest, {
          model: flags.model,
          thinking: flags.thinking,
          split: flags.split,
        }),
        null,
        2,
      ),
    );
    return;
  }
  if (command === "run-pi") {
    const header = await runPiBaseline({
      cases,
      manifest,
      model: flags.model,
      thinking: flags.thinking,
      split: flags.split,
      piPackage: flags["pi-package"],
      nodeExecutable: flags["pi-node"],
      authPath: flags["auth-path"],
      timeoutMs:
        flags["timeout-ms"] === undefined
          ? undefined
          : Number(flags["timeout-ms"]),
      out: flags.out,
      runner: piRunner,
    });
    emit(
      JSON.stringify({
        saved: resolve(flags.out),
        runId: header.runId,
        trainingEligible: false,
      }),
    );
    return;
  }
  const labels = parseLabels(await jsonFile(flags.labels), cases);
  const labelEvidence = await jsonFile(flags["label-evidence"]);
  if (command === "export-learning") {
    const prepared = await prepareExport({
      cases,
      labels,
      manifest,
      consents: await jsonFile(flags.consents),
      labelEvidence,
      mode: flags.mode,
    });
    const result = await writePreparedExport({
      prepared,
      directory: resolve(flags.out),
    });
    emit(JSON.stringify(result));
    return;
  }
  if (command === "compare") {
    const evidence = await reviewLabelEvidence({
      cases,
      labels,
      references: labelEvidence,
    });
    const runs = [];
    for (const path of flags.run) {
      const text = await textFile(path);
      let first;
      try {
        first = JSON.parse(text.split("\n")[0]);
      } catch {
        throw Error("Invalid run header");
      }
      if (first.kind === "decision-pi-run")
        runs.push(parsePiRun(text, cases, manifest));
      else
        runs.push({
          ...(await readLegacyRun(path, cases)),
          cases,
          experimentBound: false,
        });
    }
    const report = compareRuns(cases, labels, manifest, runs);
    report.labelEvidenceReview = evidence;
    await writeNew(flags.out, report);
    emit(
      JSON.stringify({
        saved: resolve(flags.out),
        commonLabeledAnswered: report.commonLabeledAnswered,
        trainingReady: false,
      }),
    );
    return;
  }
  throw Error("Unhandled research command");
}
