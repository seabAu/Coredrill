CREATE TABLE contact_point_provenance (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id)),
  contact_id TEXT NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL CHECK (length(field_name) BETWEEN 1 AND 128),
  value_hash TEXT NOT NULL CHECK (length(value_hash) = 64 AND value_hash = lower(value_hash)),
  provenance_id TEXT NOT NULL REFERENCES provenance(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
  UNIQUE (contact_id, field_name, value_hash, provenance_id)
) STRICT;
