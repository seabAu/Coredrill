CREATE TABLE job_source (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id)),
  job_id TEXT NOT NULL REFERENCES job(id) ON DELETE CASCADE,
  connector_id TEXT CHECK (connector_id IS NULL OR length(connector_id) <= 128),
  external_id TEXT CHECK (external_id IS NULL OR length(external_id) <= 1024),
  canonical_url TEXT CHECK (canonical_url IS NULL OR length(canonical_url) <= 8192),
  apply_url TEXT CHECK (apply_url IS NULL OR length(apply_url) <= 8192),
  first_seen_at TEXT NOT NULL CHECK (length(first_seen_at) = 24),
  last_seen_at TEXT NOT NULL CHECK (length(last_seen_at) = 24),
  content_hash TEXT CHECK (
    content_hash IS NULL OR
    (length(content_hash) = 64 AND content_hash = lower(content_hash))
  ),
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  updated_at TEXT NOT NULL CHECK (length(updated_at) = 24),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
  UNIQUE (connector_id, external_id),
  CHECK (first_seen_at <= last_seen_at)
) STRICT;
