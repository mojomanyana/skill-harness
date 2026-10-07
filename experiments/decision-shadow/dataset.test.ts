import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { localCorpus, parseCases, parseLabels, scorePredictions } from "./dataset.mjs";

const digest = (character: string) => character.repeat(64);
const readinessRule = "synthetic-readiness-rule-v2";
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

function syntheticReadinessRuleV2(evidence: Record<string, unknown>) {
  return evidence.tests === "pass" && evidence.review === "approve" &&
    evidence.reviewIndependent === true &&
    typeof evidence.integrationCandidate === "string" && evidence.integrationCandidate.trim().length > 0 &&
    evidence.testedCandidate === evidence.integrationCandidate &&
    evidence.reviewedCandidate === evidence.integrationCandidate && evidence.cleanup === "settled";
}

function caseDocument() {
  return {
    schema: 1,
    cases: [
      {
        id: "case.one",
        input: "The operation is reversible.",
        question: "Is this change reversible?",
        provenance: "synthetic",
        source: { sha256: digest("a"), recordId: "fixture-1" },
        visibility: "public",
      },
      {
        id: "case-two",
        input: "The operation permanently deletes data.",
        question: "Is this change reversible?",
        provenance: "observed",
        source: { sha256: digest("b"), recordId: "redacted-record" },
        visibility: "redacted",
      },
      {
        id: "unlabeled",
        input: "No independent label exists.",
        question: "Is the statement supported?",
        provenance: "synthetic",
        source: { sha256: digest("c"), recordId: "fixture-3" },
        visibility: "public",
      },
    ],
  };
}

