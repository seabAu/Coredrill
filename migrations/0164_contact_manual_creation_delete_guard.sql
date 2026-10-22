CREATE TRIGGER contact_manual_creation_delete_guard
BEFORE DELETE ON contact_manual_creation
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM contact WHERE id = OLD.contact_id)
BEGIN
  SELECT RAISE(ABORT, 'manual contact creation evidence cannot be detached');
END;
