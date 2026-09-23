export const LEGACY_TRAJECTORY_EVENT_VERSION = "1.0" as const;
export const TRAJECTORY_EVENT_VERSION = "1.1" as const;
export type TrajectoryEventVersion = typeof LEGACY_TRAJECTORY_EVENT_VERSION | typeof TRAJECTORY_EVENT_VERSION;

export interface TrajectoryEventSource {
  adapter: "normalized-v1" | "principal-assurance-v1" | "pi-daddy-v1" | "pi-daddy-ledger-v3";
  path: string;
  required: boolean;
}

export interface TrajectoryApproval {
  id?: string;
  capability?: string;
  subject?: string;
  source?: string;
  scope?: string;
  approved_at?: string;
  expires_at?: string;
  used_at?: string;
}

export interface TrajectoryDigests {
  plan?: string;
  task?: string;
  definition?: string;
  head?: string;
  tree?: string;
  [key: string]: string | undefined;
}

/** Normalized pi-daddy/principal event retained by adapter consumers. */
export interface TrajectoryEventV1 {
  event_version: TrajectoryEventVersion;
  seq: number;
  type: string;
  source: string;
  at?: string;
  run_id?: string;
  task_id?: string;
  workspace_id?: string;
  context_id?: string;
  finding_id?: string;
  parent_id?: string;
  child_id?: string;
  execution_id?: string;
  parent_execution_id?: string | null;
  task_from_execution_id?: string;
  workflow_fact_id?: string;
  deadline_at?: string;
  phase?: string;
  tool?: string;
  capability?: string;
  requested_capabilities?: string[];
  effective_capabilities?: string[];
  refusal_code?: string;
  exit_code?: number;
  digests?: TrajectoryDigests;
  approval?: TrajectoryApproval;
  requirements?: string[];
  attributes?: Record<string, unknown>;
}

export function deserializeTrajectoryEvents(text: string): TrajectoryEventV1[] | null {
  const out: TrajectoryEventV1[] = [];
  try {
    for (const line of text.split("\n").filter((entry) => entry.trim())) {
      const event = JSON.parse(line) as TrajectoryEventV1;
      if (validateEvent(event) !== null) return null;
      out.push(event);
    }
  } catch {
    return null;
  }
  if (!out.length) return null;
  const sequences = out.map((event) => event.seq).sort((a, b) => a - b);
  if (new Set(sequences).size !== out.length || sequences.some((seq, index) => seq !== index + 1)) return null;
  return out;
}

const V11_EVENT_KEYS = new Set(["execution_id", "parent_execution_id", "task_from_execution_id", "workflow_fact_id", "deadline_at"]);
const EVENT_KEYS = new Set([
  "event_version", "seq", "type", "source", "at", "run_id", "task_id", "workspace_id", "context_id", "finding_id",
  "parent_id", "child_id", ...V11_EVENT_KEYS,
  "phase", "tool", "capability", "requested_capabilities", "effective_capabilities", "refusal_code",
  "exit_code", "digests", "approval", "requirements", "attributes",
]);
const APPROVAL_KEYS = new Set(["id", "capability", "subject", "source", "scope", "approved_at", "expires_at", "used_at"]);
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256_RE = /^[a-fA-F0-9]{64}$/;
const GIT_SHA_RE = /^(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/;
const REFUSAL_RE = /^[A-Z][A-Z0-9_]*$/;

function validateEvent(event: TrajectoryEventV1): string | null {
  if (!event || typeof event !== "object" || Array.isArray(event)) return "event must be an object";
  const object = event as unknown as Record<string, unknown>;
  const unknown = Object.keys(object).find((key) => !EVENT_KEYS.has(key));
  if (unknown) return `unknown field ${unknown}`;
  if (event.event_version !== LEGACY_TRAJECTORY_EVENT_VERSION && event.event_version !== TRAJECTORY_EVENT_VERSION) return `unsupported event_version ${String(event.event_version)}`;
  if (event.event_version === LEGACY_TRAJECTORY_EVENT_VERSION) {
    const versionedField = Object.keys(object).find((key) => V11_EVENT_KEYS.has(key));
    if (versionedField) return `${versionedField} requires event_version ${TRAJECTORY_EVENT_VERSION}`;
  }
  if (!Number.isInteger(event.seq) || event.seq < 1) return "seq must be a positive integer";
  if (typeof event.type !== "string" || !event.type) return "type must be a non-empty string";
  if (typeof event.source !== "string" || !event.source) return "source must be a non-empty string";
  if (event.at !== undefined && !validDate(event.at)) return "at must be an RFC 3339 date-time";
  for (const field of ["run_id", "task_id", "workspace_id", "context_id", "finding_id", "parent_id", "child_id", "execution_id", "task_from_execution_id", "workflow_fact_id"] as const) {
    if (event[field] !== undefined && (typeof event[field] !== "string" || !ID_RE.test(event[field]))) return `${field} is not a valid bounded identifier`;
  }
  if (event.parent_execution_id !== undefined && event.parent_execution_id !== null && (typeof event.parent_execution_id !== "string" || !ID_RE.test(event.parent_execution_id))) return "parent_execution_id is not a valid bounded identifier or null";
  if (event.deadline_at !== undefined && !validDate(event.deadline_at)) return "deadline_at must be an RFC 3339 date-time";
  for (const field of ["phase", "tool", "capability"] as const) if (event[field] !== undefined && (typeof event[field] !== "string" || !event[field])) return `${field} must be a non-empty string`;
  for (const field of ["requested_capabilities", "effective_capabilities", "requirements"] as const) {
    const values = event[field];
    if (values !== undefined && (!Array.isArray(values) || values.some((value) => typeof value !== "string" || !value) || new Set(values).size !== values.length)) return `${field} must be an array of unique non-empty strings`;
  }
  if (event.refusal_code !== undefined && !REFUSAL_RE.test(event.refusal_code)) return "refusal_code is invalid";
  if (event.exit_code !== undefined && !Number.isInteger(event.exit_code)) return "exit_code must be an integer";
  if (event.digests !== undefined) {
    if (!event.digests || typeof event.digests !== "object" || Array.isArray(event.digests)) return "digests must be an object";
    for (const [key, value] of Object.entries(event.digests)) {
      if (typeof value !== "string") return `digests.${key} must be a string`;
      if (["plan", "task", "definition"].includes(key) && !SHA256_RE.test(value)) return `digests.${key} must be sha256`;
      if (["head", "tree"].includes(key) && !GIT_SHA_RE.test(value)) return `digests.${key} must be a git object id`;
    }
  }
  if (event.approval !== undefined) {
    if (!event.approval || typeof event.approval !== "object" || Array.isArray(event.approval)) return "approval must be an object";
    const unknownApproval = Object.keys(event.approval).find((key) => !APPROVAL_KEYS.has(key));
    if (unknownApproval) return `approval.${unknownApproval} is unknown`;
    for (const [key, value] of Object.entries(event.approval)) {
      if (typeof value !== "string" || !value) return `approval.${key} must be a non-empty string`;
      if (key === "id" && !ID_RE.test(value)) return "approval.id is invalid";
      if (["approved_at", "expires_at", "used_at"].includes(key) && !validDate(value)) return `approval.${key} must be an RFC 3339 date-time`;
    }
  }
  if (event.attributes !== undefined && (!event.attributes || typeof event.attributes !== "object" || Array.isArray(event.attributes))) return "attributes must be an object";
  return null;
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  return day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}
