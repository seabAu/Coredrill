CREATE TABLE job_search_state (
  singleton INTEGER PRIMARY KEY NOT NULL CHECK (singleton = 1),
  content_revision INTEGER NOT NULL CHECK (content_revision > 0),
  fts_schema_version INTEGER CHECK (fts_schema_version IS NULL OR fts_schema_version > 0),
  fts_revision INTEGER CHECK (
    fts_revision IS NULL OR (fts_revision > 0 AND fts_revision <= content_revision)
  )
) STRICT;
