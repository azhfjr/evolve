CREATE TABLE connected_workspace(id text PRIMARY KEY CHECK(id='primary'),enabled boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,activated_at timestamptz);
INSERT INTO connected_workspace(id) VALUES('primary');
-- statement-breakpoint
CREATE TABLE legacy_record(kind text NOT NULL,id text NOT NULL,data jsonb NOT NULL,archived_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(kind,id));
-- statement-breakpoint
CREATE INDEX legacy_record_name_idx ON legacy_record(kind,lower(coalesce(data->>'name',data->>'title','')));
-- statement-breakpoint
CREATE FUNCTION legacy_record_readonly() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Legacy archive is read-only'; END $$;
CREATE TRIGGER legacy_immutable BEFORE UPDATE OR DELETE ON legacy_record FOR EACH ROW EXECUTE FUNCTION legacy_record_readonly();
-- statement-breakpoint
ALTER TABLE project ADD COLUMN board_project_id text UNIQUE REFERENCES board_room_project(id) ON DELETE RESTRICT;
-- statement-breakpoint
CREATE FUNCTION mirror_board_project() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (SELECT enabled FROM connected_workspace WHERE id='primary') THEN
 INSERT INTO project(id,board_project_id,name,description,color,reference,location,planned_cod_year,category,version)
 VALUES(NEW.id,NEW.id,NEW.data->>'name',coalesce(NEW.data->>'description',''),'green',NEW.external_id,coalesce(NEW.data->>'location',''),(NEW.data->>'codYear')::int,nullif(NEW.data->>'category',''),NEW.version)
 ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,reference=EXCLUDED.reference,location=EXCLUDED.location,planned_cod_year=EXCLUDED.planned_cod_year,category=EXCLUDED.category,version=EXCLUDED.version;
 END IF; RETURN NULL;
END $$;
CREATE TRIGGER board_project_projection AFTER INSERT OR UPDATE ON board_room_project FOR EACH ROW EXECUTE FUNCTION mirror_board_project();
-- statement-breakpoint
CREATE FUNCTION protect_canonical_project() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (SELECT enabled FROM connected_workspace WHERE id='primary') AND pg_trigger_depth()<2 THEN RAISE EXCEPTION 'Manage shared project identity in Board Room'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER canonical_project_guard BEFORE INSERT OR UPDATE OR DELETE ON project FOR EACH ROW EXECUTE FUNCTION protect_canonical_project();
-- statement-breakpoint
CREATE FUNCTION canonical_task_project() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE parent_project text; BEGIN
 IF (SELECT enabled FROM connected_workspace WHERE id='primary') THEN
 IF NEW.parent_id IS NOT NULL THEN SELECT project_id INTO parent_project FROM task WHERE id=NEW.parent_id; IF NOT FOUND THEN RAISE EXCEPTION 'Parent task no longer exists'; END IF; NEW.project_id:=parent_project; END IF;
 IF NEW.project_id IS NULL OR NOT EXISTS(SELECT 1 FROM board_room_project WHERE id=NEW.project_id) THEN RAISE EXCEPTION 'Choose a Board Room project'; END IF;
 IF TG_OP='UPDATE' AND OLD.project_id IS DISTINCT FROM NEW.project_id AND EXISTS(SELECT 1 FROM task WHERE parent_id=NEW.id) THEN RAISE EXCEPTION 'Move subtasks together with their parent'; END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER canonical_task_guard BEFORE INSERT OR UPDATE ON task FOR EACH ROW EXECUTE FUNCTION canonical_task_project();
-- statement-breakpoint
CREATE FUNCTION archive_file_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM legacy_record WHERE kind='attachment' AND id=OLD.id) AND OLD.state='ready' THEN RAISE EXCEPTION 'Archived documents are read-only'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER archive_file_readonly BEFORE UPDATE OR DELETE ON attachment FOR EACH ROW EXECUTE FUNCTION archive_file_guard();
