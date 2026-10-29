ALTER TABLE member ADD COLUMN job_title text NOT NULL DEFAULT '', ADD COLUMN bio text NOT NULL DEFAULT '', ADD COLUMN time_zone text NOT NULL DEFAULT 'Asia/Jakarta', ADD COLUMN avatar_id text, ADD COLUMN preferences jsonb NOT NULL DEFAULT '{}', ADD COLUMN version integer NOT NULL DEFAULT 1;
-- statement-breakpoint
ALTER TABLE task ADD COLUMN due_time text;
-- statement-breakpoint
CREATE TABLE workspace_setting (id text PRIMARY KEY DEFAULT 'primary' CHECK (id = 'primary'), name text NOT NULL DEFAULT 'Evolve', description text NOT NULL DEFAULT 'Private organization workspace', accent text NOT NULL DEFAULT 'green', time_zone text NOT NULL DEFAULT 'Asia/Jakarta', logo_id text, version integer NOT NULL DEFAULT 1, revision bigint NOT NULL DEFAULT 0);
INSERT INTO workspace_setting(id) VALUES ('primary');
-- statement-breakpoint
CREATE TABLE attachment (id text PRIMARY KEY, entity_type text NOT NULL CHECK(entity_type IN ('task','project','avatar','workspace')), entity_id text NOT NULL, owner_email text NOT NULL, filename text NOT NULL, content_type text NOT NULL, size integer NOT NULL CHECK(size > 0 AND size <= 26214400), storage_path text NOT NULL UNIQUE, state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','ready','deleting')), created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX attachment_entity_idx ON attachment(entity_type,entity_id,created_at);
-- statement-breakpoint
CREATE TABLE calendar_connection (email text PRIMARY KEY REFERENCES member(email), access_token text NOT NULL, refresh_token text NOT NULL, expires_at timestamptz NOT NULL, calendar_id text NOT NULL, time_zone text NOT NULL, sync_scope text NOT NULL DEFAULT 'assigned' CHECK(sync_scope IN ('assigned','all')), reminders jsonb NOT NULL DEFAULT '[1440,30]', enabled boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1, error_code text, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE calendar_oauth_state (hash text PRIMARY KEY, email text NOT NULL REFERENCES member(email), verifier text NOT NULL, expires_at timestamptz NOT NULL);
-- statement-breakpoint
CREATE TABLE calendar_job (email text NOT NULL REFERENCES member(email), task_id text NOT NULL REFERENCES task(id), generation integer NOT NULL DEFAULT 1, attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz, last_error text, PRIMARY KEY(email,task_id));
CREATE INDEX calendar_job_available_idx ON calendar_job(available_at,lease_until);
CREATE TABLE calendar_event (email text NOT NULL REFERENCES member(email), task_id text NOT NULL REFERENCES task(id), event_id text NOT NULL, synced_version integer NOT NULL, synced_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(email,task_id));
-- statement-breakpoint
CREATE INDEX task_updated_cursor_idx ON task(updated_at DESC,id DESC);
