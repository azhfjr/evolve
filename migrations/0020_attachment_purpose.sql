ALTER TABLE attachment ADD COLUMN purpose text CHECK (purpose IS NULL OR purpose IN ('Reference','Meeting Notes','KKP','KKO','KKF','Simulation Files','Other'));
