ALTER TABLE project ADD COLUMN planned_cod_year integer
  CONSTRAINT project_planned_cod_year_check CHECK (planned_cod_year BETWEEN 2026 AND 2040);
