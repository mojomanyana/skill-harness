#!/usr/bin/env node
// Explicit opt-in decision workflow shared by the packaged CLI and Pi session UI.
import { createHash } from "node:crypto";
import { open, readFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { openSync, writeFileSync, fsyncSync, closeSync } from "node:fs";
import { resolveDataRoot, createSessionCollection, writePrivateNew } from "./data-root.mjs";
import { listCollections } from "./collections.mjs";
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
import {
  validateNativeRoute, makeNativeRequest, nativeRequestSha256,
  normalizeNativeResult, validateNativePrediction,
} from "./native-jev.mjs";

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
  collections [--root ABSOLUTE_DIR]
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
    collections: [],
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
      : command === "collections" ? ["root"] : (RESEARCH_OPTIONAL[command] ?? []);
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
    !((header?.schema === 1 && header.kind === "decision-shadow-run") ||
      (header?.schema === 2 && header.kind === "decision-shadow-native-run")) ||
    header.caseSetHash !== caseSetHash(cases) ||
    header.caseCount !== cases.length ||
    header.trainingEligible !== false ||
    !validCreatedAt(header.createdAt)
  )
    throw new Error("Run header does not match this case set.");
  const native = header.schema === 2;
  if (native) {
    validateNativeRoute(header.route);
    if (header.provider !== header.route.provider || header.requestedModel !== header.route.model ||
        header.requestFormat !== "pi-classifier-context-v1" || header.costSource !== "pi-catalog-estimate")
      throw new Error("Native run route does not match its header.");
  } else {
    if (!Object.hasOwn(terms, header.provider)) throw new Error("Invalid run provider.");
    makeRequest(header.provider, header.requestedModel, cases[0]);
  }
  if (records.length > cases.length)
    throw new Error("Too many prediction records.");
  for (const [index, r] of records.entries()) {
    const {kind, caseId, caseHash, requestSha256, trainingEligible, ...prediction} = r ?? {};
    const validState = native
      ? validateNativePrediction(header.route, prediction) &&
        r.requestSha256 === nativeRequestSha256(cases[index]) &&
        (r.status !== "error" || index === records.length - 1)
      : r?.status === "answered"
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
    nativeRoute,
    nativeProviderCall,
    learningRoot,
  } = {},
) {
  const { command, flags } = argumentsFor(argv);
  if (command === "help") {
    emit(help);
    return;
  }
  if (command === "collections") {
    emit(JSON.stringify(await listCollections(resolveDataRoot({env, override:flags.root})), null, 2));
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
    if (nativeRoute !== undefined) {
      validateNativeRoute(nativeRoute);
      if (flags.provider !== nativeRoute.provider || flags.model !== nativeRoute.model)
        throw new Error("Selected native provider/model changed.");
      if (command === "run" && typeof nativeProviderCall !== "function")
        throw new Error("Native classifier runner is unavailable.");
    }
    const requests = cases.map((c) => nativeRoute
      ? { route: nativeRoute, context: makeNativeRequest(c), requestSha256: nativeRequestSha256(c) }
      : makeRequest(flags.provider, flags.model, c),
    );
    if (command === "preview") {
      emit(
        JSON.stringify(
          {
            schema: nativeRoute ? 2 : 1,
            ...(nativeRoute ? { requestFormat: "pi-classifier-context-v1" } : {}),
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
    const dataRoot = resolveDataRoot({env, override:learningRoot});
    const consent =
      sessionConsent ??
      (await requestSessionStorage({
        sessionId: flags["session-id"],
        storage: flags.storage,
        promptStorage,
        storageRoot: dataRoot,
      }));
    const apiKey = env.OPENROUTER_API_KEY;
    if (!nativeRoute && !apiKey?.trim())
      throw new Error("Selected provider API key is not configured.");
    const file = await open(flags.out, "wx", 0o600);
    let collection, collectionFd, collectionStatus = "disabled";
    const append = async (row) => {
      const bytes = JSON.stringify(row) + "\n";
      await file.writeFile(bytes);
      await file.sync();
      if (collectionFd !== undefined) {
        try {
          beforeProviderCall?.();
          writeFileSync(collectionFd, bytes); fsyncSync(collectionFd);
        } catch {
          closeSync(collectionFd); collectionFd = undefined;
          collectionStatus = "incomplete";
        }
      }
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
      if (consent.decision === "granted") {
        beforeProviderCall?.();
        collection = createSessionCollection(dataRoot, "jev-manual", consent.sessionId);
        writePrivateNew(join(collection, "consent.json"), JSON.stringify(consent, null, 2) + "\n");
        await retainSelectedSessionData({ cases, consent, out:join(collection, "selected-data.json"),
          assertCurrent:beforeProviderCall });
        beforeProviderCall?.();
        collectionFd = openSync(join(collection, "results.jsonl"), "wx", 0o600);
        collectionStatus = "captured";
      }
      await append({
        schema: nativeRoute ? 2 : 1,
        kind: nativeRoute ? "decision-shadow-native-run" : "decision-shadow-run",
        ...(nativeRoute ? {
          route: nativeRoute, requestFormat: "pi-classifier-context-v1",
          costSource: "pi-catalog-estimate",
        } : {}),
        provider: flags.provider,
        requestedModel: flags.model,
        createdAt: new Date().toISOString(),
        caseCount: cases.length,
        caseSetHash: caseSetHash(cases),
        trainingEligible: false,
        ...(nativeRoute ? {} : { termsUrl: terms[flags.provider] }),
      });
      for (const c of cases) {
        let result;
        try {
          if (beforeProviderCall) beforeProviderCall();
          result = nativeRoute
            ? await nativeProviderCall(c)
            : await providerCall(flags.provider, flags.model, c, { apiKey });
          if (nativeRoute && !validateNativePrediction(nativeRoute, result))
            throw new Error("Invalid native classifier result.");
        } catch {
          result = nativeRoute ? normalizeNativeResult(nativeRoute, null, null) : {
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
          ...(nativeRoute ? { requestSha256: nativeRequestSha256(c) } : {}),
          trainingEligible: false,
        });
        if (result.status === "error") {
          failures++;
          break;
        }
      }
    } finally {
      if (collectionFd !== undefined) closeSync(collectionFd);
      await file.close();
    }
    emit(
      JSON.stringify({
        saved: resolve(flags.out),
        learningCollection: {status:collectionStatus, ...(collection ? {path:collection} : {})},
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
      ...(header.schema === 2 ? {
        route: header.route, requestFormat: header.requestFormat, costSource: header.costSource,
        modelResolution: "Pi returns the requested model identity; backend resolution is unknown.",
      } : {}),
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
