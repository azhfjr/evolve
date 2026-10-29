-- Retained on application rollback: older clients may edit ordinary fields but
-- must not erase metadata introduced by a newer published template.
CREATE FUNCTION preserve_project_template_metadata() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.data ? 'templateRevision' AND (
   NOT NEW.data ? 'templateRevision'
   OR (NEW.data->>'templateRevision') IS NULL
   OR (NEW.data->>'templateRevision')::integer < (OLD.data->>'templateRevision')::integer
 ) THEN RAISE EXCEPTION 'Refresh the project template before editing; pinned template metadata cannot be removed or downgraded'; END IF;
 IF OLD.data ? 'customValues' AND (NOT NEW.data ? 'customValues' OR jsonb_typeof(NEW.data->'customValues') IS DISTINCT FROM 'object') THEN
   RAISE EXCEPTION 'Refresh the project template before editing; custom metadata cannot be discarded';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER retain_project_template_metadata BEFORE UPDATE ON board_room_project FOR EACH ROW EXECUTE FUNCTION preserve_project_template_metadata();
