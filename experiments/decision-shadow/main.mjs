#!/usr/bin/env node
// Explicit opt-in decision workflow shared by the packaged CLI and Pi session UI.
import { createHash } from "node:crypto";
import { open, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  RESEARCH_OPTIONS,
  RESEARCH_OPTIONAL,
  researchCommand,
} from "./research-commands.mjs";
import {
  requestSessionStorage,
  retainSelectedSessionData,
} from "./consent.mjs";
import {
  parseCases,
  parseLabels,
  scorePredictions,
  localCorpus,
} from "./dataset.mjs";
import {
  makeRequest,
  callProvider,
  isSupportedResolvedModel,
} from "./providers.mjs";
import { verifySources } from "./public-evidence.mjs";

const terms = { jev: "https://typesafe.ai/legal/mca" };
const providerErrors = new Set([
  "invalid provider response",
  "provider request timed out",
  "provider response exceeded limit",
  "provider request failed",
  "Provider call failed.",
]);
const help = `Decision research workflow (Node >=20; qualified Pi execution needs Linux / Pi 1.0.4 / Node >=22.19)
  preview --cases FILE --provider jev --model MODEL
  run --cases FILE --provider jev --model MODEL --out NEW.jsonl --allow-remote
  score --cases FILE --labels FILE --run RESULT.jsonl [--run RESULT2.jsonl]
  corpus --cases FILE --labels FILE --out NEW.json
  verify-sources --cases FILE --sources SELECTION.json --evidence-root DIR --out NEW.json
  fixtures --out NEW_DIR [--set mechanical|workflow]
  validate-experiment --cases FILE --experiment FILE
  preview-pi --cases FILE --experiment FILE --model openai-codex:MODEL --thinking LEVEL --split test
  run-pi --cases FILE --experiment FILE --model openai-codex:MODEL --thinking LEVEL --split test --pi-package DIR --out NEW.jsonl --allow-subscription [--pi-node PATH] [--auth-path FILE] [--timeout-ms N]
  compare --cases FILE --experiment FILE --labels FILE --label-evidence FILE --run FILE [--run FILE] --out NEW.json
  import-session --cases FILE --selection FILE --consent FILE --entry FILE --out NEW.json
  import-workflow --cases FILE --selection FILE --consent FILE --entry FILE --out NEW.json
  export-learning --cases FILE --experiment FILE --labels FILE --label-evidence FILE --consents FILE --mode fixture-demo|reviewed-data --out NEW_DIR

JEV run asks this session whether to retain selected data for later LoRA review.
Noninteractive runs must supply --storage yes|no [--session-id ID]. No choice is inherited.

preview, score, corpus and verify-sources are offline. verify-sources reads only
explicitly selected Linux public captures; it does not assess decision readiness,
decision-time availability, redaction, rights or labels. run sends only the curated input and
question to the selected provider, bills its API, and requires its API key in
OPENROUTER_API_KEY. No retries. Output must be new.
Labels/predictions are research records, never runtime authority.
Corpus excludes predictions and is NOT approved for training.`;

function argumentsFor(argv) {
  const [command, ...rest] = argv;
  if (!command || command === "--help") return { command: "help", flags: {} };
  const commands = {
    ...RESEARCH_OPTIONS,
    preview: ["cases", "provider", "model"],
    run: ["cases", "provider", "model", "out", "allow-remote"],
    score: ["cases", "labels", "run"],
    corpus: ["cases", "labels", "out"],
    "verify-sources": ["cases", "sources", "evidence-root", "out"],
  };
  if (!Object.hasOwn(commands, command))
    throw new Error("Unknown command; use --help.");
  const required = commands[command];
  const optional =
    command === "run"
      ? ["storage", "session-id"]
      : (RESEARCH_OPTIONAL[command] ?? []);
  const allowed = [...required, ...optional];
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i].slice(2);
    if (!rest[i].startsWith("--") || !allowed.includes(key))
      throw new Error("Unknown option.");
    if (
      key in flags &&
      !(["score", "compare"].includes(command) && key === "run")
    )
      throw new Error("Duplicate --" + key);
    if (["allow-remote", "allow-subscription"].includes(key)) {
      flags[key] = true;
      continue;
    }
    const value = rest[++i];
    if (!value || value.startsWith("--"))
      throw new Error("Missing --" + key + " value.");
    if (["score", "compare"].includes(command) && key === "run")
      (flags.run ??= []).push(value);
    else flags[key] = value;
  }
  for (const key of required)
    if (!(key in flags)) throw new Error("Required --" + key);
  return { command, flags };
}