describe("decision shadow datasets", () => {
  it("binds identity to canonical case content and rejects stale or unknown labels", () => {
    const cases = parseCases(caseDocument());
    const reordered = parseCases({
      schema: 1,
      cases: [{
        visibility: "public",
        source: { recordId: "fixture-1", sha256: digest("a") },
        provenance: "synthetic",
        question: "Is this change reversible?",
        input: "The operation is reversible.",
        id: "case.one",
      }],
    });
    expect(reordered[0].hash).toBe(cases[0].hash);

    const changed = structuredClone(caseDocument());
    changed.cases[0].question = "Is the change safe?";
    expect(parseCases(changed)[0].hash).not.toBe(cases[0].hash);

    const valid = {
      caseId: "case.one",
      caseHash: cases[0].hash,
      value: true,
      kind: "human",
      actor: "reviewer-1",
      evidenceSha256: digest("d"),
      independent: true,
    };
    expect(parseLabels({ schema: 1, labels: [valid] }, cases)).toEqual([valid]);
    expect(() => parseLabels({ schema: 1, labels: [{ ...valid, caseHash: digest("e") }] }, cases))
      .toThrow(/stale case hash/);
    expect(() => parseLabels({ schema: 1, labels: [{ ...valid, caseId: "absent" }] }, cases))
      .toThrow(/unknown case/);
  });

  it("rejects unknown fields, duplicate ids, invalid bounds, and unasserted independence", () => {
    expect(() => parseCases({ ...caseDocument(), extra: true })).toThrow(/exactly/);
    const duplicate = caseDocument();
    duplicate.cases[1].id = duplicate.cases[0].id;
    expect(() => parseCases(duplicate)).toThrow(/duplicate case id/);
    const emptyInput = caseDocument();
    emptyInput.cases[0].input = "";
    expect(() => parseCases(emptyInput)).toThrow(/1..16000/);

    const cases = parseCases(caseDocument());
    const label = {
      caseId: cases[0].id,
      caseHash: cases[0].hash,
      value: true,
      kind: "test",
      actor: "fixture",
      evidenceSha256: digest("f"),
      independent: false,
    };
    expect(() => parseLabels({ schema: 1, labels: [label] }, cases)).toThrow(/must be true/);
  });

  it("reports coverage and scores only labeled answered records", () => {
    const cases = parseCases(caseDocument());
    const labels = parseLabels({
      schema: 1,
      labels: [
        {
          caseId: cases[0].id, caseHash: cases[0].hash, value: true, kind: "human",
          actor: "reviewer", evidenceSha256: digest("d"), independent: true,
        },
        {
          caseId: cases[1].id, caseHash: cases[1].hash, value: false, kind: "test",
          actor: "fixture", evidenceSha256: digest("e"), independent: true,
        },
      ],
    }, cases);

    expect(scorePredictions(cases, labels, [
      { caseId: cases[0].id, caseHash: cases[0].hash, status: "answered", probability: 0.8 },
      { caseId: cases[1].id, caseHash: cases[1].hash, status: "refused", probability: null },
    ])).toEqual({
      totalCases: 3,
      labeledCases: 2,
      attempted: 2,
      answered: 1,
      refused: 1,
      errors: 0,
      missing: 1,
      scored: 1,
      correct: 1,
      accuracy: 1,
      brier: 0.03999999999999998,
      falsePositives: 0,
      falseNegatives: 0,
    });

    expect(scorePredictions(cases, labels, [
      { caseId: cases[0].id, caseHash: cases[0].hash, status: "error", probability: null },
      { caseId: cases[2].id, caseHash: cases[2].hash, status: "answered", probability: 0.9 },
    ])).toMatchObject({ attempted: 2, answered: 1, errors: 1, missing: 1, scored: 0, accuracy: null, brier: null });
  });

  it("rejects duplicate, foreign, stale, or malformed predictions", () => {
    const cases = parseCases(caseDocument());
    const record = { caseId: cases[0].id, caseHash: cases[0].hash, status: "answered", probability: 0.5 };
    expect(() => scorePredictions(cases, [], [record, record])).toThrow(/duplicate prediction/);
    expect(() => scorePredictions(cases, [], [{ ...record, caseId: "foreign" }])).toThrow(/unknown case/);
    expect(() => scorePredictions(cases, [], [{ ...record, caseHash: digest("f") }])).toThrow(/stale case hash/);
    expect(() => scorePredictions(cases, [], [{ ...record, probability: Number.NaN }])).toThrow(/finite/);
    expect(() => scorePredictions(cases, [], [{ ...record, status: "refused" }])).toThrow(/must be null/);
  });

  it("exports only independently labeled cases without prediction data", () => {
    const cases = parseCases(caseDocument());
    const labels = parseLabels({
      schema: 1,
      labels: [{
        caseId: cases[1].id,
        caseHash: cases[1].hash,
        value: false,
        kind: "human",
        actor: "reviewer",
        evidenceSha256: digest("d"),
        independent: true,
      }],
    }, cases);
    const corpus = localCorpus(cases, labels);
    expect(corpus).toMatchObject({
      schema: 1,
      kind: "independent-label-corpus",
      trainingReady: false,
      rows: [{ caseId: "case-two", caseHash: cases[1].hash, label: labels[0] }],
    });
    expect(corpus.rows).toHaveLength(1);
    expect(JSON.stringify(corpus)).not.toContain("probability");
  });

  it("requires a nonempty corpus and nonblank local provenance names", () => {
    expect(() => parseCases({ schema: 1, cases: [] })).toThrow(/1..100/);
    const blankRecord = caseDocument();
    blankRecord.cases[0].source.recordId = "   ";
    expect(() => parseCases(blankRecord)).toThrow(/must not be blank/);

    const cases = parseCases(caseDocument());
    expect(() => parseLabels({
      schema: 1,
      labels: [{
        caseId: cases[0].id,
        caseHash: cases[0].hash,
        value: true,
        kind: "human",
        actor: "  ",
        evidenceSha256: digest("d"),
        independent: true,
      }],
    }, cases)).toThrow(/must not be blank/);
  });

  it("revalidates labels inside metrics and corpus exports", () => {
    const cases = parseCases(caseDocument());
    const stale = {
      caseId: cases[0].id,
      caseHash: digest("e"),
      value: true,
      kind: "human",
      actor: "reviewer",
      evidenceSha256: digest("d"),
      independent: true,
    };
    expect(() => scorePredictions(cases, [stale], [])).toThrow(/stale case hash/);
    expect(() => localCorpus(cases, [stale])).toThrow(/stale case hash/);

    const foreign = { ...stale, caseId: "foreign", caseHash: digest("f") };
    expect(() => scorePredictions(cases, [foreign], [])).toThrow(/unknown case/);
    expect(() => localCorpus(cases, [foreign])).toThrow(/unknown case/);
  });

  it("rejects omitted and out-of-range answered probabilities", () => {
    const cases = parseCases(caseDocument());
    const base = { caseId: cases[0].id, caseHash: cases[0].hash, status: "answered" };
    expect(() => scorePredictions(cases, [], [{ ...base }])).toThrow(/exactly|finite/);
    expect(() => scorePredictions(cases, [], [{ ...base, probability: 1.01 }])).toThrow(/0..1/);
    expect(() => scorePredictions(cases, [], [{ ...base, probability: -0.01 }])).toThrow(/0..1/);
  });

});

