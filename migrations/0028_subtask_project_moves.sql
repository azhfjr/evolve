CREATE OR REPLACE FUNCTION canonical_task_project() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE parent_project text; BEGIN
 IF (SELECT enabled FROM connected_workspace WHERE id='primary') THEN
 IF NEW.parent_id IS NOT NULL THEN SELECT project_id INTO parent_project FROM task WHERE id=NEW.parent_id; IF NOT FOUND THEN RAISE EXCEPTION 'Parent task no longer exists'; END IF; NEW.project_id:=parent_project; END IF;
 IF NEW.project_id IS NULL OR NOT EXISTS(SELECT 1 FROM board_room_project WHERE id=NEW.project_id) THEN RAISE EXCEPTION 'Choose a Board Room project'; END IF;
 END IF; RETURN NEW;
END $$;
-- statement-breakpoint
CREATE FUNCTION cascade_subtask_project() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (SELECT enabled FROM connected_workspace WHERE id='primary') AND NEW.project_id IS DISTINCT FROM OLD.project_id THEN UPDATE task SET project_id=NEW.project_id,version=version+1,updated_at=now() WHERE parent_id=NEW.id AND project_id IS DISTINCT FROM NEW.project_id; END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER subtask_project_move AFTER UPDATE ON task FOR EACH ROW EXECUTE FUNCTION cascade_subtask_project();
