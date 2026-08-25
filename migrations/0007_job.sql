CREATE TABLE job (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id)),
  company_id TEXT REFERENCES company(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 1024),
  normalized_title TEXT CHECK (normalized_title IS NULL OR length(normalized_title) <= 1024),
  description_text TEXT NOT NULL DEFAULT '' CHECK (length(description_text) <= 2000000),
  employment_type TEXT CHECK (employment_type IS NULL OR length(employment_type) <= 128),
  workplace_type TEXT CHECK (workplace_type IS NULL OR length(workplace_type) <= 128),
  seniority TEXT CHECK (seniority IS NULL OR length(seniority) <= 128),
  location_id TEXT REFERENCES location(id) ON DELETE SET NULL,
  remote_region_json TEXT CHECK (remote_region_json IS NULL OR json_valid(remote_region_json)),
  date_posted TEXT CHECK (date_posted IS NULL OR length(date_posted) = 10),
  valid_through TEXT CHECK (valid_through IS NULL OR length(valid_through) = 10),
  archived_at TEXT CHECK (archived_at IS NULL OR length(archived_at) = 24),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  updated_at TEXT NOT NULL CHECK (length(updated_at) = 24),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
  CHECK (date_posted IS NULL OR valid_through IS NULL OR date_posted <= valid_through)
) STRICT;