async function textFile(path) {
  const info = await stat(path);
  if (!info.isFile() || info.size > 4 * 1024 * 1024)
    throw new Error("Expected regular file <=4 MiB.");
  const bytes = await readFile(path);
  if (bytes.length > 4 * 1024 * 1024) throw new Error("File exceeded 4 MiB.");
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    throw new Error("Input file is not valid UTF-8.");
  }
}
async function jsonFile(path) {
  const text = await textFile(path);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON input file.");
  }
}
function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
function caseSetHash(cases) {
  return sha256(JSON.stringify(cases.map((c) => ({ id: c.id, hash: c.hash }))));
}
function labelSetHash(labels) {
  return sha256(
    JSON.stringify(
      [...labels].sort((a, b) =>
        a.caseId < b.caseId ? -1 : a.caseId > b.caseId ? 1 : 0,
      ),
    ),
  );
}
function validCreatedAt(value) {
  return (
    typeof value === "string" &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}
async function readRun(path, cases) {
  let rows;
  const text = await textFile(path);
  try {
    rows = text
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line));
  } catch {
    throw new Error("Invalid run JSONL; retain damaged evidence separately.");
  }
  const [header, ...records] = rows;
  if (
    header?.schema !== 1 ||
    header.kind !== "decision-shadow-run" ||
    header.caseSetHash !== caseSetHash(cases) ||
    header.caseCount !== cases.length ||
    header.trainingEligible !== false ||
    !validCreatedAt(header.createdAt) ||
    !Object.hasOwn(terms, header.provider)
  )
    throw new Error("Run header does not match this case set.");
  makeRequest(header.provider, header.requestedModel, cases[0]);
  if (records.length > cases.length)
    throw new Error("Too many prediction records.");
  for (const [index, r] of records.entries()) {
    const validState =
      r?.status === "answered"
        ? isSupportedResolvedModel(r.resolvedModel) && r.error === null
        : r?.status === "error" &&
          r.probability === null &&
          providerErrors.has(r.error) &&
          (r.resolvedModel === null ||
            isSupportedResolvedModel(r.resolvedModel)) &&
          index === records.length - 1;
    if (
      !r ||
      r.kind !== "prediction" ||
      r.trainingEligible !== false ||
      r.caseId !== cases[index].id ||
      r.caseHash !== cases[index].hash ||
      !validState ||
      !nullableMetric(r.latencyMs) ||
      !r.usage ||
      !["inputTokens", "outputTokens"].every((key) =>
        nullableTokenCount(r.usage[key]),
      ) ||
      !nullableMetric(r.usage.costUsd)
    )
      throw new Error("Invalid prediction record.");
  }
  return { header, records, runSha256: sha256(text) };
}
function nullableMetric(value) {
  return (
    value === null ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0)
  );
}
function nullableTokenCount(value) {
  return value === null || (Number.isSafeInteger(value) && value >= 0);
}
function measurements(records) {
  const summarize = (values, integer = false) => {
    const reported = values.filter((value) => value !== null);
    let total = 0;
    for (const value of reported) {
      total += value;
      if (
        !Number.isFinite(total) ||
        (integer && !Number.isSafeInteger(total))
      ) {
        throw new Error("Measurement totals exceed supported numeric bounds.");
      }
    }
    return {
      reported: reported.length,
      attempted: records.length,
      total: reported.length ? total : null,
    };
  };
  const latency = records
    .map((r) => r.latencyMs)
    .filter((value) => value !== null);
  const meanLatency = latency.reduce(
    (mean, value, index) => mean + (value - mean) / (index + 1),
    0,
  );
  return {
    latencyMs: {
      reported: latency.length,
      attempted: records.length,
      mean: latency.length ? meanLatency : null,
    },
    inputTokens: summarize(
      records.map((r) => r.usage.inputTokens),
      true,
    ),
    outputTokens: summarize(
      records.map((r) => r.usage.outputTokens),
      true,
    ),
    costUsd: summarize(records.map((r) => r.usage.costUsd)),
  };
}
async function writeNew(path, value) {
  const file = await open(path, "wx", 0o600);
  try {
    await file.writeFile(JSON.stringify(value, null, 2) + "\n");
    await file.sync();
  } finally {
    await file.close();
  }
}

