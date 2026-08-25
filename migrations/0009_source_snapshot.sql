CREATE TABLE source_snapshot (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id)),
  job_source_id TEXT NOT NULL REFERENCES job_source(id) ON DELETE CASCADE,
  captured_at TEXT NOT NULL CHECK (length(captured_at) = 24),
  extractor_id TEXT NOT NULL CHECK (length(extractor_id) BETWEEN 1 AND 128),
  extractor_version TEXT NOT NULL CHECK (length(extractor_version) BETWEEN 1 AND 64),
  raw_text TEXT CHECK (raw_text IS NULL OR length(raw_text) <= 2000000),
  sanitized_html TEXT CHECK (sanitized_html IS NULL OR length(sanitized_html) <= 2000000),
  structured_json TEXT CHECK (structured_json IS NULL OR json_valid(structured_json)),
  content_hash TEXT NOT NULL
    CHECK (length(content_hash) = 64 AND content_hash = lower(content_hash)),
  retention_class TEXT NOT NULL CHECK (length(retention_class) BETWEEN 1 AND 64),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
  UNIQUE (job_source_id, content_hash)
) STRICT;
