CREATE TABLE interview (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id)),
  application_id TEXT NOT NULL REFERENCES application(id) ON DELETE CASCADE,
  stage_name TEXT NOT NULL CHECK (length(trim(stage_name)) BETWEEN 1 AND 256),
  starts_at TEXT NOT NULL CHECK (length(starts_at) = 24),
  timezone TEXT NOT NULL CHECK (length(timezone) BETWEEN 1 AND 128),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 1 AND 1440),
  location_or_url TEXT CHECK (location_or_url IS NULL OR length(location_or_url) <= 8192),
  contact_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(contact_ids_json)),
  preparation_notes TEXT NOT NULL DEFAULT '' CHECK (length(preparation_notes) <= 200000),
  outcome TEXT CHECK (outcome IS NULL OR length(outcome) <= 200000),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  updated_at TEXT NOT NULL CHECK (length(updated_at) = 24),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0)
) STRICT;
