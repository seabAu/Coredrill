CREATE TABLE contact_field_use_review (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id) AND length(replace(id, '-', '')) = 32
    AND id NOT GLOB '*[^0-9a-f-]*' AND substr(id,9,1)='-' AND substr(id,14,1)='-'
    AND substr(id,19,1)='-' AND substr(id,24,1)='-' AND substr(id,15,1)='7'
    AND substr(id,20,1) IN ('8','9','a','b')),
  vault_id TEXT NOT NULL REFERENCES vault(id) ON DELETE RESTRICT,
  contact_id TEXT NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  operation_id TEXT NOT NULL UNIQUE CHECK (length(operation_id) = 36 AND operation_id = lower(operation_id) AND length(replace(operation_id, '-', '')) = 32
    AND operation_id NOT GLOB '*[^0-9a-f-]*' AND substr(operation_id,9,1)='-' AND substr(operation_id,14,1)='-'
    AND substr(operation_id,19,1)='-' AND substr(operation_id,24,1)='-' AND substr(operation_id,15,1)='7'
    AND substr(operation_id,20,1) IN ('8','9','a','b')),
  field_name TEXT NOT NULL CHECK (field_name IN ('name','role','email','phone','public_profile_url')),
  field_revision INTEGER NOT NULL CHECK (field_revision BETWEEN 1 AND 9007199254740991),
  contact_row_version INTEGER NOT NULL CHECK (contact_row_version BETWEEN 1 AND 9007199254740991),
  value_hash TEXT NOT NULL CHECK (length(value_hash) = 64 AND value_hash NOT GLOB '*[^0-9a-f]*'),
  source_snapshot_id TEXT NOT NULL REFERENCES contact_source_snapshot(id) ON DELETE RESTRICT,
  source_snapshot_hash TEXT NOT NULL CHECK (length(source_snapshot_hash) = 64 AND source_snapshot_hash NOT GLOB '*[^0-9a-f]*'),
  source_start_byte INTEGER NOT NULL CHECK (source_start_byte >= 0),
  source_end_byte INTEGER NOT NULL CHECK (source_end_byte > source_start_byte AND source_end_byte <= 4194304),
  source_excerpt TEXT NOT NULL CHECK (length(CAST(source_excerpt AS BLOB)) BETWEEN 1 AND 16384),
  policy_id TEXT NOT NULL REFERENCES contact_source_use_policy(id) ON DELETE RESTRICT,
  policy_revision INTEGER NOT NULL CHECK (policy_revision = 1),
  purpose TEXT NOT NULL CHECK (purpose='job_search'),
  purpose_note TEXT NOT NULL CHECK (length(CAST(purpose_note AS BLOB)) BETWEEN 1 AND 2000 AND length(trim(purpose_note)) > 0),
  acknowledgement TEXT NOT NULL CHECK (acknowledgement='I reviewed this exact contact field and purpose.'),
  reviewed_at TEXT NOT NULL CHECK (length(CAST(reviewed_at AS BLOB)) = 24 AND reviewed_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'),
  review_due_at TEXT NOT NULL CHECK (length(CAST(review_due_at AS BLOB)) = 24 AND review_due_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND review_due_at > reviewed_at),
  expires_at TEXT NOT NULL CHECK (length(CAST(expires_at AS BLOB)) = 24 AND expires_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND expires_at > reviewed_at),
  revoked_at TEXT CHECK (revoked_at IS NULL OR (length(CAST(revoked_at AS BLOB)) = 24 AND revoked_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND revoked_at >= reviewed_at)),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (
    (revoked_at IS NULL AND row_version=1) OR (revoked_at IS NOT NULL AND row_version=2)
  ),
  UNIQUE(contact_id,field_name,field_revision)
) STRICT, WITHOUT ROWID;
