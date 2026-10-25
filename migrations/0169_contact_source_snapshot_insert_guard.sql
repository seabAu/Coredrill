CREATE TRIGGER contact_source_snapshot_insert_guard
BEFORE INSERT ON contact_source_snapshot
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM contact_source_snapshot WHERE id=NEW.id OR operation_id=NEW.operation_id)
  OR (SELECT count(*) FROM vault) <> 1
BEGIN
  SELECT RAISE(ABORT, 'invalid independent contact source');
END;
