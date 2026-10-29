-- Preserve all existing values and compatibility projections. Only new grouped
-- writes stop producing an aggregate budget; no project rows are rewritten.
ALTER TABLE project ALTER COLUMN budget TYPE numeric;
-- statement-breakpoint
ALTER TABLE project_expense ALTER COLUMN amount TYPE numeric;
-- statement-breakpoint
CREATE OR REPLACE FUNCTION evolve_project_cost_options_valid(options jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  option_value jsonb;
  item_value jsonb;
  seen_ids text[] := ARRAY[]::text[];
  seen_titles text[] := ARRAY[]::text[];
  option_id text;
  item_id text;
  option_title text;
  item_title text;
  title_key text;
  item_unit text;
  amount_text text;
  item_count integer := 0;
  uuid_pattern constant text := '^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$';
BEGIN
  IF options IS NULL THEN RETURN true; END IF;
  IF jsonb_typeof(options) <> 'array' THEN RETURN false; END IF;
  IF jsonb_array_length(options) > 10 THEN RETURN false; END IF;
  FOR option_value IN SELECT value FROM jsonb_array_elements(options) LOOP
    IF jsonb_typeof(option_value) <> 'object' THEN RETURN false; END IF;
    IF NOT (option_value ?& ARRAY['id','title','items']) OR option_value - ARRAY['id','title','items'] <> '{}'::jsonb THEN RETURN false; END IF;
    IF jsonb_typeof(option_value->'id') <> 'string' OR jsonb_typeof(option_value->'title') <> 'string' OR jsonb_typeof(option_value->'items') <> 'array' THEN RETURN false; END IF;
    option_id := lower(option_value->>'id');
    option_title := evolve_project_cost_title_trim(option_value->>'title');
    title_key := translate(option_title, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz');
    IF option_id !~ uuid_pattern OR option_id = ANY(seen_ids) OR option_title = '' OR length(option_title) > 120 OR (title_key COLLATE "C") = ANY(seen_titles) THEN RETURN false; END IF;
    seen_ids := array_append(seen_ids, option_id);
    seen_titles := array_append(seen_titles, title_key);
    FOR item_value IN SELECT value FROM jsonb_array_elements(option_value->'items') LOOP
      item_count := item_count + 1;
      IF item_count > 50 OR jsonb_typeof(item_value) <> 'object' THEN RETURN false; END IF;
      IF NOT (item_value ?& ARRAY['id','title','unit','amount']) OR item_value - ARRAY['id','title','unit','amount'] <> '{}'::jsonb THEN RETURN false; END IF;
      IF jsonb_typeof(item_value->'id') <> 'string' OR jsonb_typeof(item_value->'title') <> 'string' OR jsonb_typeof(item_value->'unit') <> 'string' OR jsonb_typeof(item_value->'amount') <> 'string' THEN RETURN false; END IF;
      item_id := lower(item_value->>'id');
      item_unit := item_value->>'unit';
      amount_text := item_value->>'amount';
      item_title := evolve_project_cost_title_trim(item_value->>'title');
      IF item_id !~ uuid_pattern OR item_id = ANY(seen_ids) OR item_title = '' OR length(item_title) > 120 OR item_unit NOT IN ('IDR','USD','cUSD/kWh','Rp/kWh') THEN RETURN false; END IF;
      seen_ids := array_append(seen_ids, item_id);
      -- Bound persisted input to PostgreSQL numeric's whole-digit limit.
      -- Amounts stay JSON strings; option totals are computed exactly by the API.
      IF length(amount_text) > 131079 OR length(split_part(amount_text, '.', 1)) > 131072 THEN RETURN false; END IF;
      IF item_unit IN ('IDR','USD') THEN
        IF amount_text !~ '^[0-9]+(\.[0-9]{1,2})?$' THEN RETURN false; END IF;
      ELSE
        IF amount_text !~ '^[0-9]+(\.[0-9]{1,6})?$' THEN RETURN false; END IF;
      END IF;
    END LOOP;
  END LOOP;
  RETURN true;
END;
$$;
-- statement-breakpoint
-- Revalidate the existing JSON against the widened, structurally identical rules.
ALTER TABLE project DROP CONSTRAINT project_cost_options_valid;
-- statement-breakpoint
ALTER TABLE project ADD CONSTRAINT project_cost_options_valid CHECK (evolve_project_cost_options_valid(cost_options));
