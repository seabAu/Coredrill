CREATE TABLE accomplishment (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id)),
  parent_type TEXT NOT NULL
    CHECK (parent_type IN ('experience', 'education', 'project', 'volunteer_experience', 'standalone')),
  parent_id TEXT CHECK (parent_id IS NULL OR (length(parent_id) = 36 AND parent_id = lower(parent_id))),
  action TEXT NOT NULL CHECK (length(trim(action)) BETWEEN 1 AND 10000),
  result TEXT NOT NULL CHECK (length(trim(result)) BETWEEN 1 AND 10000),
  metrics_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(metrics_json) AND json_type(metrics_json) = 'object' AND length(metrics_json) <= 20000),
  source_document_id TEXT REFERENCES document(id) ON DELETE SET NULL,
  verification_state TEXT NOT NULL DEFAULT 'imported'
    CHECK (verification_state IN ('imported', 'user_confirmed', 'source_backed', 'stale', 'disputed')),
  archived_at TEXT CHECK (archived_at IS NULL OR length(archived_at) = 24),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  updated_at TEXT NOT NULL CHECK (length(updated_at) = 24),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
  CHECK ((parent_type = 'standalone' AND parent_id IS NULL) OR (parent_type <> 'standalone' AND parent_id IS NOT NULL))
) STRICT;
