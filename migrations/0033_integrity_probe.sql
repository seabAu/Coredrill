CREATE TABLE coredrill_integrity_probe (
  value INTEGER NOT NULL CHECK (value = 0)
) STRICT;
