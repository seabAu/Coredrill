CREATE TABLE document_job_link (
  document_id TEXT NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES job(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (length(purpose) BETWEEN 1 AND 128),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  PRIMARY KEY (document_id, job_id, purpose)
) STRICT;
