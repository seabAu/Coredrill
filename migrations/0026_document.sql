CREATE TABLE document (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id)),
  kind TEXT NOT NULL CHECK (
    kind IN ('resume', 'cover_letter', 'application_answer', 'follow_up', 'other')
  ),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 512),
  source TEXT NOT NULL CHECK (length(source) BETWEEN 1 AND 128),
  archived_at TEXT CHECK (archived_at IS NULL OR length(archived_at) = 24),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  updated_at TEXT NOT NULL CHECK (length(updated_at) = 24),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0)
) STRICT;