export async function main(
  argv,
  {
    emit = console.log,
    env = process.env,
    providerCall = callProvider,
    promptStorage,
    piRunner,
    sessionConsent,
    expectedCaseSetHash,
    beforeProviderCall,
  } = {},
) {
  const { command, flags } = argumentsFor(argv);
  if (command === "help") {
    emit(help);
    return;
  }
  const cases =
    command === "fixtures" ? null : parseCases(await jsonFile(flags.cases));
  if (Object.hasOwn(RESEARCH_OPTIONS, command))
    return researchCommand(
      command,
      flags,
      { cases, jsonFile, textFile, writeNew, readLegacyRun: readRun },
      { emit, piRunner },
    );
  if (command === "verify-sources") {
    const sourceText = await textFile(flags.sources);
    let selection;
    try {
      selection = JSON.parse(sourceText);
    } catch {
      throw new Error("Invalid JSON source selection.");
    }
    const verification = await verifySources(
      cases,
      selection,
      flags["evidence-root"],
    );
    const receipt = {
      ...verification,
      createdAt: new Date().toISOString(),
      caseSetHash: caseSetHash(cases),
      selectionFileSha256: sha256(sourceText),
    };
    await writeNew(flags.out, receipt);
    emit(
      JSON.stringify({
        saved: resolve(flags.out),
        status: receipt.status,
        caseCount: cases.length,
        artifactCount: receipt.artifactCount,
        trainingReady: false,
        trainingEligible: false,
      }),
    );
    return;
  }
  if (command === "preview" || command === "run") {
    if (
      expectedCaseSetHash !== undefined &&
      caseSetHash(cases) !== expectedCaseSetHash
    )
      throw new Error("Cases changed after confirmation.");
    const requests = cases.map((c) =>
      makeRequest(flags.provider, flags.model, c),
    );
    if (command === "preview") {
      emit(
        JSON.stringify(
          {
            schema: 1,
            caseSetHash: caseSetHash(cases),
            count: cases.length,
            trainingEligible: false,
            requests: requests.map((request, i) => ({
              caseId: cases[i].id,
              caseHash: cases[i].hash,
              ...request,
            })),
          },
          null,
          2,
        ),
      );
      return;
    }
    const consent =
      sessionConsent ??
      (await requestSessionStorage({
        sessionId: flags["session-id"],
        storage: flags.storage,
        promptStorage,
      }));
    const apiKey = env.OPENROUTER_API_KEY;
    if (!apiKey?.trim())
      throw new Error("Selected provider API key is not configured.");
    const file = await open(flags.out, "wx", 0o600);
    const append = async (row) => {
      await file.writeFile(JSON.stringify(row) + "\n");
      await file.sync();
    };
    let failures = 0;
    try {
      if (beforeProviderCall) beforeProviderCall();
      await writeNew(flags.out + ".consent.json", consent);
      await retainSelectedSessionData({
        cases,
        consent,
        out: flags.out + ".learning.json",
        assertCurrent: beforeProviderCall,
      });
      await append({
        schema: 1,
        kind: "decision-shadow-run",
        provider: flags.provider,
        requestedModel: flags.model,
        createdAt: new Date().toISOString(),
        caseCount: cases.length,
        caseSetHash: caseSetHash(cases),
        trainingEligible: false,
        termsUrl: terms[flags.provider],
      });
      for (const c of cases) {
        let result;
        try {
          if (beforeProviderCall) beforeProviderCall();
          result = await providerCall(flags.provider, flags.model, c, {
            apiKey,
          });
        } catch {
          result = {
            status: "error",
            probability: null,
            resolvedModel: null,
            usage: { inputTokens: null, outputTokens: null, costUsd: null },
            latencyMs: null,
            error: "Provider call failed.",
          };
        }
        await append({
          kind: "prediction",
          caseId: c.id,
          caseHash: c.hash,
          ...result,
          trainingEligible: false,
        });
        if (result.status === "error") {
          failures++;
          break;
        }
      }
    } finally {
      await file.close();
    }
    emit(
      JSON.stringify({
        saved: resolve(flags.out),
        errors: failures,
        trainingEligible: false,
      }),
    );
    if (failures)
      throw new Error(
        "Run stopped after a provider error; saved partial evidence. No retry was made.",
      );
    return;
  }
  const labels = parseLabels(await jsonFile(flags.labels), cases);
  if (command === "corpus") {
    await writeNew(flags.out, localCorpus(cases, labels));
    emit(JSON.stringify({ saved: resolve(flags.out), trainingReady: false }));
    return;
  }
  const reports = [];
  for (const path of flags.run) {
    const { header, records, runSha256 } = await readRun(path, cases);
    const resolvedModels = [
      ...new Set(records.map((r) => r.resolvedModel).filter(Boolean)),
    ];
    if (resolvedModels.length > 1) {
      throw new Error(
        "Run contains multiple resolved models; retain this evidence and use a new single-snapshot run.",
      );
    }
    reports.push({
      provider: header.provider,
      requestedModel: header.requestedModel,
      resolvedModels,
      runSha256,
      createdAt: header.createdAt,
      ...scorePredictions(
        cases,
        labels,
        records.map(({ caseId, caseHash, status, probability }) => ({
          caseId,
          caseHash,
          status,
          probability,
        })),
      ),
      measurements: measurements(records),
      trainingEligible: false,
    });
  }
  emit(
    JSON.stringify(
      {
        schema: 1,
        threshold: 0.5,
        caseSetHash: caseSetHash(cases),
        labelSetHash: labelSetHash(labels),
        reports,
      },
      null,
      2,
    ),
  );
}
