import { AppError } from "../permissions";
export const PLANNED_COD_YEARS = Array.from({ length: 15 }, (_, i) => 2026 + i);
/** Read schemas deliberately remain broader to retain historical projects. */
export function assertPlannedCodAssignment(
  year: number | null,
  previous?: number | null,
) {
  if (year === null || year === previous) return;
  if (!Number.isInteger(year) || year < 2026 || year > 2040)
    throw new AppError(
      "Planned COD year must be between 2026 and 2040. Existing historical years may be retained unchanged.",
    );
}
