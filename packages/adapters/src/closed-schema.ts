/**
 * A deliberately tiny JSON Schema evaluator, used to validate a native record
 * against a *pinned producer schema document* before any semantic normalization.
 *
 * Why not a general validator: the only schema this has to evaluate is pi-daddy's
 * canonical `ledgerVersion: 2` contract, which uses a small, closed subset of draft
 * 2020-12. Interpreting the producer's own bytes is what makes "unknown top-level
 * field", "bad enum member", "wrong nullability" and "requiredness drift" fail
 * closed *by construction* rather than by a hand-transcribed rule that can drift.
 *
 * The one thing a subset evaluator must never do is silently ignore a keyword it
 * does not implement — that turns a tightened contract into an unvalidated one.
 * `assertSupportedSchema` therefore walks the whole document and refuses any
 * keyword outside `SUPPORTED_KEYWORDS`, so a future contract construct is a loud
 * failure instead of a quiet hole.
 *
 * Violation messages carry the instance *path* and the *schema's* expectation, and
 * never the instance value: a ledger is untrusted input and an error string ends up
 * in persisted diagnostics. The one name that can come from the instance is an
 * undeclared property's, and that is withheld unless the contract declares it
 * somewhere (see `knownFieldNames`).
 */

import { redactText } from "@skill-harness/core";

/** Keywords carried for humans and ignored for validation. */
const ANNOTATION_KEYWORDS = new Set(["$schema", "$id", "title", "description", "$defs"]);

/** Keywords this evaluator implements. Anything else is refused, not ignored. */
const SUPPORTED_KEYWORDS = new Set([
  ...ANNOTATION_KEYWORDS,
  // structure
  "$ref", "oneOf", "type", "properties", "required", "additionalProperties", "items",
  // value constraints
  "enum", "const", "minLength", "maxLength", "minimum", "pattern", "format",
]);

/**
 * The shape each supported keyword must have. A keyword whose *name* is known but
 * whose *value* has an unexpected shape is the same hole as an unknown keyword:
 * `required: "a"` would be skipped by the `Array.isArray` guard downstream and
 * requiredness would go unenforced with nothing said.
 */
const KEYWORD_SHAPES: Record<string, { check: (value: unknown) => boolean; expected: string }> = {
  $ref: { check: (value) => typeof value === "string", expected: "a string" },
  oneOf: { check: (value) => Array.isArray(value) && value.length > 0, expected: "a non-empty array" },
  type: { check: (value) => typeof value === "string" || (Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === "string")), expected: "a string or array of strings" },
  properties: { check: (value) => isSchemaObject(value), expected: "an object" },
  required: { check: (value) => Array.isArray(value) && value.every((entry) => typeof entry === "string"), expected: "an array of strings" },
  additionalProperties: { check: (value) => typeof value === "boolean" || isSchemaObject(value), expected: "a boolean or a schema object" },
  items: { check: (value) => isSchemaObject(value), expected: "a schema object" },
  enum: { check: (value) => Array.isArray(value) && value.length > 0, expected: "a non-empty array" },
  minLength: { check: (value) => typeof value === "number", expected: "a number" },
  maxLength: { check: (value) => typeof value === "number", expected: "a number" },
  minimum: { check: (value) => typeof value === "number", expected: "a number" },
  pattern: { check: (value) => typeof value === "string", expected: "a string" },
  format: { check: (value) => typeof value === "string", expected: "a string" },
  // `const` may legitimately be any JSON value, including null.
};

const SUPPORTED_FORMATS = new Set(["date-time"]);
const SUPPORTED_TYPES = new Set(["object", "array", "string", "number", "integer", "boolean", "null"]);

export interface SchemaViolation {
  /** Instance path, e.g. `correlation.event_seq` or `approvalSources["tool:read"]`. */
  path: string;
  /** What the pinned schema required. Never contains an unbounded instance value. */
  message: string;
}

type Schema = Record<string, unknown>;

/**
 * Refuse a schema document containing constructs this evaluator cannot enforce.
 * Called once per document (memoized by the caller) so a contract bump that adds
 * a keyword fails loudly rather than validating less than it claims.
 */
