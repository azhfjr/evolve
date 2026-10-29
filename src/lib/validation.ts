import {
  projectFields,
  expenseFields,
  savedFilterSchema,
} from "./project-model";
import { z } from "zod";
import { labelsSchema } from "./labels";
import { STATUSES, PRIORITIES } from "./types";
import { taskRangeError } from "./task-range";
import { profileFields, workspaceFields, timeZoneSchema } from "./preferences";
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T12:00:00Z");
    return !Number.isNaN(+d) && d.toISOString().slice(0, 10) === v;
  }, "Enter a valid date");
const short = z.string().trim().min(1).max(200);
const taskValues = z
  .object({
    parentId: z.uuid().nullable().optional(),
    dependencies: z
      .array(z.uuid())
      .max(100)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Choose unique dependencies.",
      )
      .optional(),
    recurrence: z.enum(["daily", "weekly", "monthly"]).nullable().optional(),
    title: short,
    description: z.string().trim().max(20000),
    projectId: z.string().uuid().nullable(),
    status: z.enum(STATUSES),
    priority: z.enum(PRIORITIES),
    assignee: z.string().email().toLowerCase().nullable(),
    startDate: date
      .refine((value) => !value.startsWith("0000-"), "Enter a valid date")
      .nullable()
      .optional(),
    dueDate: date.nullable(),
    dueTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable()
      .optional(),
    dueTimeZone: timeZoneSchema.nullable().optional(),
    labels: labelsSchema.refine(
      (labels) => labels.length === 0,
      "Labels are managed on the project.",
    ),
    checklist: z
      .array(
        z.object({ id: z.string().uuid(), text: short, done: z.boolean() }),
      )
      .max(100)
      .refine(
        (items) => new Set(items.map((i) => i.id)).size === items.length,
        "Checklist items must have unique ids",
      ),
  })
  .strict();
