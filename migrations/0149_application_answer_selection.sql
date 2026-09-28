CREATE TABLE application_answer_selection (
  application_id TEXT NOT NULL
    REFERENCES application(id) ON DELETE CASCADE,
  document_version_id TEXT NOT NULL
    REFERENCES document_version(id) ON DELETE RESTRICT,
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  PRIMARY KEY (application_id, document_version_id),
  UNIQUE (application_id, sort_order)
) STRICT;
