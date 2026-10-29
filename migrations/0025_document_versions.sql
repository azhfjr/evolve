CREATE TABLE logical_document(id text PRIMARY KEY,entity_type text NOT NULL,entity_id text NOT NULL,current_attachment_id text,version integer NOT NULL DEFAULT 1);
-- statement-breakpoint
ALTER TABLE attachment ADD COLUMN document_id text REFERENCES logical_document(id),ADD COLUMN version_number integer NOT NULL DEFAULT 1,ADD COLUMN is_current boolean NOT NULL DEFAULT true,ADD COLUMN replaces_attachment_id text;
-- statement-breakpoint
INSERT INTO logical_document(id,entity_type,entity_id,current_attachment_id) SELECT id,entity_type,entity_id,CASE WHEN state='ready' THEN id ELSE NULL END FROM attachment WHERE entity_type IN ('task','taskDraft','project','boardRoomProject');
UPDATE attachment SET document_id=id,is_current=(state='ready') WHERE entity_type IN ('task','taskDraft','project','boardRoomProject');
-- statement-breakpoint
CREATE UNIQUE INDEX attachment_document_version_idx ON attachment(document_id,version_number);
CREATE INDEX logical_document_entity_idx ON logical_document(entity_type,entity_id);
-- statement-breakpoint
CREATE FUNCTION attachment_document_version() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE current_id text; BEGIN
 IF NEW.entity_type NOT IN ('task','taskDraft','project','boardRoomProject') THEN RETURN NEW; END IF;
 IF NEW.document_id IS NULL THEN
 NEW.document_id:=NEW.id; NEW.version_number:=1;
 INSERT INTO logical_document(id,entity_type,entity_id) VALUES(NEW.id,NEW.entity_type,NEW.entity_id);
 END IF;
 IF TG_OP='INSERT' THEN NEW.is_current:=false; END IF;
 IF NEW.state='ready' AND (TG_OP='INSERT' OR OLD.state<>'ready') THEN
 SELECT current_attachment_id INTO current_id FROM logical_document WHERE id=NEW.document_id FOR UPDATE;
 IF NEW.replaces_attachment_id IS NOT NULL AND current_id IS DISTINCT FROM NEW.replaces_attachment_id THEN RAISE EXCEPTION 'Document changed during upload'; END IF;
 IF current_id IS NOT NULL AND current_id<>NEW.id THEN UPDATE attachment SET is_current=false WHERE id=current_id; END IF;
 NEW.is_current:=true;
 UPDATE logical_document SET current_attachment_id=NEW.id,version=version+1,entity_type=NEW.entity_type,entity_id=NEW.entity_id WHERE id=NEW.document_id;
 ELSIF TG_OP='UPDATE' AND (NEW.entity_type,NEW.entity_id) IS DISTINCT FROM (OLD.entity_type,OLD.entity_id) THEN
 UPDATE logical_document SET entity_type=NEW.entity_type,entity_id=NEW.entity_id WHERE id=NEW.document_id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER attachment_version BEFORE INSERT OR UPDATE ON attachment FOR EACH ROW EXECUTE FUNCTION attachment_document_version();
-- statement-breakpoint
CREATE OR REPLACE FUNCTION board_room_attachment_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id text; file_owner text; should_invalidate boolean:=false;
BEGIN
 IF TG_OP='DELETE' THEN target_id:=OLD.entity_id;file_owner:=OLD.owner_email;should_invalidate:=OLD.entity_type='boardRoomProject' AND OLD.state='ready';
 ELSE target_id:=NEW.entity_id;file_owner:=NEW.owner_email;should_invalidate:=NEW.entity_type='boardRoomProject' AND ((TG_OP='INSERT' AND NEW.state='ready') OR (TG_OP='UPDATE' AND ((NEW.state='ready') IS DISTINCT FROM (OLD.state='ready') OR NEW.is_current IS DISTINCT FROM OLD.is_current)));
 END IF;
 IF should_invalidate THEN UPDATE board_room_project SET document_revision=document_revision+1,reviewed_revision=NULL,reviewed_by=NULL,reviewed_at=NULL,version=version+1,updated_at=now() WHERE id=target_id;
 IF FOUND THEN INSERT INTO board_room_history(id,project_id,actor,kind,detail) VALUES(gen_random_uuid()::text,target_id,file_owner,'documents_changed','{}'); END IF; END IF;
 RETURN NULL;
END $$;
