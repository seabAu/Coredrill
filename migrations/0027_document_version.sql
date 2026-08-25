CREATE TABLE document_version (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id)),
  document_id TEXT NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  content_ir_version INTEGER NOT NULL CHECK (content_ir_version = 1),
  content_ir_json TEXT NOT NULL CHECK (
    json_valid(content_ir_json) AND length(content_ir_json) <= 8388608
  ),
  content_plain TEXT NOT NULL CHECK (length(content_plain) <= 2000000),
  template_id TEXT CHECK (
    template_id IS NULL OR
    (length(template_id) = 36 AND template_id = lower(template_id))
  ),
  created_by TEXT NOT NULL CHECK (length(created_by) BETWEEN 1 AND 128),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  parent_version_id TEXT REFERENCES document_version(id) ON DELETE RESTRICT,
  content_hash TEXT NOT NULL CHECK (
    length(content_hash) = 64 AND
    content_hash = lower(content_hash) AND
    content_hash NOT GLOB '*[^0-9a-f]*'
  ),
  label TEXT CHECK (label IS NULL OR length(trim(label)) BETWEEN 1 AND 256),
  UNIQUE (document_id, version_number),
  CHECK (
    (version_number = 1 AND parent_version_id IS NULL) OR
    (version_number > 1 AND parent_version_id IS NOT NULL)
  )
) STRICT;
