CREATE TABLE contact_source_use_policy (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id) AND length(replace(id, '-', '')) = 32
    AND id NOT GLOB '*[^0-9a-f-]*' AND substr(id,9,1)='-' AND substr(id,14,1)='-'
    AND substr(id,19,1)='-' AND substr(id,24,1)='-' AND substr(id,15,1)='7'
    AND substr(id,20,1) IN ('8','9','a','b')),
  vault_id TEXT NOT NULL REFERENCES vault(id) ON DELETE RESTRICT,
  operation_id TEXT NOT NULL UNIQUE CHECK (length(operation_id) = 36 AND operation_id = lower(operation_id) AND length(replace(operation_id, '-', '')) = 32
    AND operation_id NOT GLOB '*[^0-9a-f-]*' AND substr(operation_id,9,1)='-' AND substr(operation_id,14,1)='-'
    AND substr(operation_id,19,1)='-' AND substr(operation_id,24,1)='-' AND substr(operation_id,15,1)='7'
    AND substr(operation_id,20,1) IN ('8','9','a','b')),
  revision INTEGER NOT NULL CHECK (revision = 1),
  status TEXT NOT NULL CHECK (status IN ('enabled','disabled')),
  source_snapshot_id TEXT NOT NULL REFERENCES contact_source_snapshot(id) ON DELETE RESTRICT,
  source_snapshot_hash TEXT NOT NULL CHECK (length(source_snapshot_hash) = 64 AND source_snapshot_hash NOT GLOB '*[^0-9a-f]*'),
  source_url TEXT NOT NULL CHECK (length(CAST(source_url AS BLOB)) BETWEEN 1 AND 8192),
  source_class TEXT NOT NULL CHECK (source_class IN ('official_employer_page','public_dataset','licensed_material')),
  field_name TEXT NOT NULL CHECK (field_name IN ('name','role','email','phone','public_profile_url')),
  rights_basis TEXT NOT NULL CHECK (rights_basis IN ('public','licensed')),
  purpose TEXT NOT NULL CHECK (purpose='job_search'),
  usage TEXT NOT NULL CHECK (usage='display_and_manual_use'),
  terms_snapshot_id TEXT NOT NULL REFERENCES contact_source_snapshot(id) ON DELETE RESTRICT,
  terms_snapshot_hash TEXT NOT NULL CHECK (length(terms_snapshot_hash) = 64 AND terms_snapshot_hash NOT GLOB '*[^0-9a-f]*'),
  terms_start_byte INTEGER NOT NULL CHECK (terms_start_byte >= 0),
  terms_end_byte INTEGER NOT NULL CHECK (terms_end_byte > terms_start_byte AND terms_end_byte <= 4194304),
  terms_excerpt TEXT NOT NULL CHECK (length(CAST(terms_excerpt AS BLOB)) BETWEEN 1 AND 16384),
  permission_kind TEXT NOT NULL CHECK (
    (source_class='official_employer_page' AND rights_basis='public' AND permission_kind='explicit_public_job_search_contact')
    OR (source_class='public_dataset' AND rights_basis='public' AND permission_kind='compatible_public_reuse')
    OR (source_class='licensed_material' AND rights_basis='licensed' AND permission_kind='documented_license_grant')
  ),
  acknowledgement TEXT NOT NULL CHECK (acknowledgement='I reviewed this source''s permitted field use.'),
  reviewed_at TEXT NOT NULL CHECK (length(CAST(reviewed_at AS BLOB)) = 24 AND reviewed_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'),
  review_due_at TEXT NOT NULL CHECK (length(CAST(review_due_at AS BLOB)) = 24 AND review_due_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND review_due_at > reviewed_at),
  disabled_at TEXT CHECK (disabled_at IS NULL OR (length(CAST(disabled_at AS BLOB)) = 24 AND disabled_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND disabled_at >= reviewed_at)),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (
    (status='enabled' AND disabled_at IS NULL AND row_version=1)
    OR (status='disabled' AND disabled_at IS NOT NULL AND row_version=2)
  )
) STRICT, WITHOUT ROWID;
