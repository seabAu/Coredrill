CREATE TABLE status_event (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id)),
  job_id TEXT NOT NULL REFERENCES job(id) ON DELETE CASCADE,
  application_id TEXT REFERENCES application(id) ON DELETE CASCADE,
  from_status_id TEXT REFERENCES status_definition(id) ON DELETE RESTRICT,
  to_status_id TEXT NOT NULL REFERENCES status_definition(id) ON DELETE RESTRICT,
  occurred_at TEXT NOT NULL CHECK (length(occurred_at) = 24),
  note TEXT CHECK (note IS NULL OR length(note) <= 200000),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
  CHECK (from_status_id IS NULL OR from_status_id <> to_status_id)
) STRICT;
