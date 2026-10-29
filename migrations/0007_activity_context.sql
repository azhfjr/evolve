ALTER TABLE activity ADD COLUMN project_id text REFERENCES project(id), ADD COLUMN kind text NOT NULL DEFAULT 'general';
CREATE INDEX activity_project_created_idx ON activity(project_id,created_at DESC,id DESC);
