import type { ProjectPayload } from "./model";
export const PROGRESS_REVIEW_DAYS = 30;
export function projectHealth(project: ProjectPayload, now = Date.now()) {
  const missing = [
    !project.category && "category",
    project.codYear === null && "planned COD year",
    project.capacity === null && "capacity",
    !project.unit?.trim() && "capacity unit",
    !project.voltage?.trim() && "voltage",
    !project.location?.trim() && "location",
  ].filter(Boolean) as string[];
  const reviewed = project.progressReviewedAt
    ? Date.parse(project.progressReviewedAt)
    : NaN;
  return {
    missing,
    unassigned: !project.responsible?.trim(),
    stale:
      !project.completed &&
      (!Number.isFinite(reviewed) ||
        now - reviewed > PROGRESS_REVIEW_DAYS * 86400000),
  };
}
export function stageNeedsReason(
  before: number,
  after: number,
  wasCompleted = false,
  completed = false,
) {
  return after < before || after > before + 1 || (wasCompleted && !completed);
}
