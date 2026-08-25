CREATE TABLE company_alias (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id)),
  company_id TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  alias TEXT NOT NULL CHECK (length(trim(alias)) BETWEEN 1 AND 512),
  source_provenance_id TEXT NOT NULL REFERENCES provenance(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
  UNIQUE (company_id, alias)
) STRICT;
