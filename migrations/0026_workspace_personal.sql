CREATE TABLE canonical_import_receipt(token text PRIMARY KEY,actor text NOT NULL,source_hash text NOT NULL,result jsonb NOT NULL);
-- statement-breakpoint
CREATE TABLE personal_project(email text NOT NULL REFERENCES member(email),project_id text NOT NULL REFERENCES board_room_project(id) ON DELETE CASCADE,pinned boolean NOT NULL DEFAULT false,last_opened_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1,PRIMARY KEY(email,project_id));
