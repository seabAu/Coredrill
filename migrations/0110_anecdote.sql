CREATE TABLE anecdote (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id)),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 512),
  situation TEXT NOT NULL CHECK (length(trim(situation)) BETWEEN 1 AND 20000),
  action TEXT NOT NULL CHECK (length(trim(action)) BETWEEN 1 AND 20000),
  result TEXT NOT NULL CHECK (length(trim(result)) BETWEEN 1 AND 20000),
  tags_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(tags_json) AND json_type(tags_json) = 'array' AND length(tags_json) <= 20000),
  source_document_id TEXT REFERENCES document(id) ON DELETE SET NULL,
  verification_state TEXT NOT NULL DEFAULT 'imported'
    CHECK (verification_state IN ('imported', 'user_confirmed', 'source_backed', 'stale', 'disputed')),
  archived_at TEXT CHECK (archived_at IS NULL OR length(archived_at) = 24),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  updated_at TEXT NOT NULL CHECK (length(updated_at) = 24),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0)
) STRICT;
