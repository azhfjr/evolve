CREATE TABLE auth_user (id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE, email_verified boolean NOT NULL DEFAULT false, image text, created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now());
-- statement-breakpoint
CREATE TABLE auth_session (id text PRIMARY KEY, expires_at timestamp NOT NULL, token text NOT NULL UNIQUE, created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now(), ip_address text, user_agent text, user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE);
-- statement-breakpoint
CREATE INDEX session_user_idx ON auth_session(user_id);
-- statement-breakpoint
CREATE TABLE auth_account (id text PRIMARY KEY, account_id text NOT NULL, provider_id text NOT NULL, user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE, access_token text, refresh_token text, id_token text, access_token_expires_at timestamp, refresh_token_expires_at timestamp, scope text, password text, created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now(), UNIQUE(provider_id, account_id));
-- statement-breakpoint
CREATE INDEX account_user_idx ON auth_account(user_id);
-- statement-breakpoint
CREATE TABLE auth_verification (id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL, expires_at timestamp NOT NULL, created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now());
-- statement-breakpoint
CREATE INDEX verification_identifier_idx ON auth_verification(identifier);
-- statement-breakpoint
CREATE TABLE auth_rate_limit (id text PRIMARY KEY, key text NOT NULL UNIQUE, count integer NOT NULL, last_request bigint NOT NULL);
-- statement-breakpoint
CREATE TABLE api_rate (key text PRIMARY KEY, count integer NOT NULL DEFAULT 1, reset_at timestamp NOT NULL);
-- statement-breakpoint
CREATE TABLE member (email text PRIMARY KEY, name text NOT NULL, color text NOT NULL DEFAULT 'violet', disabled boolean NOT NULL DEFAULT false);
-- statement-breakpoint
CREATE TABLE project (id text PRIMARY KEY, name text NOT NULL, description text NOT NULL DEFAULT '', color text NOT NULL DEFAULT 'violet', created_at timestamp NOT NULL DEFAULT now());
-- statement-breakpoint
CREATE TABLE task (id text PRIMARY KEY, title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200), description text NOT NULL DEFAULT '', project_id text REFERENCES project(id) ON DELETE RESTRICT, status text NOT NULL DEFAULT 'todo' CHECK(status IN ('backlog','todo','in_progress','review','done')), priority text NOT NULL DEFAULT 'none' CHECK(priority IN ('none','low','medium','high','urgent')), assignee text REFERENCES member(email) ON DELETE RESTRICT, due_date text, labels jsonb NOT NULL DEFAULT '[]', checklist jsonb NOT NULL DEFAULT '[]', version integer NOT NULL DEFAULT 1, created_by text NOT NULL, created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now(), completed_at timestamp, archived boolean NOT NULL DEFAULT false);
-- statement-breakpoint
CREATE INDEX task_project_status_idx ON task(project_id,status);
-- statement-breakpoint
CREATE INDEX task_assignee_due_idx ON task(assignee,due_date);
-- statement-breakpoint
CREATE INDEX task_cursor_idx ON task(id);
-- statement-breakpoint
CREATE TABLE comment (id text PRIMARY KEY, task_id text NOT NULL REFERENCES task(id) ON DELETE CASCADE, author text NOT NULL, body text NOT NULL, created_at timestamp NOT NULL DEFAULT now());
-- statement-breakpoint
CREATE INDEX comment_task_idx ON comment(task_id);
-- statement-breakpoint
CREATE TABLE activity (id text PRIMARY KEY, task_id text REFERENCES task(id) ON DELETE SET NULL, actor text NOT NULL, message text NOT NULL, created_at timestamp NOT NULL DEFAULT now());
-- statement-breakpoint
CREATE INDEX activity_created_idx ON activity(created_at);
-- statement-breakpoint
CREATE TABLE notification (id text PRIMARY KEY, email text NOT NULL, task_id text REFERENCES task(id) ON DELETE CASCADE, message text NOT NULL, read boolean NOT NULL DEFAULT false, created_at timestamp NOT NULL DEFAULT now());
-- statement-breakpoint
CREATE INDEX notification_email_idx ON notification(email,created_at);
-- statement-breakpoint
