CREATE INDEX board_asset_duplicate_idx ON board_asset(lower(trim(data->>'name')),(data->>'category'),(data->>'location'));
