CREATE UNIQUE INDEX submitted_snapshot_one_resume
ON submitted_snapshot_item(submitted_snapshot_id)
WHERE role = 'resume';

