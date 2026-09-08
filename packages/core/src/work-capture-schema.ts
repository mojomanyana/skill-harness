const text = { type: "string", minLength: 1, maxLength: 512, pattern: "^[^\\u0000-\\u001f\\u007f]+$" };
const hash = { type: "string", pattern: "^[a-f0-9]{64}$" };
const closed = (properties: Record<string, object>, required = Object.keys(properties)) => ({ type: "object", properties, required, additionalProperties: false });
const evidence = { type: "array", items: hash, minItems: 1, maxItems: 256, uniqueItems: true };
const metric = { type: "number", minimum: 0 };
function freeze<T>(value: T): T { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
export const WORK_CAPTURE_SCHEMA = freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://github.com/mojomanyana/skill-harness/contracts/work-capture/v2/work-case.schema.json",
  ...closed({ capture_schema: { const: 2 }, id: hash,
    detector: closed({ id: text, version: text, population: text }),
    target: closed({ kind: { const: "work" }, snapshotDigest: hash, obligationId: text, obligationDigest: hash }),
    classification: { enum: ["candidate_defect", "candidate_exemplar", "coverage_issue"] },
    reason: { enum: ["repeat_without_progress", "economical_exemplar", "coverage_gap"] }, evidence,
    metrics: closed({ equivalentAttempts: { type: "integer", minimum: 2, maximum: Number.MAX_SAFE_INTEGER }, measuredCost: metric,
      costLimit: metric, costUnit: { enum: ["wall_ms", "tool_calls", "usd"] } }, []),
    status: { const: "unresolved" }, visibility: { const: "silent" }, causalAttribution: { const: "not-established" },
  }),
  oneOf: [
    { properties: { reason: { const: "repeat_without_progress" }, classification: { const: "candidate_defect" }, metrics: { required: ["equivalentAttempts"] } } },
    { properties: { reason: { const: "economical_exemplar" }, classification: { const: "candidate_exemplar" }, metrics: { required: ["measuredCost", "costLimit", "costUnit"] } } },
    { properties: { reason: { const: "coverage_gap" }, classification: { const: "coverage_issue" } } },
  ],
});
export const WORK_CASE_REVIEW_REQUEST_SCHEMA = freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  ...closed({ caseManifestId: hash, priorDecisionId: { anyOf: [hash, { type: "null" }] },
    disposition: { enum: ["confirmed_defect", "expected_behavior", "exemplar", "uncertain", "skip"] }, note: { type: "string", maxLength: 4000 } }),
});
