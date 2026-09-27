CREATE VIEW career_evidence_search_content AS
SELECT 'employment' AS evidence_kind, id AS evidence_id,
       role || ' at ' || organization AS label,
       organization || ' ' || role || ' ' || description AS searchable_text,
       verification_state, '[]' AS privacy_tags_json, updated_at
FROM experience WHERE archived_at IS NULL
UNION ALL
SELECT 'education', id, credential || ' at ' || institution,
       institution || ' ' || credential || ' ' ||
         CASE WHEN field IS NULL THEN '' ELSE field END || ' ' || details,
       verification_state, '[]', updated_at
FROM education WHERE archived_at IS NULL
UNION ALL
SELECT 'project', id, name, name || ' ' || summary,
       verification_state, '[]', updated_at
FROM project WHERE archived_at IS NULL
UNION ALL
SELECT 'skill', id, canonical_name,
       canonical_name || ' ' ||
         CASE WHEN category IS NULL THEN '' ELSE category END || ' ' || aliases_json,
       verification_state, '[]', updated_at
FROM skill WHERE archived_at IS NULL
UNION ALL
SELECT 'accomplishment', id, action,
       action || ' ' || result || ' ' || metrics_json,
       verification_state, '[]', updated_at
FROM accomplishment WHERE archived_at IS NULL
UNION ALL
SELECT 'certification', id, name || ' — ' || issuer,
       name || ' ' || issuer,
       verification_state, '[]', updated_at
FROM certification WHERE archived_at IS NULL
UNION ALL
SELECT 'publication', id, title,
       title || ' ' ||
         CASE WHEN publisher IS NULL THEN '' ELSE publisher END || ' ' || summary,
       verification_state, '[]', updated_at
FROM publication WHERE archived_at IS NULL
UNION ALL
SELECT 'volunteer', id, role || ' at ' || organization,
       organization || ' ' || role || ' ' || description,
       verification_state, '[]', updated_at
FROM volunteer_experience WHERE archived_at IS NULL
UNION ALL
SELECT 'story', id, title,
       title || ' ' || situation || ' ' || action || ' ' || result || ' ' || tags_json,
       verification_state, privacy_tags_json, updated_at
FROM anecdote WHERE archived_at IS NULL;
