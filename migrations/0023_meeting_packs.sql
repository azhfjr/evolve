CREATE TABLE meeting_pack(id text PRIMARY KEY,request_id text NOT NULL UNIQUE,actor text NOT NULL,title text NOT NULL,snapshot jsonb NOT NULL,revises_id text REFERENCES meeting_pack(id),correction_note text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now());
-- statement-breakpoint
CREATE TABLE meeting_action_link(task_id text PRIMARY KEY,pack_id text NOT NULL REFERENCES meeting_pack(id),project_id text NOT NULL REFERENCES board_room_project(id),decision text NOT NULL);
-- statement-breakpoint
CREATE TRIGGER meeting_snapshot_immutable BEFORE UPDATE OR DELETE ON meeting_pack FOR EACH ROW EXECUTE FUNCTION legacy_record_readonly();
