CREATE INDEX job_company_active_idx
ON job(company_id, updated_at DESC, id)
WHERE archived_at IS NULL AND company_id IS NOT NULL;
