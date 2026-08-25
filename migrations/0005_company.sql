CREATE TABLE company (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id)),
  canonical_name TEXT NOT NULL CHECK (length(trim(canonical_name)) BETWEEN 1 AND 512),
  website_url TEXT CHECK (website_url IS NULL OR length(website_url) <= 8192),
  domain TEXT CHECK (domain IS NULL OR length(domain) BETWEEN 1 AND 253),
  location_id TEXT REFERENCES location(id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 200000),
  archived_at TEXT CHECK (archived_at IS NULL OR length(archived_at) = 24),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  updated_at TEXT NOT NULL CHECK (length(updated_at) = 24),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0)
) STRICT;
