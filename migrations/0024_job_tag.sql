CREATE TABLE job_tag (
  job_id TEXT NOT NULL REFERENCES job(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
  PRIMARY KEY (job_id, tag_id)
) STRICT;
