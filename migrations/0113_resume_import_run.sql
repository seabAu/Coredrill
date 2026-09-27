CREATE TABLE import_run (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id)),
  kind TEXT NOT NULL CHECK (kind = 'resume'),
  source_name TEXT NOT NULL CHECK (length(trim(source_name)) BETWEEN 1 AND 255),
  source_format TEXT NOT NULL CHECK (source_format IN ('docx', 'pdf', 'text')),
  source_media_type TEXT NOT NULL CHECK (length(trim(source_media_type)) BETWEEN 1 AND 120),
  source_byte_length INTEGER NOT NULL CHECK (source_byte_length BETWEEN 1 AND 10485760),
  source_hash TEXT NOT NULL CHECK (length(source_hash) = 64 AND source_hash = lower(source_hash)),
  source_mapping_json TEXT NOT NULL
    CHECK (json_valid(source_mapping_json) AND json_type(source_mapping_json) = 'array' AND length(source_mapping_json) <= 8388608),
  started_at TEXT NOT NULL CHECK (length(started_at) = 24),
  completed_at TEXT NOT NULL CHECK (length(completed_at) = 24),
  status TEXT NOT NULL CHECK (status = 'completed'),
  summary_json TEXT NOT NULL
    CHECK (json_valid(summary_json) AND json_type(summary_json) = 'object' AND length(summary_json) <= 200000)
) STRICT;
