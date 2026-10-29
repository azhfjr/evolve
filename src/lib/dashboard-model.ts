import { addDays, format, parseISO } from "date-fns";
import type { DashboardReport } from "./workspace-reports";
import type { WorkspaceData, Task } from "./types";
export function demoDashboard(
  data: WorkspaceData,
  days: number,
  now = new Date(),
): DashboardReport {
  const timeZone =
    data.profile?.timeZone || data.settings?.timeZone || "Asia/Jakarta";
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const active = data.tasks.filter((task) => !task.archived);
  const statuses: DashboardReport["statuses"] = {
    backlog: 0,
    todo: 0,
    in_progress: 0,
    review: 0,
    done: 0,
  };
  const priorities: DashboardReport["priorities"] = {
    none: 0,
    low: 0,
    medium: 0,
    high: 0,
    urgent: 0,
  };
  const team = new Map<
    string | null,
    { email: string | null; count: number; overdue: number }
  >();
  for (const task of active) {
    statuses[task.status]++;
    if (task.status !== "done") {
      priorities[task.priority]++;
      const member = team.get(task.assignee) || {
        email: task.assignee,
        count: 0,
        overdue: 0,
      };
      member.count++;
      if (task.dueDate && task.dueDate < today) member.overdue++;
      team.set(task.assignee, member);
    }
  }
  const deadlineBuckets: DashboardReport["deadlineBuckets"] = {
    overdue: 0,
    today: 0,
    future: 0,
    unscheduled: 0,
  };
  for (const task of active.filter((task) => task.status !== "done")) {
    const bucket = !task.dueDate
      ? "unscheduled"
      : task.dueDate < today
        ? "overdue"
        : task.dueDate === today
          ? "today"
          : "future";
    deadlineBuckets[bucket]++;
  }
  const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const created = new Map<string, number>(),
    completed = new Map<string, number>();
  for (const task of data.tasks) {
    const day = dateFormatter.format(new Date(task.createdAt));
    created.set(day, (created.get(day) || 0) + 1);
    if (task.completedAt) {
      const day = dateFormatter.format(new Date(task.completedAt));
      completed.set(day, (completed.get(day) || 0) + 1);
    }
  }
  return {
    timeZone,
    days,
    today,
    totals: {
      total: active.length,
      completed: statuses.done,
      open: active.length - statuses.done,
      overdue: active.filter(
        (task) =>
          task.status !== "done" && task.dueDate && task.dueDate < today,
      ).length,
      unassigned: active.filter(
        (task) => task.status !== "done" && !task.assignee,
      ).length,
    },
    statuses,
    priorities,
    deadlineBuckets,
    attention: {
      overdue: deadlineBuckets.overdue,
      unassigned: active.filter(
        (task) => task.status !== "done" && !task.assignee,
      ).length,
      unscheduled: deadlineBuckets.unscheduled,
    },
    schedule: Array.from({ length: 14 }, (_, index) => {
      const day = format(addDays(parseISO(today), index), "yyyy-MM-dd");
      return {
        day,
        count: active.filter(
          (task) =>
            task.status !== "done" &&
            task.dueDate &&
            (task.startDate || task.dueDate) <= day &&
            task.dueDate >= day,
        ).length,
      };
    }),
    projectProgress: data.projects
      .map((project) => {
        const tasks = active.filter((task) => task.projectId === project.id);
        return {
          id: project.id,
          name: project.name,
          total: tasks.length,
          completed: tasks.filter((task) => task.status === "done").length,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    trend: Array.from({ length: days }, (_, index) => {
      const day = format(
        addDays(parseISO(today), index - days + 1),
        "yyyy-MM-dd",
      );
      return {
        day,
        created: created.get(day) || 0,
        completed: completed.get(day) || 0,
      };
    }),
    workload: [...team.values()].sort(
      (a, b) =>
        b.count - a.count || (a.email || "").localeCompare(b.email || ""),
    ),
    deadlines: active
      .filter((task) => task.status !== "done" && task.dueDate)
      .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
      .slice(0, 6),
  };
}
export function taskHealth(
  project: { status?: string; targetDate?: string | null },
  open: number,
  today: string,
) {
  return project.status === "completed"
    ? "Completed"
    : project.status === "on_hold"
      ? "On hold"
      : project.targetDate && project.targetDate < today && open
        ? "At risk"
        : project.status === "planned"
          ? "Planned"
          : "On track";
}
export type TaskDrilldown = {
  open?: boolean;
  from?: string;
  to?: string;
  dateMode?: "overlap";
  priority?: Task["priority"];
  status?: Task["status"];
  assignee?: string;
  dueBucket?: "overdue" | "today" | "upcoming" | "future" | "unscheduled";
};
