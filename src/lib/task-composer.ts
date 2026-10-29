import { z } from "zod";
import { taskFields } from "./validation";
import type { Task } from "./types";

export const taskDefaultSchema = taskFields
  .pick({
    projectId: true,
    assignee: true,
    status: true,
    priority: true,
    startDate: true,
    dueDate: true,
    dueTimeZone: true,
  })
  .partial();
const draftSchema = taskFields.extend({
  baseVersion: z.number().int().positive().optional(),
  attachments: z
    .array(
      z.object({
        id: z.uuid(),
        filename: z.string().max(180),
        contentType: z.string().max(150),
        size: z
          .number()
          .int()
          .positive()
          .max(25 * 1024 * 1024),
        ownerEmail: z.email(),
        createdAt: z.string(),
      }),
    )
    .max(10)
    .default([]),
  title: z.string().max(200),
  pendingLabels: z.string().max(330).default(""),
  pendingChecklist: z.string().max(200).default(""),
  requestId: z.uuid().default(() => crypto.randomUUID()),
  pendingChecklistId: z.uuid().default(() => crypto.randomUUID()),
});
export type TaskDraft = z.infer<typeof draftSchema>;
export type TaskDefaults = Partial<
  Pick<
    Task,
    | "projectId"
    | "assignee"
    | "status"
    | "priority"
    | "startDate"
    | "dueDate"
    | "dueTimeZone"
  >
>;

export function initialTaskDraft(
  task: Task | null,
  defaults: TaskDefaults,
): TaskDraft {
  return {
    ...(task ? { baseVersion: task.version } : {}),
    attachments: [],
    title: task?.title ?? "",
    description: task?.description ?? "",
    projectId: task ? task.projectId : (defaults.projectId ?? null),
    assignee: task ? task.assignee : (defaults.assignee ?? null),
    status: task?.status ?? defaults.status ?? "todo",
    priority: task?.priority ?? defaults.priority ?? "none",
    // Preserve absent fields in legacy drafts/idempotent create payloads.
    ...((task ? task.startDate : defaults.startDate) !== undefined
      ? { startDate: task ? task.startDate : defaults.startDate }
      : {}),
    dueDate: task ? task.dueDate : (defaults.dueDate ?? null),
    dueTime: task?.dueTime ?? null,
    dueTimeZone: task?.dueTimeZone ?? defaults.dueTimeZone ?? "Asia/Jakarta",
    parentId: task?.parentId ?? null,
    dependencies: task?.dependencies ?? [],
    recurrence: task?.recurrence ?? null,
    labels: [],
    checklist: task?.checklist ?? [],
    pendingLabels: "",
    pendingChecklist: "",
    requestId: crypto.randomUUID(),
    pendingChecklistId: crypto.randomUUID(),
  };
}

export function taskInputFromDraft(draft: TaskDraft, relationships = false) {
  const {
    baseVersion,
    parentId,
    dependencies,
    pendingLabels,
    pendingChecklist,
    requestId,
    pendingChecklistId,
    attachments,
    labels,
    ...fields
  } = draft;
  void baseVersion;
  void requestId;
  void attachments;
  void parentId;
  void dependencies;
  void labels;
  void pendingLabels;
  return {
    ...fields,
    ...(relationships ? { parentId, dependencies } : {}),
    checklist: pendingChecklist.trim()
      ? [
          ...fields.checklist,
          {
            id: pendingChecklistId,
            text: pendingChecklist.trim(),
            done: false,
          },
        ]
      : fields.checklist,
  };
}

export function taskDraftKey(
  email: string,
  demo: boolean,
  defaults: TaskDefaults,
  taskId?: string,
) {
  if (taskId)
    return `evolve-task-draft-v1:${demo ? "demo" : "workspace"}:${email.toLowerCase()}:task:${taskId}`;
  return `evolve-task-draft-v1:${demo ? "demo" : "workspace"}:${email.toLowerCase()}:${JSON.stringify(
    [
      defaults.projectId ?? null,
      defaults.assignee ?? null,
      defaults.status ?? "todo",
      defaults.priority ?? "none",
      defaults.dueDate ?? null,
      defaults.dueTimeZone ?? "Asia/Jakarta",
      ...(defaults.startDate !== undefined ? [defaults.startDate] : []),
    ],
  )}`;
}

export function parseTaskDraft(
  raw: string | null,
  now = Date.now(),
): TaskDraft | null {
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw);
    if (
      typeof saved.savedAt !== "number" ||
      saved.savedAt > now ||
      now - saved.savedAt > 7 * 86400000
    )
      return null;
    const parsed = draftSchema.safeParse({
      ...saved.draft,
      attachments:
        now - saved.savedAt > 86400000 ? [] : saved.draft.attachments,
      parentId: saved.relationshipsEnabled ? saved.draft.parentId : null,
      dependencies: saved.relationshipsEnabled ? saved.draft.dependencies : [],
      labels: [],
      pendingLabels: "",
    });
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function readTaskDraft(key: string): TaskDraft | null {
  try {
    return parseTaskDraft(window.localStorage.getItem(key));
  } catch {
    return null;
  }
}
export function writeTaskDraft(
  key: string,
  draft: TaskDraft,
  relationshipsEnabled = false,
): boolean {
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({ savedAt: Date.now(), draft, relationshipsEnabled }),
    );
    return true;
  } catch {
    return false;
  }
}
export function removeTaskDraft(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {}
}

export function clearTaskDrafts(email: string, demo: boolean) {
  try {
    const storage = window.localStorage;
    const prefix = `evolve-task-draft-v1:${demo ? "demo" : "workspace"}:${email.toLowerCase()}:`;
    Object.keys(storage)
      .filter((key) => key.startsWith(prefix))
      .forEach((key) => storage.removeItem(key));
  } catch {}
}
