import {
  PORTABLE_DATA_EXPORT_LIMITS,
  portableDataExportV1Schema,
  type JsonValue,
  type PortableDataExportV1,
  type PortableDataRowV1,
} from "@coredrill/contracts";

import {
  sqlStatement,
  type DatabasePort,
  type DatabaseTransaction,
  type SqlValue,
} from "./database-port.js";
import type { PortableArchiveDataFileSourceV1 } from "./portable-archive-writer.js";

export const PORTABLE_DATA_EXPORT_SOURCE_SCHEMA_VERSION = 92 as const;
export const PORTABLE_DATA_EXPORT_WRITER_LIMITS = Object.freeze({
  maxCellBytes: 16 * 1024 * 1024,
  maxEntryBytes: 128 * 1024 * 1024,
  maxPayloadBytes: 384 * 1024 * 1024,
});

export type PortableDataExportWriterErrorCode =
  | "contract_failed"
  | "invalid_database_value"
  | "invalid_input"
  | "payload_too_large"
  | "query_failed"
  | "schema_mismatch";

const ERROR_MESSAGES = Object.freeze({
  contract_failed: "A human-readable export did not satisfy its version 1 contract.",
  invalid_database_value: "The vault contains a value that cannot be represented safely.",
  invalid_input: "The human-readable export input is invalid.",
  payload_too_large: "The human-readable export exceeds the reviewed in-memory limit.",
  query_failed: "The human-readable export could not read a consistent local snapshot.",
  schema_mismatch: "The vault schema is not supported by this human-readable export version.",
} satisfies Readonly<Record<PortableDataExportWriterErrorCode, string>>);

export class PortableDataExportWriterError extends Error {
  public readonly code: PortableDataExportWriterErrorCode;

  public constructor(code: PortableDataExportWriterErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "PortableDataExportWriterError";
    this.code = code;
  }
}

interface DatasetSpec {
  readonly name: string;
  readonly table: string;
  readonly columns: readonly string[];
  readonly orderBy: readonly string[];
  readonly booleanColumns?: readonly string[];
  readonly jsonColumns?: readonly string[];
}

const dataset = (spec: DatasetSpec): DatasetSpec => Object.freeze(spec);

/**
 * Version-1 human-readable data is deliberately table-oriented and complete
 * for Phase 1 user records. Adapter/runtime internals are excluded below.
 */
