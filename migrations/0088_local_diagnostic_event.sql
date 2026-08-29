CREATE TABLE diagnostic_event (
  event_id TEXT PRIMARY KEY NOT NULL CHECK (length(event_id) = 36 AND event_id = lower(event_id)),
  spec_version INTEGER NOT NULL CHECK (spec_version = 1),
  occurred_at TEXT NOT NULL CHECK (length(occurred_at) = 24),
  app_version TEXT NOT NULL CHECK (length(app_version) BETWEEN 1 AND 64),
  delivery TEXT NOT NULL CHECK (delivery = 'local'),
  category TEXT NOT NULL CHECK (
    category IN (
      'application', 'storage', 'migration', 'capture', 'extraction', 'ai',
      'document', 'labor-data', 'sync'
    )
  ),
  name TEXT NOT NULL CHECK (
    name IN (
      'application_operation', 'archive_export', 'archive_restore', 'capture_ingest',
      'database_open', 'document_export', 'document_import', 'extraction_run',
      'generation_run', 'labor_data_request', 'migration_apply', 'operation_complete',
      'storage_persistence', 'storage_quota', 'sync_availability'
    )
  ),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'degraded', 'failure')),
  operation_id TEXT CHECK (
    operation_id IS NULL OR (length(operation_id) = 36 AND operation_id = lower(operation_id))
  ),
  code TEXT CHECK (
    code IS NULL OR code IN (
      'cancelled', 'checksum_mismatch', 'conflict', 'internal', 'invalid_input', 'locked',
      'migration_failed', 'not_found', 'partial_result', 'permission_denied', 'quota_low',
      'rate_limited', 'ready', 'storage_unavailable', 'unavailable', 'unsupported',
      'validation', 'version_mismatch'
    )
  ),
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms BETWEEN 0 AND 86400000),
  attributes_json TEXT NOT NULL CHECK (
    json_valid(attributes_json) AND
    json_type(attributes_json) = 'object' AND
    length(attributes_json) <= 8192
  ),
  redacted_attribute_count INTEGER NOT NULL CHECK (
    redacted_attribute_count BETWEEN 0 AND 9007199254740991
  )
) STRICT;
