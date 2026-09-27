CREATE TABLE answer_library_entry (
  document_id TEXT PRIMARY KEY NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('manual', 'application')),
  source_job_id TEXT REFERENCES job(id) ON DELETE RESTRICT,
  source_context TEXT CHECK (
    source_context IS NULL OR length(trim(source_context)) BETWEEN 1 AND 2000
  ),
  last_used_at TEXT CHECK (last_used_at IS NULL OR length(last_used_at) = 24),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  CHECK (
    (source_kind = 'manual' AND source_job_id IS NULL) OR
    (source_kind = 'application' AND source_job_id IS NOT NULL)
  )
) STRICT;
