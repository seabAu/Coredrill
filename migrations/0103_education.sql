CREATE TABLE education (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id)),
  institution TEXT NOT NULL CHECK (length(trim(institution)) BETWEEN 1 AND 512),
  credential TEXT NOT NULL CHECK (length(trim(credential)) BETWEEN 1 AND 512),
  field TEXT CHECK (field IS NULL OR length(field) <= 512),
  start_date TEXT CHECK (start_date IS NULL OR length(start_date) = 10),
  end_date TEXT CHECK (end_date IS NULL OR length(end_date) = 10),
  details TEXT NOT NULL DEFAULT '' CHECK (length(details) <= 200000),
  source_document_id TEXT REFERENCES document(id) ON DELETE SET NULL,
  verification_state TEXT NOT NULL DEFAULT 'imported'
    CHECK (verification_state IN ('imported', 'user_confirmed', 'source_backed', 'stale', 'disputed')),
  archived_at TEXT CHECK (archived_at IS NULL OR length(archived_at) = 24),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  updated_at TEXT NOT NULL CHECK (length(updated_at) = 24),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
  CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date)
) STRICT;
