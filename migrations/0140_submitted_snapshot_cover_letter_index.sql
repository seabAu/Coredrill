CREATE UNIQUE INDEX submitted_snapshot_one_cover_letter
ON submitted_snapshot_item(submitted_snapshot_id)
WHERE role = 'cover_letter';

