CREATE TABLE career_import_resolution (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id)),
  import_run_id TEXT NOT NULL REFERENCES import_run(id) ON DELETE CASCADE,
  group_key TEXT NOT NULL CHECK (length(trim(group_key)) BETWEEN 1 AND 128),
  target_kind TEXT CHECK (target_kind IS NULL OR target_kind IN ('employment', 'skill')),
  decision TEXT NOT NULL CHECK (decision IN ('accepted_new', 'merged_existing', 'rejected')),
  target_id TEXT CHECK (target_id IS NULL OR (length(target_id) = 36 AND target_id = lower(target_id))),
  resolved_values_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(resolved_values_json) AND json_type(resolved_values_json) = 'object' AND length(resolved_values_json) <= 20000),
  resolved_at TEXT NOT NULL CHECK (length(resolved_at) = 24),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
  UNIQUE(import_run_id, group_key),
  CHECK (
    (decision = 'rejected' AND target_kind IS NULL AND target_id IS NULL) OR
    (decision IN ('accepted_new', 'merged_existing') AND target_kind IS NOT NULL AND target_id IS NOT NULL)
  )
) STRICT;
