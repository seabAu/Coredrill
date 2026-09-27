CREATE TABLE job_requirement (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id)),
  job_id TEXT NOT NULL REFERENCES job(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (
    category IN ('required', 'desired', 'responsibility', 'context', 'constraint')
  ),
  source_category TEXT NOT NULL CHECK (
    source_category IN ('required', 'desired', 'responsibility', 'context', 'constraint')
  ),
  normalized_text TEXT NOT NULL CHECK (length(trim(normalized_text)) BETWEEN 1 AND 4096),
  raw_text TEXT NOT NULL CHECK (length(trim(raw_text)) BETWEEN 1 AND 16384),
  provenance_id TEXT NOT NULL REFERENCES provenance(id) ON DELETE RESTRICT,
  confidence REAL NOT NULL CHECK (confidence BETWEEN 0.0 AND 1.0),
  user_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (user_confirmed IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  updated_at TEXT NOT NULL CHECK (length(updated_at) = 24),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0)
) STRICT;
