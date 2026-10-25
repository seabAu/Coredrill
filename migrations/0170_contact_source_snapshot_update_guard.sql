CREATE TRIGGER contact_source_snapshot_update_guard
BEFORE UPDATE ON contact_source_snapshot
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'independent contact source is immutable');
END;
