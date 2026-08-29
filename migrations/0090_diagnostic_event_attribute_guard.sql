CREATE TRIGGER diagnostic_event_validate_attributes
BEFORE INSERT ON diagnostic_event
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'diagnostic attribute count invalid')
  WHERE (SELECT count(*) FROM json_each(NEW.attributes_json)) > 32;

  SELECT RAISE(ABORT, 'diagnostic attribute key or value invalid')
  WHERE EXISTS (
    SELECT 1
    FROM json_each(NEW.attributes_json)
    WHERE key NOT IN (
      'adapter', 'archive_format', 'attachment_count', 'attempt', 'available', 'browser',
      'cache_state', 'capability', 'checksum_state', 'concurrency', 'connection_state',
      'database_state', 'delivery_state', 'duration_bucket', 'encryption_mode',
      'event_count', 'export_format', 'feature', 'format', 'health', 'import_format',
      'latency_bucket', 'lock_state', 'migration_version', 'mode', 'network_state',
      'operation_kind', 'permission_state', 'persistence', 'platform', 'provider',
      'queue_depth', 'read_only', 'record_count', 'result_count', 'retry_count',
      'retryable', 'schema_version', 'state', 'status', 'storage', 'usage_bucket',
      'version', 'worker', 'worker_state'
    ) OR type NOT IN ('true', 'false', 'integer', 'real', 'text') OR
    (
      type IN ('integer', 'real') AND
      (value < -9007199254740991 OR value > 9007199254740991)
    ) OR
    (
      type = 'text' AND value NOT IN (
        'android', 'available', 'best-effort', 'browser', 'browser-worker', 'byok',
        'chromium', 'csv', 'degraded', 'desktop', 'disabled', 'docx', 'durable',
        'enabled', 'failed', 'failure', 'firefox', 'hit', 'hosted', 'info', 'ios',
        'json', 'linux', 'local', 'locked', 'macos', 'markdown', 'memory', 'miss',
        'none', 'opfs-sahpool', 'pdf', 'plain-text', 'read-only', 'read-write',
        'ready', 'safari', 'sqlite-wasm', 'success', 'tauri-sqlite', 'unavailable',
        'unknown', 'unlocked', 'warning', 'windows', 'worker'
      )
    )
  );
END;
