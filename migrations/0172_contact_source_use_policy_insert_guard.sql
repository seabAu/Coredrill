CREATE TRIGGER contact_source_use_policy_insert_guard
BEFORE INSERT ON contact_source_use_policy
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM contact_source_use_policy WHERE id=NEW.id OR operation_id=NEW.operation_id)
  OR (SELECT count(*) FROM vault) <> 1
  OR NEW.status <> 'enabled' OR NEW.disabled_at IS NOT NULL OR NEW.row_version <> 1
  OR NOT EXISTS (
    SELECT 1 FROM contact_source_snapshot s
    WHERE s.id=NEW.source_snapshot_id AND s.vault_id=NEW.vault_id
      AND s.content_hash=NEW.source_snapshot_hash AND s.source_url=NEW.source_url
      AND s.source_class=NEW.source_class AND s.captured_at <= NEW.reviewed_at AND s.created_at <= NEW.reviewed_at
  )
  OR NOT EXISTS (
    SELECT 1 FROM contact_source_snapshot t
    WHERE t.id=NEW.terms_snapshot_id AND t.vault_id=NEW.vault_id
      AND t.content_hash=NEW.terms_snapshot_hash AND t.captured_at <= NEW.reviewed_at AND t.created_at <= NEW.reviewed_at
      AND NEW.terms_end_byte <= length(CAST(t.raw_text AS BLOB))
      AND CAST(substr(CAST(t.raw_text AS BLOB),NEW.terms_start_byte+1,NEW.terms_end_byte-NEW.terms_start_byte) AS TEXT)=NEW.terms_excerpt
  )
BEGIN
  SELECT RAISE(ABORT, 'invalid local contact source-use review');
END;
