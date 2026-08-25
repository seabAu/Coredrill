import type { JsonValue } from "@coredrill/contracts";
import {
  STATUS_CATEGORIES,
  dateOnly,
  entityId,
  instant,
  type StatusCategory,
} from "@coredrill/domain";

export const JOB_FILTER_SPEC_VERSION = 1 as const;

export const JOB_FILTER_LIMITS = Object.freeze({
  maximumChildrenPerGroup: 32,
  maximumDepth: 6,
  maximumListValues: 50,
  maximumPredicates: 64,
  maximumSerializedCharacters: 262_144,
  maximumTextCharacters: 512,
});

export const JOB_FILTER_FIELDS = Object.freeze([
  "archived_at",
  "company_id",
  "company_name",
  "date_posted",
  "employment_type",
  "location_id",
  "next_action_at",
  "normalized_title",
  "seniority",
  "source_connector",
  "status_category",
  "status_id",
  "tag_id",
  "title",
  "valid_through",
  "workplace_type",
] as const);

export type JobFilterField = (typeof JOB_FILTER_FIELDS)[number];

export const JOB_FILTER_OPERATORS = Object.freeze([
  "after",
  "before",
  "between",
  "contains",
  "ends_with",
  "equals",
  "is_not_set",
  "is_set",
  "not_equals",
  "not_one_of",
  "on_or_after",
  "on_or_before",
  "one_of",
  "starts_with",
] as const);

export type JobFilterOperator = (typeof JOB_FILTER_OPERATORS)[number];
export type JobFilterScalar = string | null;
export type JobFilterValue = JobFilterScalar | readonly JobFilterScalar[];

export interface JobFilterPredicate {
  readonly type: "predicate";
  readonly field: JobFilterField;
  readonly operator: JobFilterOperator;
  readonly value: JobFilterValue;
}

export interface JobFilterGroup {
  readonly type: "group";
  readonly op: "and" | "or";
  readonly negated: boolean;
  readonly children: readonly JobFilterNode[];
}

export type JobFilterNode = JobFilterGroup | JobFilterPredicate;

export interface JobFilterDocumentV1 {
  readonly specVersion: typeof JOB_FILTER_SPEC_VERSION;
  readonly root: JobFilterNode;
}

export type JobFilterValidationCode =
  | "incompatible_operator"
  | "invalid_document"
  | "invalid_node"
  | "invalid_value"
  | "limit_exceeded"
  | "unknown_field"
  | "unsupported_version";

export class JobFilterValidationError extends Error {
  public override readonly name = "JobFilterValidationError";

  public constructor(
    public readonly code: JobFilterValidationCode,
    public readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
  }
}

type FieldKind =
  "date" | "identifier" | "instant" | "relation-id" | "status-category" | "text" | "uuid";

type FieldDefinition =
  | {
      readonly kind: "relation-id" | "uuid";
      readonly entityType: string;
      readonly values?: ReadonlySet<string>;
    }
  | {
      readonly kind: Exclude<FieldKind, "relation-id" | "uuid">;
      readonly values?: ReadonlySet<string>;
    };

const WORKPLACE_TYPES = new Set(["hybrid", "on_site", "remote", "unknown"]);
const FIELD_DEFINITIONS: Readonly<Record<JobFilterField, FieldDefinition>> = Object.freeze({
  archived_at: { kind: "instant" },
  company_id: { kind: "uuid", entityType: "company" },
  company_name: { kind: "text" },
  date_posted: { kind: "date" },
  employment_type: { kind: "identifier" },
  location_id: { kind: "uuid", entityType: "location" },
  next_action_at: { kind: "instant" },
  normalized_title: { kind: "text" },
  seniority: { kind: "identifier" },
  source_connector: { kind: "identifier" },
  status_category: { kind: "status-category", values: new Set(STATUS_CATEGORIES) },
  status_id: { kind: "uuid", entityType: "status_definition" },
  tag_id: { kind: "relation-id", entityType: "tag" },
  title: { kind: "text" },
  valid_through: { kind: "date" },
  workplace_type: { kind: "identifier", values: WORKPLACE_TYPES },
});

const TEXT_OPERATORS = new Set<JobFilterOperator>([
  "contains",
  "ends_with",
  "equals",
  "is_not_set",
  "is_set",
  "not_equals",
  "starts_with",
]);
const EQUALITY_OPERATORS = new Set<JobFilterOperator>([
  "equals",
  "is_not_set",
  "is_set",
  "not_equals",
  "not_one_of",
  "one_of",
]);
const ORDERED_OPERATORS = new Set<JobFilterOperator>([
  "after",
  "before",
  "between",
  "equals",
  "is_not_set",
  "is_set",
  "not_equals",
  "on_or_after",
  "on_or_before",
]);
const SAFE_IDENTIFIER_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;

