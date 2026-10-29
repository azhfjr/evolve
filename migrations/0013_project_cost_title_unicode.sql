-- Match project-model title.trim().min(1).max(120): ECMAScript whitespace
-- and Unicode code points (Zod 4.6), independent of the database locale.
CREATE FUNCTION evolve_project_cost_title_trim(value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT btrim(value, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
$$;
-- statement-breakpoint
-- The API remains the supported write path and enforces full JavaScript Unicode
-- case-insensitive title uniqueness. SQL rejects exact/ASCII-folded duplicates:
-- locale-dependent lower() can incorrectly reject valid API pairs such as İ/i
-- and Greek contextual sigma. Structural, blank and length checks remain strict.
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
  total_idr numeric := 0;
  total_usd numeric := 0;
  total_cusd numeric := 0;
  total_rp numeric := 0;
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
      IF item_unit IN ('IDR','USD') THEN
        IF amount_text !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$' THEN RETURN false; END IF;
      ELSE
        IF amount_text !~ '^[0-9]{1,12}(\.[0-9]{1,6})?$' THEN RETURN false; END IF;
      END IF;
      CASE item_unit
        WHEN 'IDR' THEN total_idr := total_idr + amount_text::numeric;
        WHEN 'USD' THEN total_usd := total_usd + amount_text::numeric;
        WHEN 'cUSD/kWh' THEN total_cusd := total_cusd + amount_text::numeric;
        WHEN 'Rp/kWh' THEN total_rp := total_rp + amount_text::numeric;
      END CASE;
    END LOOP;
  END LOOP;
  RETURN total_idr <= 999999999999.99 AND total_usd <= 999999999999.99 AND total_cusd <= 999999999999.999999 AND total_rp <= 999999999999.999999;
END;
$$;
-- statement-breakpoint
-- Recheck existing rows with the replacement function. No project data changes;
-- any invalid direct SQL record aborts the migration transaction intact.
ALTER TABLE project DROP CONSTRAINT project_cost_options_valid;
-- statement-breakpoint
ALTER TABLE project ADD CONSTRAINT project_cost_options_valid CHECK (evolve_project_cost_options_valid(cost_options));
