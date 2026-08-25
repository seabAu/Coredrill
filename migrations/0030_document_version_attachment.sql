CREATE TABLE document_version_attachment (
  document_version_id TEXT NOT NULL REFERENCES document_version(id) ON DELETE CASCADE,
  content_id TEXT NOT NULL REFERENCES attachment_manifest(content_id) ON DELETE RESTRICT,
  purpose TEXT NOT NULL CHECK (length(purpose) BETWEEN 1 AND 128),
  logical_name TEXT NOT NULL CHECK (length(trim(logical_name)) BETWEEN 1 AND 512),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  PRIMARY KEY (document_version_id, content_id, purpose)
) STRICT;