interface ParseState {
  predicates: number;
}

const fail = (code: JobFilterValidationCode, path: string, message: string): never => {
  throw new JobFilterValidationError(code, path, message);
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
};

const requireExactKeys = (
  record: Record<string, unknown>,
  keys: readonly string[],
  path: string,
): void => {
  const allowed = new Set(keys);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    fail("invalid_node", path, "contains an unknown property");
  }
  if (keys.some((key) => !(key in record))) {
    fail("invalid_node", path, "is missing a required property");
  }
};

const jobFilterField = (value: unknown, path: string): JobFilterField => {
  if (typeof value !== "string") {
    return fail("unknown_field", path, "must name a supported field");
  }
  if (!JOB_FILTER_FIELDS.some((field) => field === value)) {
    return fail("unknown_field", path, `field ${JSON.stringify(value)} is not supported`);
  }
  return value as JobFilterField;
};

const jobFilterOperator = (value: unknown, path: string): JobFilterOperator => {
  if (typeof value !== "string") {
    return fail("incompatible_operator", path, "must name a supported operator");
  }
  if (!JOB_FILTER_OPERATORS.some((operator) => operator === value)) {
    return fail(
      "incompatible_operator",
      path,
      `operator ${JSON.stringify(value)} is not supported`,
    );
  }
  return value as JobFilterOperator;
};

const allowedOperators = (kind: FieldKind): ReadonlySet<JobFilterOperator> => {
  if (kind === "text") return TEXT_OPERATORS;
  if (kind === "date" || kind === "instant") return ORDERED_OPERATORS;
  return EQUALITY_OPERATORS;
};

const stringValue = (value: unknown, definition: FieldDefinition, path: string): string => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > JOB_FILTER_LIMITS.maximumTextCharacters ||
    value.includes("\u0000")
  ) {
    return fail("invalid_value", path, "must be nonempty bounded text without NUL characters");
  }

  if (
    definition.kind === "uuid" ||
    definition.kind === "relation-id" ||
    definition.kind === "date" ||
    definition.kind === "instant"
  ) {
    try {
      if (definition.kind === "uuid" || definition.kind === "relation-id") {
        entityId(definition.entityType, value);
      } else if (definition.kind === "date") {
        dateOnly(value);
      } else {
        instant(value);
      }
    } catch {
      return fail(
        "invalid_value",
        path,
        `value ${JSON.stringify(value)} is invalid for this field`,
      );
    }
  } else if (
    definition.kind === "identifier" &&
    (value.length > 128 || !SAFE_IDENTIFIER_PATTERN.test(value))
  ) {
    return fail("invalid_value", path, "must be a bounded lowercase identifier");
  } else if (definition.kind === "status-category") {
    const category = value as StatusCategory;
    if (!STATUS_CATEGORIES.includes(category)) {
      return fail("invalid_value", path, "must be a stable status category");
    }
  }

  if (definition.values !== undefined && !definition.values.has(value)) {
    return fail(
      "invalid_value",
      path,
      `value ${JSON.stringify(value)} is not supported for this field`,
    );
  }
  return value;
};

const parsePredicateValue = (
  value: unknown,
  definition: FieldDefinition,
  operator: JobFilterOperator,
  path: string,
): JobFilterValue => {
  if (operator === "is_set" || operator === "is_not_set") {
    if (value !== null) fail("invalid_value", path, `${operator} requires a null value`);
    return null;
  }

  if (operator === "one_of" || operator === "not_one_of") {
    if (
      !Array.isArray(value) ||
      value.length === 0 ||
      value.length > JOB_FILTER_LIMITS.maximumListValues
    ) {
      return fail("invalid_value", path, `${operator} requires a bounded nonempty array`);
    }
    const normalized = value.map((item, index) =>
      stringValue(item, definition, `${path}[${String(index)}]`),
    );
    if (new Set(normalized).size !== normalized.length) {
      return fail("invalid_value", path, "list values must be unique");
    }
    return Object.freeze(normalized);
  }

  if (operator === "between") {
    if (!Array.isArray(value) || value.length !== 2) {
      return fail("invalid_value", path, "between requires exactly two ordered values");
    }
    const lower = stringValue(value[0], definition, `${path}[0]`);
    const upper = stringValue(value[1], definition, `${path}[1]`);
    if (lower > upper) {
      return fail("invalid_value", path, "between lower bound exceeds upper bound");
    }
    return Object.freeze([lower, upper]);
  }

  return stringValue(value, definition, path);
};

