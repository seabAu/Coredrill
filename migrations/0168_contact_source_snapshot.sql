CREATE TABLE contact_source_snapshot (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id) AND length(replace(id, '-', '')) = 32
    AND id NOT GLOB '*[^0-9a-f-]*' AND substr(id,9,1)='-' AND substr(id,14,1)='-'
    AND substr(id,19,1)='-' AND substr(id,24,1)='-' AND substr(id,15,1)='7'
    AND substr(id,20,1) IN ('8','9','a','b')),
  vault_id TEXT NOT NULL REFERENCES vault(id) ON DELETE RESTRICT,
  operation_id TEXT NOT NULL UNIQUE CHECK (length(operation_id) = 36 AND operation_id = lower(operation_id) AND length(replace(operation_id, '-', '')) = 32
    AND operation_id NOT GLOB '*[^0-9a-f-]*' AND substr(operation_id,9,1)='-' AND substr(operation_id,14,1)='-'
    AND substr(operation_id,19,1)='-' AND substr(operation_id,24,1)='-' AND substr(operation_id,15,1)='7'
    AND substr(operation_id,20,1) IN ('8','9','a','b')),
  acquisition TEXT NOT NULL CHECK (acquisition = 'user_supplied'),
  source_class TEXT NOT NULL CHECK (source_class IN ('official_employer_page','public_dataset','licensed_material')),
  source_url TEXT NOT NULL CHECK (length(CAST(source_url AS BLOB)) BETWEEN 1 AND 8192),
  captured_at TEXT NOT NULL CHECK (length(CAST(captured_at AS BLOB)) = 24 AND captured_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'),
  raw_text TEXT NOT NULL CHECK (length(CAST(raw_text AS BLOB)) BETWEEN 1 AND 4194304),
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64 AND content_hash NOT GLOB '*[^0-9a-f]*'),
  created_at TEXT NOT NULL CHECK (length(CAST(created_at AS BLOB)) = 24 AND created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND created_at >= captured_at),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version = 1)
) STRICT, WITHOUT ROWID;
