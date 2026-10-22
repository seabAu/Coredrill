CREATE TRIGGER contact_manual_creation_update_guard
BEFORE UPDATE ON contact_manual_creation
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'manual contact creation evidence is immutable');
END;
