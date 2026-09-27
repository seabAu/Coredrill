CREATE TABLE publication (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id)),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 1024),
  publisher TEXT CHECK (publisher IS NULL OR length(publisher) <= 512),
  published_date TEXT CHECK (published_date IS NULL OR length(published_date) = 10),
  url TEXT CHECK (url IS NULL OR length(url) BETWEEN 1 AND 4096),
  summary TEXT NOT NULL DEFAULT '' CHECK (length(summary) <= 200000),
  source_document_id TEXT REFERENCES document(id) ON DELETE SET NULL,
  verification_state TEXT NOT NULL DEFAULT 'imported'
    CHECK (verification_state IN ('imported', 'user_confirmed', 'source_backed', 'stale', 'disputed')),
  archived_at TEXT CHECK (archived_at IS NULL OR length(archived_at) = 24),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  updated_at TEXT NOT NULL CHECK (length(updated_at) = 24),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0)
) STRICT;