describe("synthetic readiness fixture evidence", () => {
  it("binds all eight labels to the named rule, exact input, and case hashes", async () => {
    const cases = parseCases(JSON.parse(await readFile(new URL("./examples/cases.json", import.meta.url), "utf8")));
    const labels = parseLabels(JSON.parse(await readFile(new URL("./examples/labels.json", import.meta.url), "utf8")), cases);
    expect(cases).toHaveLength(8);
    expect(labels).toHaveLength(cases.length);
    expect(cases.map(item => item.id)).toContain("review-not-independent");
    expect(cases.map(item => item.id)).toContain("review-independence-missing");
    const labelById = new Map(labels.map(label => [label.caseId, label]));
    for (const item of cases) {
      const value = syntheticReadinessRuleV2(JSON.parse(item.input));
      expect(item.provenance).toBe("synthetic");
      expect(item.source).toEqual({ sha256: sha256(item.input), recordId: "synthetic-evidence/" + item.id });
      // Label evidence is the UTF-8 JSON record below, in this field order.
      // It records an offline rule evaluation; it contains no provider output.
      expect(labelById.get(item.id), item.id).toEqual({
        caseId: item.id,
        caseHash: item.hash,
        value,
        kind: "test",
        actor: readinessRule,
        evidenceSha256: sha256(JSON.stringify({
          rule: readinessRule, caseHash: item.hash, sourceSha256: item.source.sha256, value,
        })),
        independent: true,
      });
    }
    expect(labels.filter(label => label.value).map(label => label.caseId)).toEqual(["complete"]);
  });

  it("requires every recorded readiness condition, including explicit independence", () => {
    const complete = {
      tests: "pass", review: "approve", reviewIndependent: true, cleanup: "settled",
      integrationCandidate: "candidate-a", testedCandidate: "candidate-a", reviewedCandidate: "candidate-a",
    };
    expect(syntheticReadinessRuleV2(complete)).toBe(true);
    for (const key of Object.keys(complete)) {
      const missing: Record<string, unknown> = { ...complete };
      delete missing[key];
      expect(syntheticReadinessRuleV2(missing), "missing " + key).toBe(false);
    }
    for (const changes of [
      { tests: "fail" }, { review: "changes-requested" }, { cleanup: "unknown" },
      { reviewIndependent: false }, { reviewIndependent: null }, { reviewIndependent: "true" },
      { testedCandidate: "old" }, { reviewedCandidate: "old" },
      { integrationCandidate: "", testedCandidate: "", reviewedCandidate: "" },
    ]) {
      expect(syntheticReadinessRuleV2({ ...complete, ...changes }), JSON.stringify(changes)).toBe(false);
    }
  });
});
