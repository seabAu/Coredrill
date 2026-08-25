CREATE TABLE app_setting (
  key TEXT PRIMARY KEY NOT NULL
    CHECK (length(key) BETWEEN 1 AND 128 AND key = trim(key)),
  json_value TEXT NOT NULL CHECK (json_valid(json_value)),
  updated_at TEXT NOT NULL CHECK (length(updated_at) = 24),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0)
) STRICT;
