-- Canonical projections must retain Board's historical read range. New/changed
-- Board assignments are constrained by the shared write policy; legacy Locker
-- projects keep their original 2026–2040 constraint.
ALTER TABLE project DROP CONSTRAINT project_planned_cod_year_check,
ADD CONSTRAINT project_planned_cod_year_check CHECK (
  planned_cod_year BETWEEN 2026 AND 2040
  OR (board_project_id IS NOT NULL AND planned_cod_year BETWEEN 1900 AND 2200)
);
