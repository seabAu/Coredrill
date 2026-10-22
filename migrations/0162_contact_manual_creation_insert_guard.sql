CREATE TRIGGER contact_manual_creation_insert_guard
BEFORE INSERT ON contact_manual_creation
FOR EACH ROW
WHEN EXISTS (
    SELECT 1 FROM contact_manual_creation
    WHERE contact_id = NEW.contact_id OR operation_id = NEW.operation_id
  )
  OR NOT EXISTS (
    SELECT 1 FROM contact
    WHERE id = NEW.contact_id AND archived_at IS NULL AND row_version = 1
      AND confidence IS NULL AND user_confirmed = 1
      AND created_at = NEW.created_at AND updated_at = NEW.created_at
      AND (role IS NULL) = (NEW.role_hash IS NULL)
      AND (email IS NULL) = (NEW.email_hash IS NULL)
      AND (phone IS NULL) = (NEW.phone_hash IS NULL)
      AND (public_profile_url IS NULL) = (NEW.public_profile_url_hash IS NULL)
  )
  OR EXISTS (SELECT 1 FROM contact_point_provenance WHERE contact_id = NEW.contact_id)
BEGIN
  SELECT RAISE(ABORT, 'invalid manual contact creation evidence');
END;
