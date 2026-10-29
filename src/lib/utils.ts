import { format, isToday, isTomorrow, parseISO } from "date-fns";
import type { Task } from "./types";
export function initials(name: string) {
  return name
    .split(/[\s@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}
export function dueLabel(date: string | null) {
  if (!date) return "No due date";
  const parsed = parseISO(date);
  return isToday(parsed)
    ? "Today"
    : isTomorrow(parsed)
      ? "Tomorrow"
      : format(parsed, "MMM d");
}
export function isOverdue(task: Task) {
  return Boolean(
    task.dueDate &&
    task.dueDate < format(new Date(), "yyyy-MM-dd") &&
    task.status !== "done",
  );
}
export function csvExport(tasks: Task[]) {
  const cell = (v: string) =>
    `"${v.replace(/^(?=\s*[=+@\-])|^(?=[\t\r])/, "'").replaceAll('"', '""')}"`;
  return [
    "Title,Status,Priority,Assignee,Due date,Description,Start date",
    ...tasks.map((t) =>
      [
        t.title,
        t.status,
        t.priority,
        t.assignee || "",
        t.dueDate || "",
        t.description,
        t.startDate || "",
      ]
        .map(cell)
        .join(","),
    ),
  ].join("\r\n");
}
