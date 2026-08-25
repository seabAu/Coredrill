import type { SqlValue } from "@coredrill/storage-core";

import {
  parseJobFilter,
  type JobFilterDocumentV1,
  type JobFilterNode,
  type JobFilterOperator,
  type JobFilterPredicate,
} from "./filter-ast.js";

export interface CompiledJobFilter {
  readonly parameters: readonly SqlValue[];
  readonly whereSql: string;
}

interface CompileContext {
  readonly parameters: SqlValue[];
}

const SCALAR_EXPRESSIONS = Object.freeze({
  archived_at: "job.archived_at",
  company_id: "job.company_id",
  company_name:
    "(SELECT filter_company.canonical_name FROM company AS filter_company WHERE filter_company.id = job.company_id)",
  date_posted: "job.date_posted",
  employment_type: "job.employment_type",
  location_id: "job.location_id",
  next_action_at: "job.next_action_at",
  normalized_title: "job.normalized_title",
  seniority: "job.seniority",
  status_category:
    "(SELECT filter_status.category FROM status_definition AS filter_status WHERE filter_status.id = job.current_status_id)",
  status_id: "job.current_status_id",
  title: "job.title",
  valid_through: "job.valid_through",
  workplace_type: "job.workplace_type",
} as const);

const escapeLike = (value: string): string =>
  value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");

const bind = (context: CompileContext, value: SqlValue): string => {
  context.parameters.push(value);
  return "?";
};

const stringValue = (predicate: JobFilterPredicate): string => predicate.value as string;

const compileList = (
  expression: string,
  values: readonly string[],
  operator: "IN" | "NOT IN",
  context: CompileContext,
): string => {
  const placeholders = values.map((value) => bind(context, value)).join(", ");
  return `${expression} ${operator} (${placeholders})`;
};

const compileScalarPredicate = (
  expression: string,
  predicate: JobFilterPredicate,
  context: CompileContext,
): string => {
  const operator: JobFilterOperator = predicate.operator;
  if (operator === "is_set") return `${expression} IS NOT NULL`;
  if (operator === "is_not_set") return `${expression} IS NULL`;
  if (operator === "one_of" || operator === "not_one_of") {
    return compileList(
      expression,
      predicate.value as readonly string[],
      operator === "one_of" ? "IN" : "NOT IN",
      context,
    );
  }
  if (operator === "between") {
    const values = predicate.value as readonly string[];
    const [lower, upper] = values;
    if (lower === undefined || upper === undefined) {
      throw new TypeError("Validated between predicates require exactly two values.");
    }
    return `${expression} BETWEEN ${bind(context, lower)} AND ${bind(context, upper)}`;
  }
  if (operator === "contains" || operator === "starts_with" || operator === "ends_with") {
    const escaped = escapeLike(stringValue(predicate));
    const pattern =
      operator === "contains"
        ? `%${escaped}%`
        : operator === "starts_with"
          ? `${escaped}%`
          : `%${escaped}`;
    return `${expression} LIKE ${bind(context, pattern)} ESCAPE '\\'`;
  }
  const sqlOperator: Readonly<
    Record<
      Exclude<
        JobFilterOperator,
        | "between"
        | "contains"
        | "ends_with"
        | "is_not_set"
        | "is_set"
        | "not_one_of"
        | "one_of"
        | "starts_with"
      >,
      string
    >
  > = {
    after: ">",
    before: "<",
    equals: "=",
    not_equals: "<>",
    on_or_after: ">=",
    on_or_before: "<=",
  };
  return `${expression} ${sqlOperator[operator]} ${bind(context, stringValue(predicate))}`;
};

const relationSql = (
  predicate: JobFilterPredicate,
  context: CompileContext,
  table: "job_source" | "job_tag",
  column: "connector_id" | "tag_id",
): string => {
  const alias = table === "job_tag" ? "filter_job_tag" : "filter_job_source";
  const relation = `${alias}.job_id = job.id`;
  if (predicate.operator === "is_set") {
    return `EXISTS (SELECT 1 FROM ${table} AS ${alias} WHERE ${relation})`;
  }
  if (predicate.operator === "is_not_set") {
    return `NOT EXISTS (SELECT 1 FROM ${table} AS ${alias} WHERE ${relation})`;
  }
  const values =
    predicate.operator === "one_of" || predicate.operator === "not_one_of"
      ? (predicate.value as readonly string[])
      : [stringValue(predicate)];
  const placeholders = values.map((value) => bind(context, value)).join(", ");
  const positive = predicate.operator === "equals" || predicate.operator === "one_of";
  return `${positive ? "" : "NOT "}EXISTS (SELECT 1 FROM ${table} AS ${alias} WHERE ${relation} AND ${alias}.${column} IN (${placeholders}))`;
};

const compilePredicate = (predicate: JobFilterPredicate, context: CompileContext): string => {
  if (predicate.field === "tag_id") {
    return relationSql(predicate, context, "job_tag", "tag_id");
  }
  if (predicate.field === "source_connector") {
    return relationSql(predicate, context, "job_source", "connector_id");
  }
  return compileScalarPredicate(SCALAR_EXPRESSIONS[predicate.field], predicate, context);
};

const compileNode = (node: JobFilterNode, context: CompileContext): string => {
  if (node.type === "predicate") return `(${compilePredicate(node, context)})`;
  const joined = node.children
    .map((child) => compileNode(child, context))
    .join(node.op === "and" ? " AND " : " OR ");
  return node.negated ? `(NOT (${joined}))` : `(${joined})`;
};

export const compileJobFilter = (input: JobFilterDocumentV1): CompiledJobFilter => {
  const document = parseJobFilter(input);
  const context: CompileContext = { parameters: [] };
  return Object.freeze({
    whereSql: compileNode(document.root, context),
    parameters: Object.freeze(context.parameters),
  });
};
