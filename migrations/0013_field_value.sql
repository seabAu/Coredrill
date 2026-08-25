CREATE TABLE field_value (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id)),
  entity_type TEXT NOT NULL CHECK (length(entity_type) BETWEEN 1 AND 64),
  entity_id TEXT NOT NULL CHECK (length(entity_id) = 36 AND entity_id = lower(entity_id)),
  field_name TEXT NOT NULL CHECK (length(field_name) BETWEEN 1 AND 128),
  normalized_json TEXT NOT NULL CHECK (json_valid(normalized_json)),
  raw_json TEXT CHECK (raw_json IS NULL OR json_valid(raw_json)),
  provenance_id TEXT NOT NULL REFERENCES provenance(id) ON DELETE RESTRICT,
  is_user_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (is_user_confirmed IN (0, 1)),
  user_confirmation_id TEXT CHECK (
    user_confirmation_id IS NULL OR
    (length(user_confirmation_id) = 36 AND user_confirmation_id = lower(user_confirmation_id))
  ),
  confirmed_at TEXT CHECK (confirmed_at IS NULL OR length(confirmed_at) = 24),
  confirmed_value_hash TEXT CHECK (
    confirmed_value_hash IS NULL OR
    (length(confirmed_value_hash) = 64 AND confirmed_value_hash = lower(confirmed_value_hash))
  ),
  superseded_by_id TEXT REFERENCES field_value(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  updated_at TEXT NOT NULL CHECK (length(updated_at) = 24),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
  CHECK (superseded_by_id IS NULL OR superseded_by_id <> id),
  CHECK (
    (is_user_confirmed = 0 AND user_confirmation_id IS NULL AND confirmed_at IS NULL AND confirmed_value_hash IS NULL) OR
    (is_user_confirmed = 1 AND user_confirmation_id IS NOT NULL AND confirmed_at IS NOT NULL AND confirmed_value_hash IS NOT NULL)
  )
) STRICT;
