CREATE TABLE candidate_profile (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id)),
  singleton_key INTEGER NOT NULL DEFAULT 1 UNIQUE CHECK (singleton_key = 1),
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 512),
  summary TEXT NOT NULL DEFAULT '' CHECK (length(summary) <= 200000),
  target_roles_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(target_roles_json) AND json_type(target_roles_json) = 'array' AND length(target_roles_json) <= 20000),
  location_id TEXT REFERENCES location(id) ON DELETE SET NULL,
  work_preferences_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(work_preferences_json) AND json_type(work_preferences_json) = 'object' AND length(work_preferences_json) <= 20000),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  updated_at TEXT NOT NULL CHECK (length(updated_at) = 24),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0)
) STRICT;
