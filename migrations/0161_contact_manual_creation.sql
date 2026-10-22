CREATE TABLE contact_manual_creation (
  contact_id TEXT PRIMARY KEY NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  operation_id TEXT NOT NULL UNIQUE CHECK (
    length(operation_id) = 36 AND operation_id = lower(operation_id)
    AND length(replace(operation_id, '-', '')) = 32
    AND operation_id NOT GLOB '*[^0-9a-f-]*'
    AND substr(operation_id, 9, 1) = '-' AND substr(operation_id, 14, 1) = '-'
    AND substr(operation_id, 19, 1) = '-' AND substr(operation_id, 24, 1) = '-'
    AND substr(operation_id, 15, 1) = '7' AND substr(operation_id, 20, 1) IN ('8', '9', 'a', 'b')
  ),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  name_hash TEXT NOT NULL CHECK (length(name_hash) = 64 AND name_hash NOT GLOB '*[^0-9a-f]*'),
  role_hash TEXT CHECK (role_hash IS NULL OR (length(role_hash) = 64 AND role_hash NOT GLOB '*[^0-9a-f]*')),
  email_hash TEXT CHECK (email_hash IS NULL OR (length(email_hash) = 64 AND email_hash NOT GLOB '*[^0-9a-f]*')),
  phone_hash TEXT CHECK (phone_hash IS NULL OR (length(phone_hash) = 64 AND phone_hash NOT GLOB '*[^0-9a-f]*')),
  public_profile_url_hash TEXT CHECK (public_profile_url_hash IS NULL OR (length(public_profile_url_hash) = 64 AND public_profile_url_hash NOT GLOB '*[^0-9a-f]*'))
) STRICT, WITHOUT ROWID;
