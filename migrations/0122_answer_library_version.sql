CREATE TABLE answer_library_version (
  document_version_id TEXT PRIMARY KEY NOT NULL REFERENCES document_version(id) ON DELETE CASCADE,
  question TEXT NOT NULL CHECK (length(trim(question)) BETWEEN 1 AND 512),
  sensitivity TEXT NOT NULL CHECK (sensitivity IN ('standard', 'sensitive', 'restricted'))
) STRICT;
