CREATE TABLE saved_view (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id)),
  scope TEXT NOT NULL CHECK (scope = 'jobs'),
  name TEXT NOT NULL COLLATE NOCASE CHECK (length(trim(name)) BETWEEN 1 AND 120),
  filter_ast_version INTEGER NOT NULL CHECK (filter_ast_version > 0),
  filter_ast_json TEXT NOT NULL CHECK (json_valid(filter_ast_json) AND length(filter_ast_json) <= 262144),
  ui_settings_json TEXT NOT NULL CHECK (json_valid(ui_settings_json) AND length(ui_settings_json) <= 262144),
  is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
  archived_at TEXT CHECK (archived_at IS NULL OR length(archived_at) = 24),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  updated_at TEXT NOT NULL CHECK (length(updated_at) = 24),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
  UNIQUE (scope, name)
) STRICT;
