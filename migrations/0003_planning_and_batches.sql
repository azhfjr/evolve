ALTER TABLE task ADD COLUMN parent_id text REFERENCES task(id) ON DELETE RESTRICT, ADD COLUMN recurrence text CHECK(recurrence IN ('daily','weekly','monthly')), ADD COLUMN recurrence_source_id text UNIQUE REFERENCES task(id) ON DELETE RESTRICT, ADD CONSTRAINT task_parent_not_self CHECK(parent_id IS DISTINCT FROM id);
CREATE INDEX task_parent_idx ON task(parent_id);
-- statement-breakpoint
CREATE TABLE task_dependency (task_id text NOT NULL REFERENCES task(id) ON DELETE CASCADE, depends_on_id text NOT NULL REFERENCES task(id) ON DELETE RESTRICT, PRIMARY KEY(task_id,depends_on_id), CHECK(task_id<>depends_on_id));
CREATE INDEX task_dependency_reverse_idx ON task_dependency(depends_on_id);
-- statement-breakpoint
CREATE TABLE task_template (id text PRIMARY KEY, name text NOT NULL, owner_email text NOT NULL, body jsonb NOT NULL, version integer NOT NULL DEFAULT 1, archived boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE command_receipt (id text PRIMARY KEY, actor_email text NOT NULL, payload_hash text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
