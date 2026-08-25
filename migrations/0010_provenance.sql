CREATE TABLE provenance (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id)),
  source_snapshot_id TEXT NOT NULL REFERENCES source_snapshot(id) ON DELETE RESTRICT,
  extraction_method TEXT NOT NULL CHECK (
    extraction_method IN ('api', 'jsonld', 'selector', 'readability', 'heuristic', 'llm', 'user')
  ),
  source_pointer TEXT NOT NULL CHECK (length(trim(source_pointer)) BETWEEN 1 AND 2048),
  source_excerpt TEXT CHECK (source_excerpt IS NULL OR length(source_excerpt) <= 4096),
  confidence REAL NOT NULL CHECK (confidence BETWEEN 0.0 AND 1.0),
  captured_at TEXT NOT NULL CHECK (length(captured_at) = 24),
  license_note TEXT CHECK (license_note IS NULL OR length(license_note) <= 1024),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0)
) STRICT;
