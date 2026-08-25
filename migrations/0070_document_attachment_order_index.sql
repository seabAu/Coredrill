CREATE INDEX document_attachment_order_idx
ON document_version_attachment(document_version_id, sort_order, logical_name, content_id);
