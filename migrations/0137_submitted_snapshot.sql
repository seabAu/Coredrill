CREATE TABLE submitted_snapshot (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id)),
  application_id TEXT NOT NULL UNIQUE REFERENCES application(id) ON DELETE CASCADE,
  submitted_at TEXT NOT NULL CHECK (length(submitted_at) = 24),
  channel TEXT CHECK (channel IS NULL OR length(channel) BETWEEN 1 AND 128),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24)
) STRICT;