const parseNode = (
  input: unknown,
  path: string,
  depth: number,
  state: ParseState,
): JobFilterNode => {
  if (depth > JOB_FILTER_LIMITS.maximumDepth) {
    return fail("limit_exceeded", path, "filter nesting exceeds the maximum depth");
  }
  if (!isPlainRecord(input)) {
    return fail("invalid_node", path, "must be a group or predicate object");
  }
  if (input["type"] !== "group" && input["type"] !== "predicate") {
    return fail("invalid_node", path, "must be a group or predicate object");
  }

  if (input["type"] === "group") {
    requireExactKeys(input, ["type", "op", "negated", "children"], path);
    const op = input["op"];
    if (op !== "and" && op !== "or") {
      return fail("invalid_node", `${path}.op`, 'must be "and" or "or"');
    }
    const negated = input["negated"];
    if (typeof negated !== "boolean") {
      return fail("invalid_node", `${path}.negated`, "must be boolean");
    }
    const children = input["children"];
    if (
      !Array.isArray(children) ||
      children.length === 0 ||
      children.length > JOB_FILTER_LIMITS.maximumChildrenPerGroup
    ) {
      return fail("limit_exceeded", `${path}.children`, "must be a bounded nonempty node array");
    }
    return Object.freeze({
      type: "group",
      op,
      negated,
      children: Object.freeze(
        children.map((child, index) =>
          parseNode(child, `${path}.children[${String(index)}]`, depth + 1, state),
        ),
      ),
    });
  }

  requireExactKeys(input, ["type", "field", "operator", "value"], path);
  state.predicates += 1;
  if (state.predicates > JOB_FILTER_LIMITS.maximumPredicates) {
    return fail("limit_exceeded", path, "filter contains too many predicates");
  }
  const field = jobFilterField(input["field"], `${path}.field`);
  const operator = jobFilterOperator(input["operator"], `${path}.operator`);
  const definition = FIELD_DEFINITIONS[field];
  if (!allowedOperators(definition.kind).has(operator)) {
    return fail("incompatible_operator", `${path}.operator`, `${operator} is invalid for ${field}`);
  }
  return Object.freeze({
    type: "predicate",
    field,
    operator,
    value: parsePredicateValue(input["value"], definition, operator, `${path}.value`),
  });
};

export const parseJobFilter = (input: unknown): JobFilterDocumentV1 => {
  if (!isPlainRecord(input)) {
    return fail("invalid_document", "$", "filter document must be an object");
  }
  const keys = Object.keys(input);
  if (keys.length !== 2 || !keys.includes("specVersion") || !keys.includes("root")) {
    return fail("invalid_document", "$", "filter document must contain only specVersion and root");
  }
  if (input["specVersion"] !== JOB_FILTER_SPEC_VERSION) {
    return fail("unsupported_version", "$.specVersion", "filter version is not supported");
  }
  return Object.freeze({
    specVersion: JOB_FILTER_SPEC_VERSION,
    root: parseNode(input["root"], "$.root", 1, { predicates: 0 }),
  });
};

const nodeToJson = (node: JobFilterNode): JsonValue => {
  if (node.type === "group") {
    return {
      type: "group",
      op: node.op,
      negated: node.negated,
      children: node.children.map(nodeToJson),
    };
  }
  const value: JsonValue =
    typeof node.value === "string" || node.value === null ? node.value : [...node.value];
  return {
    type: "predicate",
    field: node.field,
    operator: node.operator,
    value,
  };
};

export const jobFilterToJson = (input: JobFilterDocumentV1): JsonValue => {
  const document = parseJobFilter(input);
  return {
    specVersion: document.specVersion,
    root: nodeToJson(document.root),
  };
};

export const serializeJobFilter = (input: JobFilterDocumentV1): string => {
  const serialized = JSON.stringify(jobFilterToJson(input));
  if (serialized.length > JOB_FILTER_LIMITS.maximumSerializedCharacters) {
    fail("limit_exceeded", "$", "serialized filter exceeds its storage limit");
  }
  return serialized;
};

export const parseJobFilterJson = (serialized: string): JobFilterDocumentV1 => {
  if (serialized.length > JOB_FILTER_LIMITS.maximumSerializedCharacters) {
    fail("limit_exceeded", "$", "serialized filter exceeds its storage limit");
  }
  let input: unknown;
  try {
    input = JSON.parse(serialized) as unknown;
  } catch {
    fail("invalid_document", "$", "serialized filter is not valid JSON");
  }
  return parseJobFilter(input);
};

export const defineJobFilter = (root: JobFilterNode): JobFilterDocumentV1 =>
  parseJobFilter({ specVersion: JOB_FILTER_SPEC_VERSION, root });
