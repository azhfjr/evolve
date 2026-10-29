-- Legacy rows keep NULL fields; conversion into a General costs group is read-only.
ALTER TABLE project ADD COLUMN category text;
-- statement-breakpoint
ALTER TABLE project ADD COLUMN cost_options jsonb;
-- statement-breakpoint
ALTER TABLE project ADD CONSTRAINT project_category_valid CHECK (category IS NULL OR category IN ('Pembangkit','Transmisi','Gardu Induk'));
-- statement-breakpoint
CREATE FUNCTION evolve_project_cost_options_valid(options jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  option_value jsonb;
  item_value jsonb;
  seen_ids text[] := ARRAY[]::text[];
  seen_titles text[] := ARRAY[]::text[];
  option_id text;
  item_id text;
  option_title text;
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
    option_title := lower(btrim(option_value->>'title'));
    IF option_id !~ uuid_pattern OR option_id = ANY(seen_ids) OR option_title = '' OR length(option_value->>'title') > 120 OR option_title = ANY(seen_titles) THEN RETURN false; END IF;
    seen_ids := array_append(seen_ids, option_id);
    seen_titles := array_append(seen_titles, option_title);
    FOR item_value IN SELECT value FROM jsonb_array_elements(option_value->'items') LOOP
      item_count := item_count + 1;
      IF item_count > 50 OR jsonb_typeof(item_value) <> 'object' THEN RETURN false; END IF;
      IF NOT (item_value ?& ARRAY['id','title','unit','amount']) OR item_value - ARRAY['id','title','unit','amount'] <> '{}'::jsonb THEN RETURN false; END IF;
      IF jsonb_typeof(item_value->'id') <> 'string' OR jsonb_typeof(item_value->'title') <> 'string' OR jsonb_typeof(item_value->'unit') <> 'string' OR jsonb_typeof(item_value->'amount') <> 'string' THEN RETURN false; END IF;
      item_id := lower(item_value->>'id');
      item_unit := item_value->>'unit';
      amount_text := item_value->>'amount';
      IF item_id !~ uuid_pattern OR item_id = ANY(seen_ids) OR btrim(item_value->>'title') = '' OR length(item_value->>'title') > 120 OR item_unit NOT IN ('IDR','USD','cUSD/kWh','Rp/kWh') THEN RETURN false; END IF;
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
ALTER TABLE project ADD CONSTRAINT project_cost_options_valid CHECK (evolve_project_cost_options_valid(cost_options));
