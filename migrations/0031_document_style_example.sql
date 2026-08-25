CREATE TABLE document_style_example (
  document_version_id TEXT PRIMARY KEY NOT NULL
    REFERENCES document_version(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL CHECK (length(created_at) = 24)
) STRICT;
