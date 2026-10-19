CREATE TABLE document_derivation_origin (
  document_id TEXT PRIMARY KEY NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  first_version_id TEXT NOT NULL UNIQUE REFERENCES document_version(id) ON DELETE CASCADE,
  source_version_id TEXT NOT NULL REFERENCES document_version(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  CHECK (first_version_id <> source_version_id)
) STRICT;
