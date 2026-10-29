import {
  projectFields,
  projectCostFields,
  legacyProjectCostEditConflict,
} from "./project-model";
import type { Command } from "./validation";
import { readProjectLabels } from "./labels";
import { refreshDemoLabels } from "./project-labels";
import { nextRecurrenceDate } from "./recurrence";
import { taskRangeError, shiftTaskStartDate } from "./task-range";
import {
  DEFAULT_WORKSPACE,
  defaultProfile,
  preferenceSchema,
  workspaceConfigurationSchema,
} from "./preferences";
import type {
  WorkspaceData,
  Task,
  Comment,
  Activity,
  Project,
  Member,
} from "./types";
const key = "evolve-demo-v1";
export function saveDemo(data: WorkspaceData) {
  localStorage.setItem(key, JSON.stringify(data));
}
export function getSavedDemo(): WorkspaceData | null {
  try {
    const data = JSON.parse(localStorage.getItem(key) || "null");
    if (data?.tasks && data?.actor && data?.projects) {
      data.settings = {
        ...DEFAULT_WORKSPACE,
        ...data.settings,
        configuration: workspaceConfigurationSchema.parse(
          data.settings?.configuration || {},
        ),
      };
      data.profile = {
        ...defaultProfile(data.actor.name),
        ...data.profile,
        preferences: preferenceSchema.parse({
          ...data.profile?.preferences,
          locale: "en",
        }),
      };
      data.projects = data.projects.map((project: Project) => ({
        ...projectFields.parse({
          ...project,
          labels: readProjectLabels(project.labels || []),
          costItems: project.costItems ?? undefined,
        }),
        ...project,
        version: project.version || 1,
        spent: project.spent || "0.00",
        expenseCount: project.expenseCount || 0,
      }));
      return refreshDemoLabels(data);
    }
  } catch {}
  return null;
}
export function resetDemo() {
  localStorage.removeItem(key);
  localStorage.removeItem(key + "-comments");
}
export function demoDiscussion(id: string): {
  comments: Comment[];
  activities: Activity[];
} {
  const all: Comment[] = JSON.parse(
    localStorage.getItem(key + "-comments") || "[]",
  );
  return { comments: all.filter((c) => c.taskId === id), activities: [] };
}
export function demoCommand(
  data: WorkspaceData,
  cmd: Command,
  persist = true,
): { data: WorkspaceData; result: Record<string, unknown> } {
  if (["addExpense", "setExpenseVoided"].includes(cmd.action))
    throw new Error(
      "Expense recording has been retired. Historical records are retained.",
    );
  let next = structuredClone(data);
  const now = new Date().toISOString();
  let result: Record<string, unknown> = { ok: true };
  let message = "";
  let taskId: string | null = null;
  switch (cmd.action) {
    case "deleteTask": {
      if (!next.actor.isAdmin)
        throw new Error("Only the administrator can delete tasks.");
      const task = next.tasks.find((item) => item.id === cmd.id);
      if (task && task.version !== cmd.version)
        throw new Error("This task changed. Reopen it before deleting.");
      next.tasks = next.tasks
        .filter((item) => item.id !== cmd.id)
        .map((item) => {
          const linked =
            item.parentId === cmd.id ||
            item.recurrenceSourceId === cmd.id ||
            item.dependencies?.includes(cmd.id);
          return linked
            ? {
                ...item,
                parentId: item.parentId === cmd.id ? null : item.parentId,
                recurrenceSourceId:
                  item.recurrenceSourceId === cmd.id
                    ? null
                    : item.recurrenceSourceId,
                dependencies: item.dependencies?.filter((id) => id !== cmd.id),
                version: item.version + 1,
                updatedAt: now,
              }
            : item;
        });
      next.notifications = next.notifications.filter(
        (item) => item.taskId !== cmd.id,
      );
      next.activities = next.activities.map((item) =>
        item.taskId === cmd.id ? { ...item, taskId: null } : item,
      );
      if (persist) {
        const all: Comment[] = JSON.parse(
          localStorage.getItem(key + "-comments") || "[]",
        );
        localStorage.setItem(
          key + "-comments",
          JSON.stringify(all.filter((item) => item.taskId !== cmd.id)),
        );
      }
      result = { deletedTaskId: cmd.id, ok: true };
      if (task) message = `deleted “${task.title}”`;
      break;
    }
    case "deleteProject": {
      if (!next.actor.isAdmin)
        throw new Error("Only the administrator can delete projects.");
      const project = next.projects.find((item) => item.id === cmd.id);
      if (project && (project.version || 1) !== cmd.version)
        throw new Error("This project changed. Reopen it before deleting.");
      next.projects = next.projects.filter((item) => item.id !== cmd.id);
      next.tasks = next.tasks.map((item) =>
        item.projectId === cmd.id
          ? {
              ...item,
              projectId: null,
              version: item.version + 1,
              updatedAt: now,
            }
          : item,
      );
      next.expenses = next.expenses?.filter(
        (item) => item.projectId !== cmd.id,
      );
      next.activities = next.activities.map((item) =>
        item.projectId === cmd.id ? { ...item, projectId: null } : item,
      );
      result = { deletedProjectId: cmd.id, ok: true };
      if (project)
        message = `deleted the ${project.name} project; tasks kept in No project`;
      break;
    }
    case "deleteActivities": {
      if (!next.actor.isAdmin)
        throw new Error("Only the administrator can remove activities.");
      const ids = next.activities
        .filter((a) => cmd.ids.includes(a.id))
        .map((a) => a.id);
      next.activities = next.activities.filter((a) => !cmd.ids.includes(a.id));
      result = { deletedActivityIds: ids, ok: true };
      break;
    }
    case "setLocale": {
      next.profile = {
        ...(next.profile || defaultProfile(next.actor.name)),
        preferences: {
          ...(next.profile || defaultProfile(next.actor.name)).preferences,
          locale: cmd.locale,
        },
      };
      result = { profile: next.profile };
      break;
    }
    case "bulkUpdateTasks": {
      const tasks: Task[] = [];
      for (const item of cmd.items) {
        const changed = demoCommand(
          next,
          { action: "updateTask", ...item, patch: cmd.patch },
          false,
        );
        next = changed.data;
        tasks.push(
          ...((changed.result.tasks as Task[] | undefined) || [
            changed.result.task as Task,
          ]),
        );
      }
      result = { tasks };
      break;
    }
    case "importTasks": {
      const tasks: Task[] = [];
      for (const task of cmd.tasks) {
        const created = demoCommand(
          next,
          { action: "createTask", task },
          false,
        );
        next = created.data;
        tasks.push(created.result.task as Task);
      }
      result = { tasks };
      break;
    }
    case "saveTemplate": {
      const template = {
        id: crypto.randomUUID(),
        name: cmd.name,
        body: cmd.body,
        ownerEmail: next.actor.email,
        version: 1,
      };
      next.templates = [...(next.templates || []), template];
      result = { template };
      break;
    }
    case "archiveTemplate": {
      const template = next.templates?.find((t) => t.id === cmd.id);
      if (!template || template.version !== cmd.version)
        throw new Error("Template telah berubah.");
      if (!next.actor.isAdmin && template.ownerEmail !== next.actor.email)
        throw new Error(
          "Hanya pembuat atau admin yang dapat mengarsipkan template.",
        );
      next.templates = next.templates?.filter((t) => t.id !== cmd.id);
      break;
    }
    case "updateProfile": {
      const { action: _, version, ...fields } = cmd;
      void _;
      next.profile = {
        ...fields,
        preferences: {
          ...fields.preferences,
          locale: "en",
        },
        version: version + 1,
      };
      next.actor = {
        ...next.actor,
        name: fields.name,
        image: fields.avatarId
          ? `/api/attachments/${fields.avatarId}/content`
          : null,
      };
      next.members = next.members.map((m) =>
        m.email === next.actor.email
          ? {
              ...m,
              name: fields.name,
              jobTitle: fields.jobTitle,
              bio: fields.bio,
              timeZone: fields.timeZone,
              avatarId: fields.avatarId,
              version: version + 1,
            }
          : m,
      );
      result = { profile: next.profile };
      break;
    }
    case "updateWorkspace": {
      const { action: _, version, ...fields } = cmd;
      void _;
      next.settings = { ...DEFAULT_WORKSPACE, ...fields, version: version + 1 };
      result = { settings: next.settings };
      break;
    }
    case "updateMember": {
      next.members = next.members.map((m) =>
        m.email === cmd.email
          ? {
              ...m,
              name: cmd.name,
              jobTitle: cmd.jobTitle,
              version: cmd.version + 1,
            }
          : m,
      );
      if (cmd.email === next.actor.email) {
        next.actor.name = cmd.name;
        next.profile = {
          ...(next.profile || defaultProfile(cmd.name)),
          name: cmd.name,
          version: cmd.version + 1,
        };
      }
      result = { member: next.members.find((m) => m.email === cmd.email) };
      break;
    }
    case "readNotification": {
      next.notifications = next.notifications.map((n) =>
        n.id === cmd.id ? { ...n, read: cmd.read } : n,
      );
      break;
    }
    case "createTask": {
      const rangeError = taskRangeError(cmd.task);
      if (rangeError) throw new Error(rangeError);
      const task: Task = {
        ...cmd.task,
        dueTimeZone: cmd.task.dueTime
          ? cmd.task.dueTimeZone || next.profile?.timeZone || "Asia/Jakarta"
          : null,
        id: crypto.randomUUID(),
        version: 1,
        createdBy: data.actor.email,
        createdAt: now,
        updatedAt: now,
        completedAt: cmd.task.status === "done" ? now : null,
        archived: false,
        recurrenceAnchorDay: cmd.task.recurrence
          ? Number(cmd.task.dueDate?.slice(8, 10))
          : null,
      };
      next.tasks.unshift(task);
      result = { task };
      message = `created “${task.title}”`;
      taskId = task.id;
      break;
    }
    case "updateTask": {
      const task = next.tasks.find((t) => t.id === cmd.id);
      if (!task) throw new Error("Task not found");
      if (task.version !== cmd.version)
        throw new Error(
          "This task changed. Reopen it to use the latest version.",
        );
      const rangeError = taskRangeError({
        startDate:
          cmd.patch.startDate === undefined
            ? task.startDate
            : cmd.patch.startDate,
        dueDate:
          cmd.patch.dueDate === undefined ? task.dueDate : cmd.patch.dueDate,
      });
      if (rangeError) throw new Error(rangeError);
      const wasDone = task.status === "done";
      const previousDate = task.dueDate;
      const previousRecurrence = task.recurrence;
      Object.assign(task, cmd.patch, {
        version: task.version + 1,
        updatedAt: now,
      });
      if (task.recurrence) {
        if (
          (cmd.patch.dueDate !== undefined &&
            cmd.patch.dueDate !== previousDate) ||
          (cmd.patch.recurrence !== undefined &&
            cmd.patch.recurrence !== previousRecurrence) ||
          !task.recurrenceAnchorDay
        )
          task.recurrenceAnchorDay = Number(task.dueDate?.slice(8, 10));
      } else task.recurrenceAnchorDay = null;
      if (cmd.patch.status)
        task.completedAt = cmd.patch.status === "done" ? now : null;
      result = { task };
      if (
        task.status === "done" &&
        !wasDone &&
        task.recurrence &&
        task.dueDate &&
        !next.tasks.some((t) => t.recurrenceSourceId === task.id)
      ) {
        const nextDueDate = nextRecurrenceDate(
          task.dueDate,
          task.recurrence,
          task.recurrenceAnchorDay || undefined,
        );
        const spawned = demoCommand(
          next,
          {
            action: "createTask",
            task: {
              title: task.title,
              description: task.description,
              projectId: task.projectId,
              status: "todo",
              priority: task.priority,
              assignee: task.assignee,
              ...(task.startDate
                ? { startDate: shiftTaskStartDate(task, nextDueDate) }
                : {}),
              dueDate: nextDueDate,
              dueTime: task.dueTime,
              dueTimeZone: task.dueTimeZone,
              recurrence: task.recurrence,
              labels: [],
              checklist: task.checklist.map((item) => ({
                ...item,
                id: crypto.randomUUID(),
                done: false,
              })),
            },
          },
          false,
        );
        next = spawned.data;
        const nextTask = next.tasks.find(
          (t) => t.id === (spawned.result.task as Task).id,
        )!;
        nextTask.recurrenceSourceId = task.id;
        nextTask.recurrenceAnchorDay = task.recurrenceAnchorDay;
        result = { task, tasks: [task, nextTask] };
      }
      message = `updated “${task.title}”`;
      taskId = task.id;
      break;
    }
    case "createProject": {
      if (!next.actor.isAdmin)
        throw new Error("Only the administrator can create projects.");
      const { action: _, idempotencyKey: __, ...input } = cmd;
      const fields = projectCostFields(input);
      void _;
      void __;
      const project: Project = {
        ...fields,
        id: crypto.randomUUID(),
        createdAt: now,
        version: 1,
        spent: "0.00",
        expenseCount: 0,
      };
      next.projects.push(project);
      result = { project };
      message = `created the ${project.name} project`;
      break;
    }
    case "updateConnectionLabels": {
      if (cmd.kind === "task")
        throw new Error(
          "Labels are inherited from projects. Edit labels on the project instead.",
        );
      if (cmd.kind === "project" && !next.actor.isAdmin)
        throw new Error("Only the administrator can edit project labels.");
      const entity =
        cmd.kind === "project"
          ? next.projects.find((item) => item.id === cmd.id)
          : next.tasks.find((item) => item.id === cmd.id);
      if (!entity) throw new Error("This item no longer exists.");
      if ((entity.version || 1) !== cmd.version)
        throw new Error(
          "These labels changed. Reload the current labels before saving.",
        );
      entity.labels = cmd.labels;
      entity.version = cmd.version + 1;
      result = cmd.kind === "project" ? { project: entity } : { task: entity };
      message = "updated connection labels";
      break;
    }
    case "updateProject": {
      if (!next.actor.isAdmin)
        throw new Error("Only the administrator can edit projects.");
      const project = next.projects.find((project) => project.id === cmd.id);
      if (!project) throw new Error("Project not found.");
      if ((project.version || 1) !== cmd.version)
        throw new Error("Project settings changed. Reload before saving.");
      const { action: _, id: __, version, ...fields } = cmd;
      void _;
      void __;
      const costFields = projectCostFields(fields);
      if (legacyProjectCostEditConflict(project, costFields))
        throw new Error("Project costs changed. Reload before changing costs.");
      Object.assign(
        project,
        Object.fromEntries(
          Object.entries(costFields).filter(([, value]) => value !== undefined),
        ),
        {
          version: version + 1,
        },
      );
      result = { project };
      message = `updated the ${project.name} project`;
      break;
    }
    case "addExpense":
    case "setExpenseVoided":
      throw new Error(
        "Expense recording has been retired. Historical records are retained.",
      );
    case "createSavedView": {
      if ((next.savedViews || []).some((view) => view.name === cmd.name))
        throw new Error("You already have a saved view with this name.");
      const savedView = {
        id: crypto.randomUUID(),
        name: cmd.name,
        filters: cmd.filters,
      };
      next.savedViews = [...(next.savedViews || []), savedView];
      result = { savedView };
      break;
    }
    case "deleteSavedView": {
      next.savedViews = next.savedViews?.filter((view) => view.id !== cmd.id);
      result = { deletedViewId: cmd.id };
      break;
    }
    case "revokeMemberSessions": {
      result = { ok: true };
      break;
    }
    case "inviteMember": {
      const member: Member = {
        email: cmd.email,
        name: cmd.name,
        color: "blue",
        disabled: false,
      };
      next.members = next.members
        .filter((m) => m.email !== cmd.email)
        .concat(member);
      result = { member };
      message = `granted workspace access to ${member.email}`;
      break;
    }
    case "setMemberAccess": {
      next.members = next.members.map((m) =>
        m.email === cmd.email ? { ...m, disabled: cmd.disabled } : m,
      );
      result = { member: next.members.find((m) => m.email === cmd.email) };
      break;
    }
    case "readNotifications":
      next.notifications = next.notifications.map((n) => ({
        ...n,
        read: true,
      }));
      break;
    case "addComment": {
      const comment: Comment = {
        id: crypto.randomUUID(),
        taskId: cmd.taskId,
        author: data.actor.email,
        body: cmd.body,
        createdAt: now,
      };
      const all: Comment[] = JSON.parse(
        localStorage.getItem(key + "-comments") || "[]",
      );
      localStorage.setItem(
        key + "-comments",
        JSON.stringify([...all, comment]),
      );
      result = { comment };
      message = "added a comment";
      taskId = cmd.taskId;
      break;
    }
  }
  if (message)
    next.activities.unshift({
      id: crypto.randomUUID(),
      actor: data.actor.email,
      taskId,
      message,
      createdAt: now,
    });
  next = { ...next, activities: next.activities.slice(0, 100) };
  if (cmd.action === "createTask" || cmd.action === "updateTask") {
    const task = result.task as Task;
    if (task.recurrence && !task.dueDate)
      throw new Error("Task berulang memerlukan tenggat.");
  }
  refreshDemoLabels(next);
  if (persist) saveDemo(next);
  return { data: next, result };
}
export async function apiCommand(
  cmd: Command,
): Promise<Record<string, unknown>> {
  const res = await fetch("/api/workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const result = await res.json();
  if (!res.ok)
    throw new Error(result.error || "Something went wrong. Please try again.");
  return result;
}
