CREATE TABLE document_lineage (
  document_id TEXT PRIMARY KEY NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('base', 'template', 'job_derivative')),
  base_document_id TEXT REFERENCES document(id) ON DELETE RESTRICT,
  template_document_id TEXT REFERENCES document(id) ON DELETE RESTRICT,
  job_id TEXT REFERENCES job(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  CHECK (document_id IS NOT base_document_id),
  CHECK (document_id IS NOT template_document_id),
  CHECK (
    (role IN ('base', 'template') AND base_document_id IS NULL
      AND template_document_id IS NULL AND job_id IS NULL) OR
    (role = 'job_derivative' AND base_document_id IS NOT NULL AND job_id IS NOT NULL)
  )
) STRICT;

