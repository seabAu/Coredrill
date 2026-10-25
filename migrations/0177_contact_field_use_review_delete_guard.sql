CREATE TRIGGER contact_field_use_review_delete_guard
BEFORE DELETE ON contact_field_use_review
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM contact WHERE id=OLD.contact_id)
BEGIN
  SELECT RAISE(ABORT, 'contact field-use review cannot be detached');
END;
