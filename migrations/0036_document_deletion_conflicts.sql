-- Current evidence deletion invalidates pending replacement expectations atomically.
CREATE OR REPLACE FUNCTION attachment_document_version() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE current_id text; BEGIN
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
 ELSIF TG_OP='UPDATE' AND OLD.state='ready' AND NEW.state<>'ready' THEN
 NEW.is_current:=false;
 UPDATE logical_document SET current_attachment_id=NULL,version=version+1 WHERE id=NEW.document_id AND current_attachment_id=NEW.id;
 ELSIF TG_OP='UPDATE' AND (NEW.entity_type,NEW.entity_id) IS DISTINCT FROM (OLD.entity_type,OLD.entity_id) THEN
 UPDATE logical_document SET entity_type=NEW.entity_type,entity_id=NEW.entity_id WHERE id=NEW.document_id;
 END IF;
 RETURN NEW;
END $$;
