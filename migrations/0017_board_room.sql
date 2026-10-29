CREATE TABLE board_room_config (id text PRIMARY KEY CHECK(id='primary'),stages jsonb NOT NULL CHECK(jsonb_array_length(stages)=10),version integer NOT NULL DEFAULT 1,revision integer NOT NULL DEFAULT 0);
INSERT INTO board_room_config(id,stages) VALUES('primary','["Stage 1","Stage 2","Stage 3","Stage 4","Stage 5","Stage 6","Stage 7","Stage 8","Stage 9","Stage 10"]');
CREATE TABLE board_room_project(id text PRIMARY KEY,external_id text NOT NULL UNIQUE,data jsonb NOT NULL,version integer NOT NULL DEFAULT 1,document_revision integer NOT NULL DEFAULT 0,reviewed_revision integer,reviewed_by text,reviewed_at timestamp,updated_at timestamp NOT NULL DEFAULT now());
CREATE INDEX board_room_cod_idx ON board_room_project(((data->>'codYear')::integer),external_id);
CREATE INDEX board_room_category_idx ON board_room_project((data->>'category'));
CREATE INDEX board_room_stage_idx ON board_room_project(((data->>'stage')::integer));
CREATE TABLE board_room_category(id text PRIMARY KEY,name text NOT NULL UNIQUE,version integer NOT NULL DEFAULT 1);
CREATE TABLE board_room_assignment(id text PRIMARY KEY,project_id text NOT NULL REFERENCES board_room_project(id) ON DELETE CASCADE,category_id text NOT NULL REFERENCES board_room_category(id) ON DELETE RESTRICT,UNIQUE(project_id,category_id));
CREATE INDEX board_room_assignment_category_idx ON board_room_assignment(category_id,project_id);
CREATE TABLE board_room_history(id text PRIMARY KEY,project_id text NOT NULL REFERENCES board_room_project(id) ON DELETE CASCADE,actor text NOT NULL,kind text NOT NULL,detail jsonb NOT NULL,created_at timestamp NOT NULL DEFAULT now());
CREATE INDEX board_room_history_project_idx ON board_room_history(project_id,created_at DESC);
ALTER TABLE attachment DROP CONSTRAINT attachment_entity_type_check;
ALTER TABLE attachment ADD CONSTRAINT attachment_entity_type_check CHECK(entity_type IN ('task','taskDraft','project','boardRoomProject','avatar','workspace'));
-- statement-breakpoint
CREATE FUNCTION board_room_attachment_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id text; file_owner text; should_invalidate boolean:=false;
BEGIN
 IF TG_OP='DELETE' THEN
  target_id:=OLD.entity_id;file_owner:=OLD.owner_email;should_invalidate:=OLD.entity_type='boardRoomProject' AND OLD.state='ready';
 ELSE
  target_id:=NEW.entity_id;file_owner:=NEW.owner_email;
  should_invalidate:=NEW.entity_type='boardRoomProject' AND ((TG_OP='INSERT' AND NEW.state='ready') OR (TG_OP='UPDATE' AND (NEW.state='ready') IS DISTINCT FROM (OLD.state='ready')));
 END IF;
 IF should_invalidate THEN
  UPDATE board_room_project SET document_revision=document_revision+1,reviewed_revision=NULL,reviewed_by=NULL,reviewed_at=NULL,version=version+1,updated_at=now() WHERE id=target_id;
  IF FOUND THEN INSERT INTO board_room_history(id,project_id,actor,kind,detail) VALUES(gen_random_uuid()::text,target_id,file_owner,'documents_changed','{}'); END IF;
 END IF;
 RETURN NULL;
END $$;
-- statement-breakpoint
CREATE TRIGGER board_room_file_review AFTER INSERT OR UPDATE OR DELETE ON attachment FOR EACH ROW EXECUTE FUNCTION board_room_attachment_changed();
