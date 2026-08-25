CREATE TABLE location (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id = lower(id)),
  label TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 512),
  address_locality TEXT CHECK (address_locality IS NULL OR length(address_locality) <= 256),
  region TEXT CHECK (region IS NULL OR length(region) <= 256),
  postal_code TEXT CHECK (postal_code IS NULL OR length(postal_code) <= 64),
  country_code TEXT CHECK (
    country_code IS NULL OR
    (length(country_code) = 2 AND country_code = upper(country_code))
  ),
  latitude REAL CHECK (latitude IS NULL OR latitude BETWEEN -90.0 AND 90.0),
  longitude REAL CHECK (longitude IS NULL OR longitude BETWEEN -180.0 AND 180.0),
  precision TEXT CHECK (
    precision IS NULL OR
    precision IN ('exact', 'postal_code', 'locality', 'region', 'country', 'unknown')
  ),
  source TEXT CHECK (source IS NULL OR length(source) BETWEEN 1 AND 128),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  updated_at TEXT NOT NULL CHECK (length(updated_at) = 24),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0)
) STRICT;
