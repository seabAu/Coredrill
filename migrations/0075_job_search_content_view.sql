CREATE VIEW job_search_content AS
SELECT
  job_search_identity.search_id,
  job.id AS job_id,
  job.title,
  coalesce(job.normalized_title, '') AS normalized_title,
  coalesce(company.canonical_name, '') AS company_name,
  job.description_text,
  coalesce(company.notes, '') AS company_notes,
  coalesce((
    SELECT group_concat(search_application.notes, char(31))
    FROM application AS search_application
    WHERE search_application.job_id = job.id
      AND search_application.archived_at IS NULL
  ), '') AS application_notes,
  job.archived_at,
  job.updated_at
FROM job
INNER JOIN job_search_identity ON job_search_identity.job_id = job.id
LEFT JOIN company ON company.id = job.company_id;
