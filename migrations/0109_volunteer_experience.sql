CREATE TABLE volunteer_experience (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id)),
  organization TEXT NOT NULL CHECK (length(trim(organization)) BETWEEN 1 AND 512),
  role TEXT NOT NULL CHECK (length(trim(role)) BETWEEN 1 AND 512),
  start_date TEXT CHECK (start_date IS NULL OR length(start_date) = 10),
  end_date TEXT CHECK (end_date IS NULL OR length(end_date) = 10),
  is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1)),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 200000),
  source_document_id TEXT REFERENCES document(id) ON DELETE SET NULL,
  verification_state TEXT NOT NULL DEFAULT 'imported'
    CHECK (verification_state IN ('imported', 'user_confirmed', 'source_backed', 'stale', 'disputed')),
  archived_at TEXT CHECK (archived_at IS NULL OR length(archived_at) = 24),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  updated_at TEXT NOT NULL CHECK (length(updated_at) = 24),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
  CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date),
  CHECK (is_current = 0 OR end_date IS NULL)
) STRICT;
