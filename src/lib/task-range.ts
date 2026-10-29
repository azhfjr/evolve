/** Inclusive calendar dates; due-only tasks remain single-day tasks. */
export type TaskRange = { startDate?: string | null; dueDate?: string | null };
export function taskRangeError(task: TaskRange): string | null {
  if (!task.startDate) return null;
  if (!task.dueDate) return "Choose an end date when a start date is set.";
  if (task.startDate > task.dueDate)
    return "End date must be on or after start date.";
  return null;
}
export function taskOccursOn(task: TaskRange, day: string): boolean {
  return Boolean(
    task.dueDate &&
    (task.startDate || task.dueDate) <= day &&
    day <= task.dueDate,
  );
}
/** Keep the original inclusive duration when a recurrence moves its end date. */
export function shiftTaskStartDate(
  task: TaskRange,
  nextEndDate: string,
): string | null {
  if (!task.startDate || !task.dueDate) return null;
  const elapsed =
    +new Date(`${task.dueDate}T12:00:00Z`) -
    +new Date(`${task.startDate}T12:00:00Z`);
  return new Date(+new Date(`${nextEndDate}T12:00:00Z`) - elapsed)
    .toISOString()
    .slice(0, 10);
}
