import * as z from "zod";

import { instantSchema, semanticVersionSchema, uuidV7Schema } from "./primitives.js";

export const DIAGNOSTIC_EVENT_SPEC_VERSION = 1 as const;
export const DIAGNOSTIC_EVENT_V1_SCHEMA_ID =
  "https://schemas.coredrill.local/diagnostic-event/v1.json" as const;

export const DIAGNOSTIC_CATEGORIES = [
  "application",
  "storage",
  "migration",
  "capture",
  "extraction",
  "ai",
  "document",
  "labor-data",
  "sync",
] as const;
export const DIAGNOSTIC_SEVERITIES = ["info", "warning", "error"] as const;
export const DIAGNOSTIC_OUTCOMES = ["success", "degraded", "failure"] as const;
export const DIAGNOSTIC_EVENT_NAMES = [
  "application_operation",
  "archive_export",
  "archive_restore",
  "capture_ingest",
  "database_open",
  "document_export",
  "document_import",
  "extraction_run",
  "generation_run",
  "labor_data_request",
  "migration_apply",
  "operation_complete",
  "storage_persistence",
  "storage_quota",
  "sync_availability",
] as const;
export const DIAGNOSTIC_CODES = [
  "cancelled",
  "checksum_mismatch",
  "conflict",
  "internal",
  "invalid_input",
  "locked",
  "migration_failed",
  "not_found",
  "partial_result",
  "permission_denied",
  "quota_low",
  "rate_limited",
  "ready",
  "storage_unavailable",
  "unavailable",
  "unsupported",
  "validation",
  "version_mismatch",
] as const;
export const DIAGNOSTIC_ATTRIBUTE_KEYS = [
  "adapter",
  "archive_format",
  "attachment_count",
  "attempt",
  "available",
  "browser",
  "cache_state",
  "capability",
  "checksum_state",
  "concurrency",
  "connection_state",
  "database_state",
  "delivery_state",
  "duration_bucket",
  "encryption_mode",
  "event_count",
  "export_format",
  "feature",
  "format",
  "health",
  "import_format",
  "latency_bucket",
  "lock_state",
  "migration_version",
  "mode",
  "network_state",
  "operation_kind",
  "permission_state",
  "persistence",
  "platform",
  "provider",
  "queue_depth",
  "read_only",
  "record_count",
  "result_count",
  "retry_count",
  "retryable",
  "schema_version",
  "state",
  "status",
  "storage",
  "usage_bucket",
  "version",
  "worker",
  "worker_state",
] as const;
export const DIAGNOSTIC_ATTRIBUTE_TOKENS = [
  "android",
  "available",
  "best-effort",
  "browser",
  "browser-worker",
  "byok",
  "chromium",
  "csv",
  "degraded",
  "desktop",
  "disabled",
  "docx",
  "durable",
  "enabled",
  "failed",
  "failure",
  "firefox",
  "hit",
  "hosted",
  "info",
  "ios",
  "json",
  "linux",
  "local",
  "locked",
  "macos",
  "markdown",
  "memory",
  "miss",
  "none",
  "opfs-sahpool",
  "pdf",
  "plain-text",
  "read-only",
  "read-write",
  "ready",
  "safari",
  "sqlite-wasm",
  "success",
  "tauri-sqlite",
  "unavailable",
  "unknown",
  "unlocked",
  "warning",
  "windows",
  "worker",
] as const;

export const FORBIDDEN_DIAGNOSTIC_FIELD_PARTS = Object.freeze([
  "address",
  "answer",
  "authorization",
  "body",
  "company",
  "contact",
  "content",
  "cookie",
  "credential",
  "description",
  "document",
  "email",
  "html",
  "job",
  "key",
  "message",
  "name",
  "note",
  "phone",
  "prompt",
  "raw",
  "response",
  "resume",
  "salary",
  "secret",
  "text",
  "title",
  "token",
  "url",
  "uri",
]);

export const diagnosticAttributeKeySchema = z.enum(DIAGNOSTIC_ATTRIBUTE_KEYS);
const diagnosticTokenSchema = z.enum(DIAGNOSTIC_ATTRIBUTE_TOKENS);
export const diagnosticAttributeValueSchema = z.union([
  z.boolean(),
  z.number().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  diagnosticTokenSchema,
]);

const diagnosticAttributesSchema = z
  .partialRecord(diagnosticAttributeKeySchema, diagnosticAttributeValueSchema)
  .superRefine((attributes, context) => {
    if (Object.keys(attributes).length > 32) {
      context.addIssue({
        code: "custom",
        message: "Diagnostic events support at most 32 content-free attributes.",
      });
    }
  });

export const diagnosticEventV1Schema = z
  .strictObject({
    specVersion: z.literal(DIAGNOSTIC_EVENT_SPEC_VERSION),
    eventId: uuidV7Schema,
    occurredAt: instantSchema,
    appVersion: semanticVersionSchema,
    delivery: z.literal("local"),
    category: z.enum(DIAGNOSTIC_CATEGORIES),
    name: z.enum(DIAGNOSTIC_EVENT_NAMES),
    severity: z.enum(DIAGNOSTIC_SEVERITIES),
    outcome: z.enum(DIAGNOSTIC_OUTCOMES),
    operationId: uuidV7Schema.optional(),
    code: z.enum(DIAGNOSTIC_CODES).optional(),
    durationMs: z.number().int().nonnegative().max(86_400_000).optional(),
    attributes: diagnosticAttributesSchema,
    redactedAttributeCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .meta({
    title: "Coredrill DiagnosticEventV1",
    description:
      "Content-free local operational diagnostic event. Product telemetry requires a separate opt-in reviewed boundary.",
  });

const generatedDiagnosticEventV1JsonSchema = z.toJSONSchema(diagnosticEventV1Schema, {
  target: "draft-2020-12",
});
const { $schema: diagnosticDialect, ...diagnosticSchemaBody } =
  generatedDiagnosticEventV1JsonSchema;

export const diagnosticEventV1JsonSchema = Object.freeze({
  $schema: diagnosticDialect,
  $id: DIAGNOSTIC_EVENT_V1_SCHEMA_ID,
  ...diagnosticSchemaBody,
});

export type DiagnosticCategory = (typeof DIAGNOSTIC_CATEGORIES)[number];
export type DiagnosticSeverity = (typeof DIAGNOSTIC_SEVERITIES)[number];
export type DiagnosticOutcome = (typeof DIAGNOSTIC_OUTCOMES)[number];
export type DiagnosticAttributeValue = z.infer<typeof diagnosticAttributeValueSchema>;
export type DiagnosticEventV1 = z.infer<typeof diagnosticEventV1Schema>;