export const taskFields = taskValues.extend({
  description: taskValues.shape.description.default(""),
  projectId: taskValues.shape.projectId.default(null),
  status: taskValues.shape.status.default("todo"),
  priority: taskValues.shape.priority.default("none"),
  assignee: taskValues.shape.assignee.default(null),
  dueDate: taskValues.shape.dueDate.default(null),
  labels: taskValues.shape.labels.default([]),
  checklist: taskValues.shape.checklist.default([]),
});
const baseCommandSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("deleteTask"),
      id: z.uuid(),
      version: z.number().int().positive(),
      idempotencyKey: z.uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal("deleteProject"),
      id: z.uuid(),
      version: z.number().int().positive(),
      idempotencyKey: z.uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal("deleteActivities"),
      ids: z
        .array(z.uuid())
        .min(1)
        .max(100)
        .refine(
          (ids) => new Set(ids).size === ids.length,
          "Choose unique activities.",
        ),
    })
    .strict(),
  z
    .object({ action: z.literal("setLocale"), locale: z.literal("en") })
    .strict(),
  z
    .object({
      action: z.literal("createTask"),
      task: taskFields,
      idempotencyKey: z.uuid().optional(),
      attachmentIds: z
        .array(z.uuid())
        .max(10)
        .refine(
          (ids) => new Set(ids).size === ids.length,
          "Choose unique attachments.",
        )
        .optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("updateTask"),
      id: z.string().uuid(),
      version: z.number().int().positive(),
      patch: taskValues
        .partial()
        .extend({
          archived: z.boolean().optional(),
          labels: z
            .never({ error: "Labels are managed on the project." })
            .optional(),
        })
        .strict()
        .refine(
          (patch) => Object.keys(patch).length > 0,
          "Provide at least one field to update",
        ),
    })
    .strict(),
  z
    .object({
      action: z.literal("updateConnectionLabels"),
      kind: z.enum(["task", "project"]),
      id: z.uuid(),
      version: z.number().int().positive(),
      labels: labelsSchema,
    })
    .strict(),
  projectFields
    .extend({
      action: z.literal("createProject"),
      idempotencyKey: z.uuid().optional(),
    })
    .strict(),
  projectFields
    .extend({
      action: z.literal("updateProject"),
      id: z.uuid(),
      version: z.number().int().positive(),
      labels: labelsSchema.optional(),
    })
    .strict(),
  expenseFields
    .extend({ action: z.literal("addExpense"), idempotencyKey: z.uuid() })
    .strict(),
  z
    .object({
      action: z.literal("setExpenseVoided"),
      id: z.uuid(),
      version: z.number().int().positive(),
      voided: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal("createSavedView"),
      name: z.string().trim().min(1).max(40),
      filters: savedFilterSchema,
    })
    .strict(),
  z.object({ action: z.literal("deleteSavedView"), id: z.uuid() }).strict(),
  z
    .object({
      action: z.literal("revokeMemberSessions"),
      email: z.email().toLowerCase(),
    })
    .strict(),
  z
    .object({
      action: z.literal("inviteMember"),
      email: z.string().trim().email().toLowerCase(),
      name: z.string().trim().min(1).max(80),
    })
    .strict(),
  z
    .object({
      action: z.literal("setMemberAccess"),
      email: z.string().trim().email().toLowerCase(),
      disabled: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal("addComment"),
      taskId: z.string().uuid(),
      body: z.string().trim().min(1).max(5000),
    })
    .strict(),
  z.object({ action: z.literal("readNotifications") }).strict(),
  profileFields
    .extend({
      action: z.literal("updateProfile"),
      version: z.number().int().positive(),
    })
    .strict(),
  workspaceFields
    .extend({
      action: z.literal("updateWorkspace"),
      version: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      action: z.literal("updateMember"),
      email: z.email().toLowerCase(),
      name: z.string().trim().min(1).max(80),
      jobTitle: z.string().trim().max(100),
      version: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      action: z.literal("readNotification"),
      id: z.uuid(),
      read: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal("bulkUpdateTasks"),
      idempotencyKey: z.uuid(),
      items: z
        .array(
          z
            .object({ id: z.uuid(), version: z.number().int().positive() })
            .strict(),
        )
        .min(1)
        .max(100)
        .refine(
          (items) => new Set(items.map((t) => t.id)).size === items.length,
        ),
      patch: taskValues
        .pick({
          status: true,
          priority: true,
          assignee: true,
          projectId: true,
          startDate: true,
          dueDate: true,
          dueTime: true,
        })
        .partial()
        .extend({ archived: z.boolean().optional() })
        .strict()
        .refine((value) => Object.keys(value).length > 0),
    })
    .strict(),
  z
    .object({
      action: z.literal("importTasks"),
      idempotencyKey: z.uuid(),
      tasks: z.array(taskFields).min(1).max(100),
    })
    .strict(),
  z
    .object({
      action: z.literal("saveTemplate"),
      name: z.string().trim().min(1).max(80),
      body: taskFields,
    })
    .strict(),
  z
    .object({
      action: z.literal("archiveTemplate"),
      id: z.uuid(),
      version: z.number().int().positive(),
    })
    .strict(),
]);
export const commandSchema = baseCommandSchema.superRefine(
  (command, context) => {
    const check = (
      value: { startDate?: string | null; dueDate?: string | null },
      path: (string | number)[],
      partial = false,
    ) => {
      // Patches need the stored row to validate omitted dates; the service checks
      // the merged range. Explicit date pairs can fail before touching storage.
      if (
        partial &&
        (value.startDate === undefined || value.dueDate === undefined)
      )
        return;
      const message = taskRangeError(value);
      if (message)
        context.addIssue({
          code: "custom",
          path: [...path, "dueDate"],
          message,
        });
    };
    if (command.action === "createTask") check(command.task, ["task"]);
    else if (command.action === "saveTemplate") check(command.body, ["body"]);
    else if (command.action === "importTasks")
      command.tasks.forEach((task, index) => check(task, ["tasks", index]));
    else if (
      command.action === "updateTask" ||
      command.action === "bulkUpdateTasks"
    )
      check(command.patch, ["patch"], true);
  },
);
export type Command = z.infer<typeof commandSchema>;
