ALTER TABLE asset_import_finding ADD COLUMN version integer NOT NULL DEFAULT 1,ADD COLUMN resolved_by text;
CREATE INDEX legacy_record_project_idx ON legacy_record(kind,(data->>'project_id'));
CREATE INDEX legacy_record_task_idx ON legacy_record(kind,(data->>'task_id'));
