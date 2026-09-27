CREATE TABLE skill (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id)),
  canonical_name TEXT NOT NULL COLLATE NOCASE UNIQUE
    CHECK (length(trim(canonical_name)) BETWEEN 1 AND 512),
  category TEXT CHECK (category IS NULL OR length(category) <= 256),
  aliases_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(aliases_json) AND json_type(aliases_json) = 'array' AND length(aliases_json) <= 20000),
  archived_at TEXT CHECK (archived_at IS NULL OR length(archived_at) = 24),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  updated_at TEXT NOT NULL CHECK (length(updated_at) = 24),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0)
) STRICT;