export const PORTABLE_DATA_EXPORT_DATASETS: readonly DatasetSpec[] = Object.freeze([
  dataset({
    name: "vault",
    table: "vault",
    columns: ["id", "name", "schema_version", "created_at", "last_opened_at"],
    orderBy: ["id"],
  }),
  dataset({
    name: "app_setting",
    table: "app_setting",
    columns: ["key", "json_value", "updated_at", "row_version"],
    jsonColumns: ["json_value"],
    orderBy: ["key"],
  }),
  dataset({
    name: "capture_inbox",
    table: "capture_inbox",
    columns: [
      "envelope_id",
      "content_hash",
      "envelope_checksum",
      "sender_id",
      "sender_sequence",
      "sender_nonce",
      "captured_at",
      "expires_at",
      "received_at",
      "received_via",
      "envelope_json",
    ],
    jsonColumns: ["envelope_json"],
    orderBy: ["envelope_id"],
  }),
  dataset({
    name: "location",
    table: "location",
    columns: [
      "id",
      "label",
      "address_locality",
      "region",
      "postal_code",
      "country_code",
      "latitude",
      "longitude",
      "precision",
      "source",
      "created_at",
      "updated_at",
      "row_version",
    ],
    orderBy: ["id"],
  }),
  dataset({
    name: "company",
    table: "company",
    columns: [
      "id",
      "canonical_name",
      "website_url",
      "domain",
      "location_id",
      "notes",
      "archived_at",
      "created_at",
      "updated_at",
      "row_version",
    ],
    orderBy: ["id"],
  }),
  dataset({
    name: "contact",
    table: "contact",
    columns: [
      "id",
      "company_id",
      "name",
      "role",
      "email",
      "phone",
      "public_profile_url",
      "confidence",
      "user_confirmed",
      "notes",
      "archived_at",
      "created_at",
      "updated_at",
      "row_version",
    ],
    booleanColumns: ["user_confirmed"],
    orderBy: ["id"],
  }),
  dataset({
    name: "job",
    table: "job",
    columns: [
      "id",
      "company_id",
      "title",
      "normalized_title",
      "description_text",
      "employment_type",
      "workplace_type",
      "seniority",
      "location_id",
      "remote_region_json",
      "date_posted",
      "valid_through",
      "current_status_id",
      "next_action_at",
      "archived_at",
      "created_at",
      "updated_at",
      "row_version",
    ],
    jsonColumns: ["remote_region_json"],
    orderBy: ["id"],
  }),
  dataset({
    name: "job_source",
    table: "job_source",
    columns: [
      "id",
      "job_id",
      "connector_id",
      "external_id",
      "canonical_url",
      "apply_url",
      "first_seen_at",
      "last_seen_at",
      "content_hash",
      "is_primary",
      "created_at",
      "updated_at",
      "row_version",
    ],
    booleanColumns: ["is_primary"],
    orderBy: ["job_id", "id"],
  }),
  dataset({
    name: "source_snapshot",
    table: "source_snapshot",
    columns: [
      "id",
      "job_source_id",
      "captured_at",
      "extractor_id",
      "extractor_version",
      "raw_text",
      "sanitized_html",
      "structured_json",
      "content_hash",
      "retention_class",
      "created_at",
      "row_version",
    ],
    jsonColumns: ["structured_json"],
    orderBy: ["job_source_id", "captured_at", "id"],
  }),
  dataset({
    name: "provenance",
    table: "provenance",
    columns: [
      "id",
      "source_snapshot_id",
      "extraction_method",
      "source_pointer",
      "source_excerpt",
      "confidence",
      "captured_at",
      "license_note",
      "created_at",
      "row_version",
    ],
    orderBy: ["source_snapshot_id", "captured_at", "id"],
  }),
  dataset({
    name: "company_alias",
    table: "company_alias",
    columns: ["id", "company_id", "alias", "source_provenance_id", "created_at", "row_version"],
    orderBy: ["company_id", "alias", "id"],
  }),
  dataset({
    name: "contact_point_provenance",
    table: "contact_point_provenance",
    columns: [
      "id",
      "contact_id",
      "field_name",
      "value_hash",
      "provenance_id",
      "created_at",
      "row_version",
    ],
    orderBy: ["contact_id", "field_name", "id"],
  }),
  dataset({
    name: "field_value",
    table: "field_value",
    columns: [
      "id",
      "entity_type",
      "entity_id",
      "field_name",
      "normalized_json",
      "raw_json",
      "provenance_id",
      "is_user_confirmed",
      "user_confirmation_id",
      "confirmed_at",
      "confirmed_value_hash",
      "superseded_by_id",
      "created_at",
      "updated_at",
      "row_version",
    ],
    booleanColumns: ["is_user_confirmed"],
    jsonColumns: ["normalized_json", "raw_json"],
    orderBy: ["entity_type", "entity_id", "field_name", "created_at", "id"],
  }),
  dataset({
    name: "status_definition",
    table: "status_definition",
    columns: [
      "id",
      "name",
      "category",
      "color",
      "is_system",
      "sort_order",
      "terminal",
      "archived_at",
      "created_at",
      "updated_at",
      "row_version",
    ],
    booleanColumns: ["is_system", "terminal"],
    orderBy: ["sort_order", "id"],
  }),
  dataset({
    name: "application",
    table: "application",
    columns: [
      "id",
      "job_id",
      "applied_at",
      "channel",
      "current_status_id",
      "selected_resume_version_id",
      "selected_cover_letter_version_id",
      "notes",
      "archived_at",
      "created_at",
      "updated_at",
      "row_version",
    ],
    orderBy: ["job_id", "created_at", "id"],
  }),
  dataset({
    name: "status_event",
    table: "status_event",
    columns: [
      "id",
      "job_id",
      "application_id",
      "from_status_id",
      "to_status_id",
      "occurred_at",
      "note",
      "created_at",
      "row_version",
    ],
    orderBy: ["job_id", "occurred_at", "id"],
  }),
  dataset({
    name: "interaction",
    table: "interaction",
    columns: [
      "id",
      "job_id",
      "contact_id",
      "type",
      "occurred_at",
      "direction",
      "summary",
      "next_action_at",
      "created_at",
      "updated_at",
      "row_version",
    ],
    orderBy: ["job_id", "occurred_at", "id"],
  }),
  dataset({
    name: "next_action",
    table: "next_action",
    columns: [
      "id",
      "job_id",
      "application_id",
      "interaction_id",
      "title",
      "due_at",
      "timezone",
      "state",
      "completed_at",
      "created_at",
      "updated_at",
      "row_version",
    ],
    orderBy: ["job_id", "created_at", "id"],
  }),
  dataset({
    name: "interview",
    table: "interview",
    columns: [
      "id",
      "application_id",
      "stage_name",
      "starts_at",
      "timezone",
      "duration_minutes",
      "location_or_url",
      "contact_ids_json",
      "preparation_notes",
      "outcome",
      "created_at",
      "updated_at",
      "row_version",
    ],
    jsonColumns: ["contact_ids_json"],
    orderBy: ["application_id", "starts_at", "id"],
  }),
  dataset({
    name: "reminder",
    table: "reminder",
    columns: [
      "id",
      "job_id",
      "next_action_id",
      "interview_id",
      "remind_at",
      "timezone",
      "state",
      "note",
      "fired_at",
      "created_at",
      "updated_at",
      "row_version",
    ],
    orderBy: ["job_id", "remind_at", "id"],
  }),
  dataset({
    name: "tag",
    table: "tag",
    columns: ["id", "name", "color", "archived_at", "created_at", "updated_at", "row_version"],
    orderBy: ["name", "id"],
  }),
  dataset({
    name: "job_tag",
    table: "job_tag",
    columns: ["job_id", "tag_id", "created_at", "row_version"],
    orderBy: ["job_id", "tag_id"],
  }),
  dataset({
    name: "saved_view",
    table: "saved_view",
    columns: [
      "id",
      "scope",
      "name",
      "filter_ast_version",
      "filter_ast_json",
      "ui_settings_json",
      "is_system",
      "archived_at",
      "created_at",
      "updated_at",
      "row_version",
    ],
    booleanColumns: ["is_system"],
    jsonColumns: ["filter_ast_json", "ui_settings_json"],
    orderBy: ["scope", "name", "id"],
  }),
  dataset({
    name: "document",
    table: "document",
    columns: [
      "id",
      "kind",
      "title",
      "source",
      "archived_at",
      "created_at",
      "updated_at",
      "row_version",
    ],
    orderBy: ["created_at", "id"],
  }),
  dataset({
    name: "document_version",
    table: "document_version",
    columns: [
      "id",
      "document_id",
      "version_number",
      "content_ir_version",
      "content_ir_json",
      "content_plain",
      "template_id",
      "created_by",
      "created_at",
      "parent_version_id",
      "content_hash",
      "label",
    ],
    jsonColumns: ["content_ir_json"],
    orderBy: ["document_id", "version_number", "id"],
  }),
  dataset({
    name: "document_job_link",
    table: "document_job_link",
    columns: ["document_id", "job_id", "purpose", "created_at"],
    orderBy: ["document_id", "job_id", "purpose"],
  }),
  dataset({
    name: "attachment_manifest",
    table: "attachment_manifest",
    columns: ["content_id", "media_type", "byte_length", "created_at"],
    orderBy: ["content_id"],
  }),
  dataset({
    name: "document_version_attachment",
    table: "document_version_attachment",
    columns: [
      "document_version_id",
      "content_id",
      "purpose",
      "logical_name",
      "sort_order",
      "created_at",
    ],
    orderBy: ["document_version_id", "content_id", "purpose"],
  }),
  dataset({
    name: "document_style_example",
    table: "document_style_example",
    columns: ["document_version_id", "created_at"],
    orderBy: ["document_version_id"],
  }),
]);

