CREATE TABLE tag (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id)),
  name TEXT NOT NULL COLLATE NOCASE CHECK (length(trim(name)) BETWEEN 1 AND 80),
  color TEXT CHECK (color IS NULL OR length(color) BETWEEN 1 AND 64),
  archived_at TEXT CHECK (archived_at IS NULL OR length(archived_at) = 24),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  updated_at TEXT NOT NULL CHECK (length(updated_at) = 24),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
  UNIQUE (name)
) STRICT;
