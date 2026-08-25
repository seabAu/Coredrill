CREATE TABLE device (
  id TEXT PRIMARY KEY NOT NULL CHECK (
    length(id) = 36 AND
    id = lower(id) AND
    substr(id, 9, 1) = '-' AND
    substr(id, 14, 1) = '-' AND
    substr(id, 15, 1) = '7' AND
    substr(id, 19, 1) = '-' AND
    substr(id, 20, 1) IN ('8', '9', 'a', 'b') AND
    substr(id, 24, 1) = '-' AND
    id NOT GLOB '*[^0-9a-f-]*'
  ),
  label TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 256),
  platform TEXT NOT NULL CHECK (
    length(platform) BETWEEN 1 AND 128 AND
    platform = lower(platform) AND
    platform NOT GLOB '*[^a-z0-9._-]*'
  ),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  updated_at TEXT NOT NULL CHECK (length(updated_at) = 24),
  last_seen_at TEXT NOT NULL CHECK (length(last_seen_at) = 24),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
  CHECK (created_at <= updated_at AND updated_at <= last_seen_at)
) STRICT;
