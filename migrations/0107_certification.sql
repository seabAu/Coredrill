CREATE TABLE certification (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id)),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 512),
  issuer TEXT NOT NULL CHECK (length(trim(issuer)) BETWEEN 1 AND 512),
  issued_date TEXT CHECK (issued_date IS NULL OR length(issued_date) = 10),
  expires_date TEXT CHECK (expires_date IS NULL OR length(expires_date) = 10),
  credential_url TEXT CHECK (credential_url IS NULL OR length(credential_url) BETWEEN 1 AND 4096),
  source_document_id TEXT REFERENCES document(id) ON DELETE SET NULL,
  verification_state TEXT NOT NULL DEFAULT 'imported'
    CHECK (verification_state IN ('imported', 'user_confirmed', 'source_backed', 'stale', 'disputed')),
  archived_at TEXT CHECK (archived_at IS NULL OR length(archived_at) = 24),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  updated_at TEXT NOT NULL CHECK (length(updated_at) = 24),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
  CHECK (issued_date IS NULL OR expires_date IS NULL OR issued_date <= expires_date)
) STRICT;