export const PORTABLE_DATA_EXPORT_EXCLUDED_TABLES = Object.freeze([
  "coredrill_schema_migration",
  "device",
  "diagnostic_event",
  "job_fts",
  "job_search_identity",
  "job_search_state",
  "mutation_undo_token",
]);

export interface PortableDataExportWriterInputV1 {
  readonly database: DatabasePort;
  readonly generatedAt: string;
  readonly vaultId: string;
}

export interface PortableDataExportBundleV1 {
  readonly specVersion: 1;
  readonly sourceSchemaVersion: typeof PORTABLE_DATA_EXPORT_SOURCE_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly vaultId: string;
  readonly datasetCount: number;
  readonly rowCount: number;
  readonly byteLength: number;
  readonly datasets: readonly PortableDataExportV1[];
  readonly dataFiles: readonly PortableArchiveDataFileSourceV1[];
}

const encoder = new TextEncoder();
const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const FORMULA_PREFIXES = new Set(["\t", "\n", "\r", " ", "=", "+", "-", "@"]);

const exportError = (code: PortableDataExportWriterErrorCode): PortableDataExportWriterError =>
  new PortableDataExportWriterError(code);

const comparePortableText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const normalizeJson = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => comparePortableText(left, right))
        .map(([key, item]) => [key, normalizeJson(item)]),
    );
  }
  return value;
};

