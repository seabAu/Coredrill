CREATE TABLE document_editor_draft (
  document_id TEXT PRIMARY KEY NOT NULL
    REFERENCES document(id) ON DELETE CASCADE,
  base_version_id TEXT NOT NULL
    REFERENCES document_version(id) ON DELETE RESTRICT,
  content_ir_version INTEGER NOT NULL CHECK (content_ir_version = 1),
  content_ir_json TEXT NOT NULL
    CHECK (json_valid(content_ir_json) AND length(content_ir_json) BETWEEN 1 AND 4000000),
  content_plain TEXT NOT NULL CHECK (length(content_plain) <= 2000000),
  updated_at TEXT NOT NULL CHECK (length(updated_at) = 24),
  row_version INTEGER NOT NULL CHECK (row_version > 0)
) STRICT;
