CREATE TRIGGER answer_library_version_update_guard
BEFORE UPDATE ON answer_library_version
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'answer library versions are immutable');
END;