const normalizeInteger = (value: number | bigint): number => {
  if (typeof value === "bigint") {
    const asNumber = Number(value);
    if (!Number.isSafeInteger(asNumber)) throw exportError("invalid_database_value");
    return asNumber;
  }
  if (!Number.isFinite(value)) throw exportError("invalid_database_value");
  return value;
};

const normalizeValue = (spec: DatasetSpec, column: string, value: SqlValue): JsonValue => {
  if (value === null) return null;
  if (value instanceof Uint8Array) throw exportError("invalid_database_value");
  if (
    typeof value === "string" &&
    encoder.encode(value).byteLength > PORTABLE_DATA_EXPORT_WRITER_LIMITS.maxCellBytes
  ) {
    throw exportError("payload_too_large");
  }

  const booleanColumn = spec.booleanColumns?.includes(column) ?? false;
  if (booleanColumn) {
    if ((value === 0 || value === 0n) && typeof value !== "string") return false;
    if ((value === 1 || value === 1n) && typeof value !== "string") return true;
    throw exportError("invalid_database_value");
  }

  if (spec.jsonColumns?.includes(column)) {
    if (typeof value !== "string") throw exportError("invalid_database_value");
    try {
      return normalizeJson(JSON.parse(value) as JsonValue);
    } catch {
      throw exportError("invalid_database_value");
    }
  }

  if (typeof value === "bigint" || typeof value === "number") return normalizeInteger(value);
  return value;
};

const normalizeRow = (
  spec: DatasetSpec,
  row: Readonly<Record<string, SqlValue>>,
): PortableDataRowV1 => {
  const actualColumns = Object.keys(row);
  if (
    actualColumns.length !== spec.columns.length ||
    spec.columns.some((column) => !Object.hasOwn(row, column))
  ) {
    throw exportError("schema_mismatch");
  }

  const normalized: Record<string, JsonValue> = {};
  for (const column of spec.columns)
    normalized[column] = normalizeValue(spec, column, row[column] ?? null);
  return Object.freeze(normalized);
};

const quoteIdentifier = (value: string): string => `"${value.replaceAll('"', '""')}"`;

const datasetStatement = (spec: DatasetSpec) =>
  sqlStatement(
    `SELECT ${spec.columns.map(quoteIdentifier).join(", ")} FROM ${quoteIdentifier(spec.table)} ORDER BY ${spec.orderBy.map(quoteIdentifier).join(", ")}`,
  );

const safeCsvString = (value: string): string => {
  const normalizedLineBreaks = value
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replaceAll("\n", "\r\n");
  return normalizedLineBreaks.length > 0 && FORMULA_PREFIXES.has(normalizedLineBreaks[0] ?? "")
    ? `'${normalizedLineBreaks}`
    : normalizedLineBreaks;
};

const quotedCsv = (value: string): string => `"${value.replaceAll('"', '""')}"`;

const csvCell = (value: JsonValue): string => {
  if (value === null) return "";
  if (typeof value === "string") return quotedCsv(safeCsvString(value));
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return quotedCsv(JSON.stringify(value));
};

const encodeCsv = (columns: readonly string[], rows: readonly PortableDataRowV1[]): Uint8Array => {
  const lines = [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => csvCell(row[column] ?? null)).join(",")),
  ];
  return encoder.encode(`${lines.join("\r\n")}\r\n`);
};

const checkedBytes = (bytes: Uint8Array): Uint8Array => {
  if (bytes.byteLength > PORTABLE_DATA_EXPORT_WRITER_LIMITS.maxEntryBytes) {
    throw exportError("payload_too_large");
  }
  return bytes;
};

const readSchemaVersion = async (
  database: DatabaseTransaction,
): Promise<typeof PORTABLE_DATA_EXPORT_SOURCE_SCHEMA_VERSION> => {
  const rows = await database.query(sqlStatement("PRAGMA user_version"));
  const value = rows[0]?.["user_version"];
  if (rows.length !== 1 || (typeof value !== "number" && typeof value !== "bigint")) {
    throw exportError("schema_mismatch");
  }
  const schemaVersion = normalizeInteger(value);
  if (schemaVersion !== PORTABLE_DATA_EXPORT_SOURCE_SCHEMA_VERSION) {
    throw exportError("schema_mismatch");
  }
  return PORTABLE_DATA_EXPORT_SOURCE_SCHEMA_VERSION;
};

