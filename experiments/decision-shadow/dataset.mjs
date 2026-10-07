import { createHash } from "node:crypto";

const CASE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const MAX_CASES = 100;
const MAX_RECORD_ID = 256;
const MAX_ACTOR = 256;

function plainObject(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  return value;
}

function exactKeys(value, expected, path) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${path} must contain exactly: ${wanted.join(", ")}`);
  }
}

function boundedString(value, min, max, path) {
  if (typeof value !== "string") throw new TypeError(`${path} must be a string`);
  const length = Array.from(value).length;
  if (length < min || length > max) {
    throw new RangeError(`${path} must contain ${min}..${max} characters`);
  }
  return value;
}

function sha(value, path) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new TypeError(`${path} must be a lowercase SHA-256 hex digest`);
  }
  return value;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashCase(value) {
  return createHash("sha256").update(canonical(value), "utf8").digest("hex");
}

export function parseCases(value) {
  const root = plainObject(value, "dataset");
  exactKeys(root, ["schema", "cases"], "dataset");
  if (root.schema !== 1) throw new TypeError("dataset.schema must be 1");
  if (!Array.isArray(root.cases)) throw new TypeError("dataset.cases must be an array");
  if (root.cases.length < 1 || root.cases.length > MAX_CASES) {
    throw new RangeError(`dataset.cases must contain 1..${MAX_CASES} cases`);
  }

  const ids = new Set();
  return root.cases.map((candidate, index) => {
    const path = `dataset.cases[${index}]`;
    const item = plainObject(candidate, path);
    exactKeys(item, ["id", "input", "question", "provenance", "source", "visibility"], path);
    if (typeof item.id !== "string" || !CASE_ID.test(item.id)) {
      throw new TypeError(`${path}.id has an invalid format`);
    }
    if (ids.has(item.id)) throw new TypeError(`duplicate case id: ${item.id}`);
    ids.add(item.id);

    const source = plainObject(item.source, `${path}.source`);
    exactKeys(source, ["sha256", "recordId"], `${path}.source`);
    const validated = {
      id: item.id,
      input: boundedString(item.input, 1, 16000, `${path}.input`),
      question: boundedString(item.question, 1, 4000, `${path}.question`),
      provenance: item.provenance,
      source: {
        sha256: sha(source.sha256, `${path}.source.sha256`),
        recordId: boundedString(source.recordId, 1, MAX_RECORD_ID, `${path}.source.recordId`),
      },
      visibility: item.visibility,
    };
    if (validated.source.recordId.trim().length === 0) {
      throw new TypeError(`${path}.source.recordId must not be blank`);
    }
    if (!["synthetic", "observed"].includes(validated.provenance)) {
      throw new TypeError(`${path}.provenance is invalid`);
    }
    if (!["public", "redacted"].includes(validated.visibility)) {
      throw new TypeError(`${path}.visibility is invalid`);
    }
    return { ...validated, hash: hashCase(validated) };
  });
}

export function parseLabels(value, cases) {
  if (!Array.isArray(cases)) throw new TypeError("cases must be an array");
  const caseById = new Map(cases.map((item) => [item.id, item]));
  if (caseById.size !== cases.length) throw new TypeError("cases contain duplicate ids");

  const root = plainObject(value, "label dataset");
  exactKeys(root, ["schema", "labels"], "label dataset");
  if (root.schema !== 1) throw new TypeError("label dataset.schema must be 1");
  if (!Array.isArray(root.labels)) throw new TypeError("label dataset.labels must be an array");

  const seen = new Set();
  return root.labels.map((candidate, index) => {
    const path = `label dataset.labels[${index}]`;
    const item = plainObject(candidate, path);
    exactKeys(item, ["caseId", "caseHash", "value", "kind", "actor", "evidenceSha256", "independent"], path);
    if (typeof item.caseId !== "string" || !CASE_ID.test(item.caseId)) {
      throw new TypeError(`${path}.caseId has an invalid format`);
    }
    if (seen.has(item.caseId)) throw new TypeError(`duplicate label for case: ${item.caseId}`);
    seen.add(item.caseId);
    const matched = caseById.get(item.caseId);
    if (!matched) throw new TypeError(`label refers to unknown case: ${item.caseId}`);
    sha(item.caseHash, `${path}.caseHash`);
    if (item.caseHash !== matched.hash) throw new TypeError(`stale case hash for label: ${item.caseId}`);
    if (typeof item.value !== "boolean") throw new TypeError(`${path}.value must be boolean`);
    if (!["human", "test"].includes(item.kind)) throw new TypeError(`${path}.kind is invalid`);
    if (item.independent !== true) throw new TypeError(`${path}.independent must be true`);
    const validated = {
      caseId: item.caseId,
      caseHash: item.caseHash,
      value: item.value,
      kind: item.kind,
      actor: boundedString(item.actor, 1, MAX_ACTOR, `${path}.actor`),
      evidenceSha256: sha(item.evidenceSha256, `${path}.evidenceSha256`),
      independent: true,
    };
    if (validated.actor.trim().length === 0) {
      throw new TypeError(`${path}.actor must not be blank`);
    }
    return validated;
  });
}

export function scorePredictions(cases, labels, records) {
  if (!Array.isArray(cases) || !Array.isArray(labels) || !Array.isArray(records)) {
    throw new TypeError("cases, labels, and records must be arrays");
  }
  const caseById = new Map(cases.map((item) => [item.id, item]));
  if (caseById.size !== cases.length) throw new TypeError("cases contain duplicate ids");
  const validatedLabels = parseLabels({ schema: 1, labels }, cases);
  const labelById = new Map(validatedLabels.map((item) => [item.caseId, item]));

  const recordById = new Map();
  for (const [index, candidate] of records.entries()) {
    const path = `records[${index}]`;
    const record = plainObject(candidate, path);
    exactKeys(record, ["caseId", "caseHash", "status", "probability"], path);
    if (recordById.has(record.caseId)) throw new TypeError(`duplicate prediction for case: ${record.caseId}`);
    const matched = caseById.get(record.caseId);
    if (!matched) throw new TypeError(`prediction refers to unknown case: ${record.caseId}`);
    if (record.caseHash !== matched.hash) throw new TypeError(`stale case hash for prediction: ${record.caseId}`);
    if (!["answered", "refused", "error"].includes(record.status)) {
      throw new TypeError(`${path}.status is invalid`);
    }
    if (record.status === "answered") {
      if (typeof record.probability !== "number" || !Number.isFinite(record.probability) ||
          record.probability < 0 || record.probability > 1) {
        throw new TypeError(`${path}.probability must be finite and within 0..1 when answered`);
      }
    } else if (record.probability !== null) {
      throw new TypeError(`${path}.probability must be null when not answered`);
    }
    recordById.set(record.caseId, record);
  }

  let answered = 0;
  let refused = 0;
  let errors = 0;
  let scored = 0;
  let correct = 0;
  let brierTotal = 0;
  let falsePositives = 0;
  let falseNegatives = 0;

  for (const record of recordById.values()) {
    if (record.status === "answered") answered++;
    else if (record.status === "refused") refused++;
    else errors++;

    const label = labelById.get(record.caseId);
    if (!label || record.status !== "answered") continue;
    scored++;
    const predicted = record.probability >= 0.5;
    if (predicted === label.value) correct++;
    else if (predicted) falsePositives++;
    else falseNegatives++;
    brierTotal += (record.probability - Number(label.value)) ** 2;
  }

  return {
    totalCases: cases.length,
    labeledCases: labels.length,
    attempted: records.length,
    answered,
    refused,
    errors,
    missing: cases.length - records.length,
    scored,
    correct,
    accuracy: scored === 0 ? null : correct / scored,
    brier: scored === 0 ? null : brierTotal / scored,
    falsePositives,
    falseNegatives,
  };
}

export function localCorpus(cases, labels) {
  if (!Array.isArray(cases) || !Array.isArray(labels)) {
    throw new TypeError("cases and labels must be arrays");
  }
  const validatedLabels = parseLabels({ schema: 1, labels }, cases);
  const labelById = new Map(validatedLabels.map((item) => [item.caseId, item]));
  return {
    schema: 1,
    kind: "independent-label-corpus",
    trainingReady: false,
    purpose: "Human/test curated observations for future lawful research; not a training dataset.",
    rows: cases.filter((item) => labelById.has(item.id)).map((item) => ({
      caseId: item.id,
      caseHash: item.hash,
      input: item.input,
      question: item.question,
      provenance: item.provenance,
      source: { ...item.source },
      visibility: item.visibility,
      label: { ...labelById.get(item.id) },
    })),
  };
}
