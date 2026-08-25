CREATE TABLE contact (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id)),
  company_id TEXT REFERENCES company(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 512),
  role TEXT CHECK (role IS NULL OR length(role) <= 512),
  email TEXT CHECK (email IS NULL OR length(email) <= 320),
  phone TEXT CHECK (phone IS NULL OR length(phone) <= 128),
  public_profile_url TEXT CHECK (public_profile_url IS NULL OR length(public_profile_url) <= 8192),
  confidence REAL CHECK (confidence IS NULL OR confidence BETWEEN 0.0 AND 1.0),
  user_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (user_confirmed IN (0, 1)),
  notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 200000),
  archived_at TEXT CHECK (archived_at IS NULL OR length(archived_at) = 24),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  updated_at TEXT NOT NULL CHECK (length(updated_at) = 24),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0)
) STRICT;