const createDataset = async (
  database: DatabaseTransaction,
  spec: DatasetSpec,
  input: Pick<PortableDataExportWriterInputV1, "generatedAt" | "vaultId">,
): Promise<{
  readonly dataset: PortableDataExportV1;
  readonly files: readonly PortableArchiveDataFileSourceV1[];
}> => {
  const queried = await database.query(datasetStatement(spec));
  if (queried.length > PORTABLE_DATA_EXPORT_LIMITS.rowsPerDataset) {
    throw exportError("payload_too_large");
  }
  const rows = queried.map((row) => normalizeRow(spec, row));
  const csvPath = `data/${spec.name}.csv`;
  const candidate = {
    specVersion: 1,
    dataset: spec.name,
    generatedAt: input.generatedAt,
    vaultId: input.vaultId,
    sourceSchemaVersion: PORTABLE_DATA_EXPORT_SOURCE_SCHEMA_VERSION,
    columns: spec.columns,
    rowCount: rows.length,
    rows,
    csv: {
      path: csvPath,
      dialect: "rfc4180",
      charset: "utf-8",
      header: "present",
      formulaEscaping: "apostrophe-prefix",
      nullEncoding: "empty-unquoted",
    },
  } as const;
  const parsed = portableDataExportV1Schema.safeParse(candidate);
  if (!parsed.success) throw exportError("contract_failed");

  const jsonBytes = checkedBytes(encoder.encode(`${JSON.stringify(parsed.data, undefined, 2)}\n`));
  const csvBytes = checkedBytes(encodeCsv(parsed.data.columns, parsed.data.rows));
  return Object.freeze({
    dataset: Object.freeze(parsed.data),
    files: Object.freeze([
      Object.freeze({
        path: `data/${spec.name}.json`,
        mediaType: "application/json",
        format: "json" as const,
        logicalName: spec.name,
        bytes: jsonBytes,
      }),
      Object.freeze({
        path: csvPath,
        mediaType: "text/csv",
        format: "csv" as const,
        logicalName: spec.name,
        bytes: csvBytes,
      }),
    ]),
  });
};

export const createPortableDataExportV1 = async (
  input: PortableDataExportWriterInputV1,
): Promise<PortableDataExportBundleV1> => {
  if (
    !UUID_V7_PATTERN.test(input.vaultId) ||
    !INSTANT_PATTERN.test(input.generatedAt) ||
    !Number.isFinite(Date.parse(input.generatedAt))
  ) {
    throw exportError("invalid_input");
  }

  try {
    return await input.database.transaction(async (database) => {
      const sourceSchemaVersion = await readSchemaVersion(database);
      const results = [];
      for (const spec of PORTABLE_DATA_EXPORT_DATASETS) {
        results.push(await createDataset(database, spec, input));
      }

      const vaultResult = results[0];
      if (vaultResult === undefined) throw exportError("contract_failed");
      const vault = vaultResult.dataset.rows;
      const vaultRow = vault[0];
      if (
        vault.length !== 1 ||
        vaultRow?.["id"] !== input.vaultId ||
        typeof vaultRow["schema_version"] !== "number" ||
        !Number.isInteger(vaultRow["schema_version"]) ||
        vaultRow["schema_version"] < 1
      ) {
        throw exportError("schema_mismatch");
      }

      const datasets = Object.freeze(results.map((result) => result.dataset));
      const dataFiles = Object.freeze(results.flatMap((result) => result.files));
      const byteLength = dataFiles.reduce((total, file) => total + file.bytes.byteLength, 0);
      if (byteLength > PORTABLE_DATA_EXPORT_WRITER_LIMITS.maxPayloadBytes) {
        throw exportError("payload_too_large");
      }

      return Object.freeze({
        specVersion: 1 as const,
        sourceSchemaVersion,
        generatedAt: input.generatedAt,
        vaultId: input.vaultId,
        datasetCount: datasets.length,
        rowCount: datasets.reduce((total, item) => total + item.rowCount, 0),
        byteLength,
        datasets,
        dataFiles,
      });
    });
  } catch (error) {
    if (error instanceof PortableDataExportWriterError) throw error;
    throw exportError("query_failed");
  }
};
