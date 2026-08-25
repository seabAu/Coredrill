CREATE TRIGGER attachment_manifest_immutable_update_guard
BEFORE UPDATE ON attachment_manifest
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'attachment manifests are immutable');
END;