export function assertSupportedSchema(schema: unknown, label: string, path = "#"): void {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    throw new Error(`${label} is not a JSON Schema object at ${path}`);
  }
  const node = schema as Schema;
  for (const keyword of Object.keys(node)) {
    if (!SUPPORTED_KEYWORDS.has(keyword)) {
      throw new Error(`${label} uses unsupported JSON Schema keyword \`${keyword}\` at ${path}; the closed-contract evaluator refuses to validate less than the schema declares`);
    }
    const shape = KEYWORD_SHAPES[keyword];
    if (shape && !shape.check(node[keyword])) {
      throw new Error(`${label} declares \`${keyword}\` at ${path} as something other than ${shape.expected}; the closed-contract evaluator refuses to skip a keyword it cannot read`);
    }
  }
  if (node.format !== undefined && !SUPPORTED_FORMATS.has(String(node.format))) {
    throw new Error(`${label} uses unsupported format \`${String(node.format)}\` at ${path}`);
  }
  for (const type of typeList(node)) {
    if (!SUPPORTED_TYPES.has(type)) throw new Error(`${label} uses unsupported type \`${type}\` at ${path}`);
  }
  if (node.$ref !== undefined) {
    if (!/^#\/\$defs\/[A-Za-z0-9_]+$/.test(String(node.$ref))) {
      throw new Error(`${label} uses unsupported $ref \`${String(node.$ref)}\` at ${path}; only #/$defs/<name> is resolvable`);
    }
    // `validate` follows a `$ref` and evaluates the target *instead of* this node, so
    // a sibling constraint would be silently dropped — the precise hole this file
    // exists to prevent. Refuse the combination rather than half-enforce it.
    const siblings = Object.keys(node).filter((keyword) => keyword !== "$ref" && !ANNOTATION_KEYWORDS.has(keyword));
    if (siblings.length > 0) {
      throw new Error(`${label} combines $ref with ${siblings.map((keyword) => `\`${keyword}\``).join(", ")} at ${path}; the closed-contract evaluator would drop the sibling constraint, so it refuses the schema instead`);
    }
  }
  for (const [name, entry] of Object.entries(object(node.$defs) ?? {})) assertSupportedSchema(entry, label, `${path}/$defs/${name}`);
  for (const [index, entry] of (Array.isArray(node.oneOf) ? node.oneOf : []).entries()) assertSupportedSchema(entry, label, `${path}/oneOf/${index}`);
  for (const [name, entry] of Object.entries(object(node.properties) ?? {})) assertSupportedSchema(entry, label, `${path}/properties/${name}`);
  if (node.items !== undefined) assertSupportedSchema(node.items, label, `${path}/items`);
  if (node.additionalProperties !== undefined && node.additionalProperties !== false && node.additionalProperties !== true) {
    assertSupportedSchema(node.additionalProperties, label, `${path}/additionalProperties`);
  }
}

/**
 * Validate `value` against `schema`. Returns every violation found; an empty
 * array means the instance satisfies the pinned contract.
 *
 * `knownFieldNames` is the set of property names the caller is willing to echo in
 * an "unknown field" message. A name outside it is redacted: an attacker-supplied
 * key is untrusted text, but naming a field the contract *does* know elsewhere is
 * what makes the message actionable.
 */
export function validateClosedSchema(
  schema: Schema,
  value: unknown,
  options: { knownFieldNames?: ReadonlySet<string> } = {},
): SchemaViolation[] {
  return validate(schema, schema, value, "", options.knownFieldNames ?? new Set());
}

/** Every property name declared anywhere in the document — safe to echo. */
export function declaredPropertyNames(schema: unknown): Set<string> {
  const names = new Set<string>();
  const walk = (node: unknown): void => {
    const current = object(node);
    if (!current) return;
    for (const [name, entry] of Object.entries(object(current.properties) ?? {})) {
      names.add(name);
      walk(entry);
    }
    for (const entry of Object.values(object(current.$defs) ?? {})) walk(entry);
    for (const entry of Array.isArray(current.oneOf) ? current.oneOf : []) walk(entry);
    if (current.items !== undefined) walk(current.items);
    if (current.additionalProperties && typeof current.additionalProperties === "object") walk(current.additionalProperties);
  };
  walk(schema);
  return names;
}

function validate(root: Schema, schema: Schema, value: unknown, path: string, known: ReadonlySet<string>): SchemaViolation[] {
  if (schema.$ref !== undefined) {
    const resolved = resolveRef(root, String(schema.$ref));
    return validate(root, resolved, value, path, known);
  }
  const violations: SchemaViolation[] = [];
  const types = typeList(schema);
  if (types.length && !types.some((type) => matchesType(type, value))) {
    return [{ path, message: `must be ${describeTypes(types)}` }];
  }
  if (schema.const !== undefined && !sameJson(schema.const, value)) {
    return [{ path, message: `must be ${JSON.stringify(schema.const)}` }];
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((allowed) => sameJson(allowed, value))) {
    return [{ path, message: `must be one of ${schema.enum.map((allowed) => stringifyAllowed(allowed)).join(", ")}` }];
  }
  if (Array.isArray(schema.oneOf)) {
    const branches = schema.oneOf.map((branch) => validate(root, branch as Schema, value, path, known));
    const matched = branches.filter((branch) => branch.length === 0).length;
    if (matched === 0) return bestBranch(root, schema.oneOf as Schema[], branches, value, path);
    // A closed union that matches twice is ambiguous; refuse rather than pick.
    if (matched > 1) return [{ path, message: `matches ${matched} of the ${branches.length} allowed shapes and is therefore ambiguous` }];
  }
  if (typeof value === "string") violations.push(...validateString(schema, value, path));
  if (typeof value === "number") violations.push(...validateNumber(schema, value, path));
  if (Array.isArray(value) && schema.items !== undefined) {
    value.forEach((entry, index) => violations.push(...validate(root, schema.items as Schema, entry, `${path}[${index}]`, known)));
  }
  const record = object(value);
  if (record) violations.push(...validateObject(root, schema, record, path, known));
  return violations;
}

function validateObject(root: Schema, schema: Schema, record: Record<string, unknown>, path: string, known: ReadonlySet<string>): SchemaViolation[] {
  const violations: SchemaViolation[] = [];
  const properties = object(schema.properties) ?? {};
  for (const name of (Array.isArray(schema.required) ? schema.required : []) as string[]) {
    if (!Object.hasOwn(record, name)) violations.push({ path: child(path, name), message: "is required" });
  }
  for (const [name, entry] of Object.entries(record)) {
    if (entry === undefined) continue;
    const propertySchema = Object.hasOwn(properties, name) ? object(properties[name]) : undefined;
    if (propertySchema) {
      violations.push(...validate(root, propertySchema, entry, child(path, name), known));
      continue;
    }
    if (schema.additionalProperties === false) {
      violations.push({
        path: path || "(top level)",
        message: `carries undeclared field ${known.has(name) ? name : "[REDACTED field name]"}, which the closed contract does not allow`,
      });
      continue;
    }
    const extra = typeof schema.additionalProperties === "object" && schema.additionalProperties !== null
      ? schema.additionalProperties as Schema
      : undefined;
    if (extra) violations.push(...validate(root, extra, entry, child(path, name), known));
  }
  return violations;
}

function validateString(schema: Schema, value: string, path: string): SchemaViolation[] {
  const violations: SchemaViolation[] = [];
  if (typeof schema.minLength === "number" && value.length < schema.minLength) {
    violations.push({ path, message: schema.minLength === 1 ? "must not be empty" : `must be at least ${schema.minLength} characters` });
  }
  if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
    violations.push({ path, message: `must be at most ${schema.maxLength} characters` });
  }
  if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) {
    violations.push({ path, message: `must match ${schema.pattern}` });
  }
  if (schema.format === "date-time" && !isRfc3339(value)) {
    violations.push({ path, message: "must be an RFC 3339 date-time" });
  }
  return violations;
}

function validateNumber(schema: Schema, value: number, path: string): SchemaViolation[] {
  if (typeof schema.minimum === "number" && value < schema.minimum) {
    return [{ path, message: `must be >= ${schema.minimum}` }];
  }
  return [];
}

/**
 * Report the failed union against the branch the instance was *aiming at*.
 *
 * pi-daddy's union is discriminated by `event`, so the branch whose `const`
 * properties all match is the intended one, however many other violations it has.
 * Picking the branch with the fewest violations instead would report "event must be
 * `child_lifecycle`" about a `capability_decision` that is simply missing several
 * required fields — fail-closed but actively misleading. Only when no branch's
 * discriminator matches does violation count decide.
 */
function bestBranch(root: Schema, schemas: Schema[], branches: SchemaViolation[][], value: unknown, path: string): SchemaViolation[] {
  const discriminated = schemas
    .map((schema, index) => ({ schema, violations: branches[index] }))
    .filter(({ schema }) => matchesDiscriminator(root, schema, value));
  const candidates = discriminated.length === 1 ? [discriminated[0].violations] : branches;
  let best = candidates[0] ?? [];
  for (const branch of candidates) if (branch.length < best.length) best = branch;
  return best.length ? best : [{ path, message: "does not match any allowed shape" }];
}

/**
 * True when every *required* `const`-valued property of a branch matches the
 * instance. Requiredness is what separates a discriminator from an optional flag:
 * pi-daddy's variants also use `const: true` for omit-or-true markers like
 * `humanDenied` and `aborted`, and treating those as discriminating would make no
 * branch match a record that simply left them out.
 */
function matchesDiscriminator(root: Schema, schema: Schema, value: unknown): boolean {
  const resolved = schema.$ref !== undefined ? resolveRef(root, String(schema.$ref)) : schema;
  const record = object(value);
  const properties = object(resolved.properties);
  if (!record || !properties) return false;
  const required = new Set((Array.isArray(resolved.required) ? resolved.required : []) as string[]);
  const consts = Object.entries(properties)
    .filter(([name]) => required.has(name))
    .map(([name, entry]) => [name, object(entry)?.const] as const)
    .filter(([, constant]) => constant !== undefined);
  return consts.length > 0 && consts.every(([name, constant]) => sameJson(constant, record[name]));
}

function resolveRef(root: Schema, ref: string): Schema {
  const name = ref.replace("#/$defs/", "");
  const resolved = object((object(root.$defs) ?? {})[name]);
  if (!resolved) throw new Error(`unresolvable $ref ${ref} in pinned schema`);
  return resolved;
}

function typeList(schema: Schema): string[] {
  if (typeof schema.type === "string") return [schema.type];
  if (Array.isArray(schema.type)) return schema.type.map(String);
  return [];
}

function matchesType(type: string, value: unknown): boolean {
  switch (type) {
    case "object": return object(value) !== undefined;
    case "array": return Array.isArray(value);
    case "string": return typeof value === "string";
    case "boolean": return typeof value === "boolean";
    case "null": return value === null;
    case "integer": return typeof value === "number" && Number.isInteger(value);
    case "number": return typeof value === "number" && Number.isFinite(value);
    default: return false;
  }
}

function describeTypes(types: string[]): string {
  const article = (type: string) => (["object", "array", "integer"].includes(type) ? `an ${type}` : `a ${type}`);
  if (types.length === 1) return types[0] === "null" ? "null" : article(types[0]);
  return types.map((type) => (type === "null" ? "null" : article(type))).join(" or ");
}

function stringifyAllowed(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * Build the instance path for a property. Under a map-valued `additionalProperties`
 * the key comes from the ledger, so it is bounded and redaction-checked before it
 * reaches an error string: a path is a diagnostic, not a place to relay input.
 */
function child(path: string, name: string): string {
  const safe = /^[A-Za-z0-9_.:-]{1,64}$/.test(name) && redactText(name) === name ? name : "[REDACTED key]";
  if (safe === "[REDACTED key]") return path ? `${path}[REDACTED key]` : "[REDACTED key]";
  if (!path) return /^[A-Za-z_][A-Za-z0-9_]*$/.test(safe) ? safe : `[${JSON.stringify(safe)}]`;
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(safe) ? `${path}.${safe}` : `${path}[${JSON.stringify(safe)}]`;
}

function sameJson(left: unknown, right: unknown): boolean {
  return left === right || JSON.stringify(left) === JSON.stringify(right);
}

/**
 * RFC 3339 §5.6, as written — not as the harness happens to emit.
 *
 * That means lowercase `t`/`z` separators and a leap `:60` second are valid here,
 * even though pi-daddy's builders use `toISOString()` and never produce them. This
 * function implements a *contract* constraint (`"format": "date-time"`), so being
 * stricter than the contract would reject a conforming producer line and report it
 * as a contract violation. The harness's own narrower `validTime` still applies
 * afterwards, where it is correctly labelled a harness requirement.
 */
function isRfc3339(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) return false;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 60) return false;
  // `time-numoffset` is bounded by the same `time-hour`/`time-minute` rules, so
  // `+25:70` is not an RFC 3339 date-time however parseable it looks.
  if (match[8] !== undefined && (Number(match[8]) > 23 || Number(match[9]) > 59)) return false;
  return day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function isSchemaObject(value: unknown): boolean {
  return object(value) !== undefined;
}
